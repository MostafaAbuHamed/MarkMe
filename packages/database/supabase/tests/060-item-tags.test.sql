begin;
\ir helpers/identity.psql
select plan(8);

select pg_temp.authenticate_as(pg_temp.user_a());

insert into public.items (url, normalized_url)
values ('https://example.com/a', 'https://example.com/a');

insert into public.tags (name) values ('A tag');

select pg_temp.authenticate_as(pg_temp.user_b());

insert into public.items (url, normalized_url)
values ('https://example.com/b', 'https://example.com/b');

insert into public.tags (name) values ('B tag');

-- B's ids are read back as postgres: A cannot see B's item or tag.
select pg_temp.reset_identity();

create function pg_temp.b_item_id()
returns uuid
language sql
security definer
set search_path = ''
as $fn$
  select id from public.items where user_id = pg_temp.user_b()
$fn$;

create function pg_temp.b_tag_id()
returns uuid
language sql
security definer
set search_path = ''
as $fn$
  select id from public.tags where user_id = pg_temp.user_b()
$fn$;

select pg_temp.authenticate_as(pg_temp.user_a());

select lives_ok(
  $$insert into public.item_tags (item_id, tag_id)
    values (
      (select id from public.items where url = 'https://example.com/a'),
      (select id from public.tags where name = 'A tag')
    )$$,
  'A links their own item and their own tag'
);

select ok(
  (
    select
      item_id = (select id from public.items where url = 'https://example.com/a')
      and tag_id = (select id from public.tags where name = 'A tag')
    from public.item_tags
  ),
  'A sees the link between their item and their tag'
);

select pg_temp.authenticate_as(pg_temp.user_b());

select is(
  (select count(*) from public.item_tags),
  0::bigint,
  'B sees 0 links'
);

select pg_temp.authenticate_as(pg_temp.user_a());

select throws_ok(
  $$insert into public.item_tags (item_id, tag_id)
    values (
      (select id from public.items where url = 'https://example.com/a'),
      pg_temp.b_tag_id()
    )$$,
  '42501',
  null,
  'A linking their own item with B''s tag is denied'
);

select throws_ok(
  $$insert into public.item_tags (item_id, tag_id)
    values (
      pg_temp.b_item_id(),
      (select id from public.tags where name = 'A tag')
    )$$,
  '42501',
  null,
  'A linking B''s item with their own tag is denied'
);

select pg_temp.authenticate_as(pg_temp.user_b());

with deleted as (
  delete from public.item_tags
  returning item_id
)
select is(
  (select count(*) from deleted),
  0::bigint,
  'B deleting A''s link affects 0 rows'
);

select pg_temp.authenticate_as(pg_temp.user_a());

select throws_ok(
  $$update public.item_tags set tag_id = gen_random_uuid()
    where item_id = (select id from public.items where url = 'https://example.com/a')$$,
  '42501',
  null,
  'updating a link is denied'
);

select pg_temp.authenticate_anon();

select throws_ok(
  'select item_id from public.item_tags',
  '42501',
  null,
  'anon select on item_tags is denied'
);

select * from finish();
rollback;
