begin;
\ir helpers/identity.psql
select plan(29);

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

-- FR-018: deleting an item removes its links and leaves the tags.

select pg_temp.authenticate_as(pg_temp.user_a());

select lives_ok(
  $$insert into public.tags (name) values ('Kept one'), ('Kept two')$$,
  'A creates two tags for an item'
);

select lives_ok(
  $$insert into public.items (url, normalized_url)
    values ('https://example.com/linked', 'https://example.com/linked')$$,
  'A creates an item with two tags'
);

select lives_ok(
  $$insert into public.item_tags (item_id, tag_id)
    select i.id, t.id
    from public.items as i
    cross join public.tags as t
    where i.url = 'https://example.com/linked'
      and t.name in ('Kept one', 'Kept two')$$,
  'A links the item to both tags'
);

select lives_ok(
  $$delete from public.items where url = 'https://example.com/linked'$$,
  'A deletes the item with two tags'
);

select is(
  (
    select count(*)
    from public.item_tags
    where tag_id in (
      select id from public.tags where name in ('Kept one', 'Kept two')
    )
  ),
  0::bigint,
  'deleting the item removes its links'
);

select is(
  (select count(*) from public.tags where name in ('Kept one', 'Kept two')),
  2::bigint,
  'both tags still exist after the item delete'
);

-- FR-019: deleting the account removes that user's rows and leaves the other user.

select lives_ok(
  $$insert into public.folders (name) values ('A folder')$$,
  'A creates a folder before the account delete'
);

select pg_temp.authenticate_as(pg_temp.user_b());

select lives_ok(
  $$insert into public.folders (name) values ('B folder')$$,
  'B creates a folder before A is deleted'
);

select lives_ok(
  $$insert into public.item_tags (item_id, tag_id)
    values (
      (select id from public.items where url = 'https://example.com/b'),
      (select id from public.tags where name = 'B tag')
    )$$,
  'B links their item and tag before A is deleted'
);

select pg_temp.reset_identity();

create temp table a_item_ids as
select id
from public.items
where user_id = pg_temp.user_a();

create temp table a_tag_ids as
select id
from public.tags
where user_id = pg_temp.user_a();

-- Without rows to delete, the 0-row checks below would prove nothing.
select ok(
  (select count(*) from public.profiles where id = pg_temp.user_a()) = 1
    and (select count(*) from public.folders where user_id = pg_temp.user_a()) > 0
    and (select count(*) from a_tag_ids) > 0
    and (select count(*) from a_item_ids) > 0
    and (
      select count(*)
      from public.item_tags
      where item_id in (select id from a_item_ids)
    ) > 0,
  'A has rows in every table before the account delete'
);

select lives_ok(
  $$delete from auth.users where id = pg_temp.user_a()$$,
  'postgres deletes user A'
);

select is(
  (select count(*) from public.profiles where id = pg_temp.user_a()),
  0::bigint,
  'deleting A leaves 0 profiles rows for A'
);

select is(
  (select count(*) from public.folders where user_id = pg_temp.user_a()),
  0::bigint,
  'deleting A leaves 0 folders rows for A'
);

select is(
  (select count(*) from public.tags where user_id = pg_temp.user_a()),
  0::bigint,
  'deleting A leaves 0 tags rows for A'
);

select is(
  (select count(*) from public.items where user_id = pg_temp.user_a()),
  0::bigint,
  'deleting A leaves 0 items rows for A'
);

select is(
  (
    select count(*)
    from public.item_tags
    where item_id in (select id from a_item_ids)
      or tag_id in (select id from a_tag_ids)
  ),
  0::bigint,
  'deleting A leaves 0 item_tags rows for A'
);

select is(
  (select count(*) from public.profiles where id = pg_temp.user_b()),
  1::bigint,
  'B''s profile stays'
);

select is(
  (select count(*) from public.folders where user_id = pg_temp.user_b()),
  1::bigint,
  'B''s folder stays'
);

select is(
  (select count(*) from public.tags where user_id = pg_temp.user_b()),
  1::bigint,
  'B''s tag stays'
);

select is(
  (select count(*) from public.items where user_id = pg_temp.user_b()),
  1::bigint,
  'B''s item stays'
);

select is(
  (
    select count(*)
    from public.item_tags
    where item_id = (select id from public.items where user_id = pg_temp.user_b())
      and tag_id = (select id from public.tags where user_id = pg_temp.user_b())
  ),
  1::bigint,
  'B''s item_tags row stays'
);

select * from finish();
rollback;
