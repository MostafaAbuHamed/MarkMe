begin;
\ir helpers/identity.psql
select plan(16);

-- Part 1: search vector upkeep. Match with to_tsquery('simple', …), run as A.
-- now() is fixed for this transaction, so postgres backdates updated_at before the
-- tag link. That write does not fire items_set_updated_at.

select pg_temp.authenticate_as(pg_temp.user_a());

insert into public.items (url, normalized_url, title, description, note)
values (
  'https://example.com/react-hooks?x=1',
  'https://example.com/react-hooks?x=1',
  'Pineapple recipe',
  'Citrus overview',
  'Personal reminder'
);

select ok(
  (
    select search_vector @@ to_tsquery('simple', 'pineapple')
    from public.items
    where url = 'https://example.com/react-hooks?x=1'
  ),
  'a new item matches a word from its title'
);

select ok(
  (
    select search_vector @@ to_tsquery('simple', 'citrus')
    from public.items
    where url = 'https://example.com/react-hooks?x=1'
  ),
  'a new item matches a word from its description'
);

select ok(
  (
    select search_vector @@ to_tsquery('simple', 'reminder')
    from public.items
    where url = 'https://example.com/react-hooks?x=1'
  ),
  'a new item matches a word from its note'
);

select ok(
  (
    select search_vector @@ to_tsquery('simple', 'react')
    from public.items
    where url = 'https://example.com/react-hooks?x=1'
  ),
  'a new item url matches react'
);

select ok(
  (
    select search_vector @@ to_tsquery('simple', 'hooks')
    from public.items
    where url = 'https://example.com/react-hooks?x=1'
  ),
  'a new item url matches hooks'
);

select ok(
  (
    select search_vector @@ to_tsquery('simple', 'example')
    from public.items
    where url = 'https://example.com/react-hooks?x=1'
  ),
  'a new item url matches example'
);

update public.items
set title = 'Mango recipe'
where url = 'https://example.com/react-hooks?x=1';

select ok(
  (
    select search_vector @@ to_tsquery('simple', 'mango')
    from public.items
    where url = 'https://example.com/react-hooks?x=1'
  ),
  'editing the title makes the new word match'
);

select is(
  (
    select search_vector @@ to_tsquery('simple', 'pineapple')
    from public.items
    where url = 'https://example.com/react-hooks?x=1'
  ),
  false,
  'editing the title removes the old word'
);

insert into public.tags (name) values ('Sourdough');

select pg_temp.reset_identity();

update public.items
set updated_at = now() - interval '1 day'
where url = 'https://example.com/react-hooks?x=1';

select pg_temp.authenticate_as(pg_temp.user_a());

select lives_ok(
  $$insert into public.item_tags (item_id, tag_id)
    values (
      (select id from public.items where url = 'https://example.com/react-hooks?x=1'),
      (select id from public.tags where name = 'Sourdough')
    )$$,
  'linking a tag as authenticated succeeds'
);

select ok(
  (
    select search_vector @@ to_tsquery('simple', 'sourdough')
    from public.items
    where url = 'https://example.com/react-hooks?x=1'
  ),
  'linking a tag makes the tag name match'
);

select is(
  (select updated_at from public.items where url = 'https://example.com/react-hooks?x=1'),
  now() - interval '1 day',
  'linking a tag does not change updated_at'
);

delete from public.item_tags
where item_id = (
  select id from public.items where url = 'https://example.com/react-hooks?x=1'
);

select is(
  (
    select search_vector @@ to_tsquery('simple', 'sourdough')
    from public.items
    where url = 'https://example.com/react-hooks?x=1'
  ),
  false,
  'unlinking a tag removes the tag name'
);

insert into public.item_tags (item_id, tag_id)
values (
  (select id from public.items where url = 'https://example.com/react-hooks?x=1'),
  (select id from public.tags where name = 'Sourdough')
);

update public.tags
set name = 'Baguette'
where name = 'Sourdough';

select is(
  (
    select search_vector @@ to_tsquery('simple', 'sourdough')
    from public.items
    where url = 'https://example.com/react-hooks?x=1'
  ),
  false,
  'renaming a tag removes the old name'
);

select ok(
  (
    select search_vector @@ to_tsquery('simple', 'baguette')
    from public.items
    where url = 'https://example.com/react-hooks?x=1'
  ),
  'renaming a tag makes the new name match'
);

delete from public.tags where name = 'Baguette';

select is(
  (
    select search_vector @@ to_tsquery('simple', 'baguette')
    from public.items
    where url = 'https://example.com/react-hooks?x=1'
  ),
  false,
  'deleting a tag removes the tag name'
);

insert into public.items (url, normalized_url, title)
values ('https://example.com/arabic', 'https://example.com/arabic', 'كتاب');

select ok(
  (
    select search_vector @@ to_tsquery('simple', 'كتاب')
    from public.items
    where url = 'https://example.com/arabic'
  ),
  'an Arabic title word matches unstemmed'
);

select * from finish();
rollback;
