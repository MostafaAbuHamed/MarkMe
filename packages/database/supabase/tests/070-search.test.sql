begin;
\ir helpers/identity.psql
select plan(70);

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

-- Part 2: search behavior. Part 1 rows are removed so the collection size is exact.
-- 50 items for A: 25 in Paging, 23 other rows, and 2 with the same created_at.
-- rank_desc is newer than rank_title, so pineapple order has to come from rank.
-- Tag ids are ordered opposite lower(name): Maple is the lower id, cedar sorts first.
-- URLs use number segments so they do not add the lexemes a or b.

select pg_temp.reset_identity();

delete from public.items
where user_id in (pg_temp.user_a(), pg_temp.user_b());

delete from public.tags
where user_id in (pg_temp.user_a(), pg_temp.user_b());

delete from public.folders
where user_id in (pg_temp.user_a(), pg_temp.user_b());

create temp table search_fixture (
  key text primary key,
  id uuid not null unique
);

insert into search_fixture (key, id)
select
  'page_' || lpad(n::text, 2, '0'),
  ('c0000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid
from generate_series(1, 25) as n;

insert into search_fixture (key, id)
values
  ('rank_title', 'e0000000-0000-0000-0000-000000000001'),
  ('rank_desc', 'e0000000-0000-0000-0000-000000000002'),
  ('saffron', 'e0000000-0000-0000-0000-000000000003'),
  ('quinoa', 'e0000000-0000-0000-0000-000000000004'),
  ('webpack', 'e0000000-0000-0000-0000-000000000005'),
  ('react_hooks', 'e0000000-0000-0000-0000-000000000006'),
  ('react_only', 'e0000000-0000-0000-0000-000000000007'),
  ('words_ab', 'e0000000-0000-0000-0000-000000000008'),
  ('word_a', 'e0000000-0000-0000-0000-000000000009'),
  ('word_b', 'e0000000-0000-0000-0000-000000000010'),
  ('trees', 'e0000000-0000-0000-0000-000000000011'),
  ('evergreen', 'e0000000-0000-0000-0000-000000000012'),
  ('syrup', 'e0000000-0000-0000-0000-000000000013'),
  ('soup', 'e0000000-0000-0000-0000-000000000014'),
  ('stew', 'e0000000-0000-0000-0000-000000000015'),
  ('orphan', 'e0000000-0000-0000-0000-000000000016'),
  ('bread', 'e0000000-0000-0000-0000-000000000017'),
  ('padding_1', 'e0000000-0000-0000-0000-000000000018'),
  ('padding_2', 'e0000000-0000-0000-0000-000000000019'),
  ('padding_3', 'e0000000-0000-0000-0000-000000000020'),
  ('padding_4', 'e0000000-0000-0000-0000-000000000021'),
  ('padding_5', 'e0000000-0000-0000-0000-000000000022'),
  ('padding_6', 'e0000000-0000-0000-0000-000000000023'),
  ('tie_low', 'd0000000-0000-0000-0000-000000000001'),
  ('tie_high', 'd0000000-0000-0000-0000-000000000002'),
  ('b_pineapple', 'b0000000-0000-0000-0000-000000000001'),
  ('b_react', 'b0000000-0000-0000-0000-000000000002');

grant select on search_fixture to authenticated;

insert into public.folders (id, user_id, name)
values
  (
    '11111111-1111-1111-1111-111111111111',
    pg_temp.user_a(),
    'Paging'
  ),
  (
    '22222222-2222-2222-2222-222222222222',
    pg_temp.user_a(),
    'Recipes'
  ),
  (
    '33333333-3333-3333-3333-333333333333',
    pg_temp.user_a(),
    'Doomed'
  );

insert into public.tags (id, user_id, name)
values
  (
    'aaaaaaaa-0000-0000-0000-000000000001',
    pg_temp.user_a(),
    'Maple'
  ),
  (
    'aaaaaaaa-0000-0000-0000-000000000002',
    pg_temp.user_a(),
    'cedar'
  ),
  (
    'aaaaaaaa-0000-0000-0000-000000000003',
    pg_temp.user_a(),
    'Saffron'
  ),
  (
    'aaaaaaaa-0000-0000-0000-000000000004',
    pg_temp.user_a(),
    'Sourdough'
  ),
  (
    'aaaaaaaa-0000-0000-0000-000000000005',
    pg_temp.user_a(),
    'Temporary'
  ),
  (
    'aaaaaaaa-0000-0000-0000-000000000006',
    pg_temp.user_a(),
    'self-hosted'
  ),
  (
    'bbbbbbbb-0000-0000-0000-000000000001',
    pg_temp.user_b(),
    'cedar'
  ),
  (
    'bbbbbbbb-0000-0000-0000-000000000002',
    pg_temp.user_b(),
    'Saffron'
  );

insert into public.items (
  id,
  user_id,
  url,
  normalized_url,
  title,
  description,
  note,
  folder_id,
  created_at
)
select
  f.id,
  pg_temp.user_a(),
  v.url,
  v.url,
  v.title,
  v.description,
  v.note,
  v.folder_id,
  v.created_at
from (
  values
    (
      'rank_title',
      'https://example.com/mm-01',
      'Pineapple tart',
      null::text,
      null::text,
      null::uuid,
      '2024-06-03 00:00:00+00'::timestamptz
    ),
    (
      'rank_desc',
      'https://example.com/mm-02',
      'Plain tart',
      'Pineapple notes',
      null::text,
      null::uuid,
      '2024-06-04 00:00:00+00'::timestamptz
    ),
    (
      'saffron',
      'https://example.com/mm-03',
      'Spice jar',
      null::text,
      null::text,
      null::uuid,
      '2024-06-05 00:00:00+00'::timestamptz
    ),
    (
      'quinoa',
      'https://example.com/mm-04',
      'Shopping list',
      null::text,
      'Buy quinoa',
      null::uuid,
      '2024-06-06 00:00:00+00'::timestamptz
    ),
    (
      'webpack',
      'https://example.com/webpack-guide',
      'Shelf card',
      null::text,
      null::text,
      null::uuid,
      '2024-06-07 00:00:00+00'::timestamptz
    ),
    (
      'react_hooks',
      'https://example.com/mm-06',
      'React hooks',
      null::text,
      null::text,
      null::uuid,
      '2024-06-08 00:00:00+00'::timestamptz
    ),
    (
      'react_only',
      'https://example.com/mm-07',
      'React',
      null::text,
      null::text,
      null::uuid,
      '2024-06-09 00:00:00+00'::timestamptz
    ),
    (
      'words_ab',
      'https://example.com/mm-08',
      'a b',
      null::text,
      null::text,
      null::uuid,
      '2024-06-10 00:00:00+00'::timestamptz
    ),
    (
      'word_a',
      'https://example.com/mm-09',
      'a',
      null::text,
      null::text,
      null::uuid,
      '2024-06-11 00:00:00+00'::timestamptz
    ),
    (
      'word_b',
      'https://example.com/mm-10',
      'b',
      null::text,
      null::text,
      null::uuid,
      '2024-06-12 00:00:00+00'::timestamptz
    ),
    (
      'trees',
      'https://example.com/mm-11',
      'Trees',
      null::text,
      null::text,
      null::uuid,
      '2024-06-13 00:00:00+00'::timestamptz
    ),
    (
      'evergreen',
      'https://example.com/mm-12',
      'Evergreen',
      null::text,
      null::text,
      null::uuid,
      '2024-06-14 00:00:00+00'::timestamptz
    ),
    (
      'syrup',
      'https://example.com/mm-13',
      'Syrup',
      null::text,
      null::text,
      null::uuid,
      '2024-06-15 00:00:00+00'::timestamptz
    ),
    (
      'soup',
      'https://example.com/mm-14',
      'Soup',
      null::text,
      null::text,
      '22222222-2222-2222-2222-222222222222'::uuid,
      '2024-04-01 00:00:00+00'::timestamptz
    ),
    (
      'stew',
      'https://example.com/mm-15',
      'Stew',
      null::text,
      null::text,
      '22222222-2222-2222-2222-222222222222'::uuid,
      '2024-05-01 00:00:00+00'::timestamptz
    ),
    (
      'orphan',
      'https://example.com/mm-16',
      'Orphan note',
      null::text,
      null::text,
      '33333333-3333-3333-3333-333333333333'::uuid,
      '2024-06-16 00:00:00+00'::timestamptz
    ),
    (
      'bread',
      'https://example.com/mm-17',
      'Bread',
      null::text,
      null::text,
      null::uuid,
      '2024-06-17 00:00:00+00'::timestamptz
    ),
    (
      'padding_1',
      'https://example.com/mm-18',
      'Filler one',
      null::text,
      null::text,
      null::uuid,
      '2024-06-18 00:00:00+00'::timestamptz
    ),
    (
      'padding_2',
      'https://example.com/mm-19',
      'Filler two',
      'Long-term plan',
      null::text,
      null::uuid,
      '2024-06-19 00:00:00+00'::timestamptz
    ),
    (
      'padding_3',
      'https://example.com/mm-20',
      'Filler three',
      null::text,
      'Mirror on gitlab.io',
      null::uuid,
      '2024-06-20 00:00:00+00'::timestamptz
    ),
    (
      'padding_4',
      'https://example.com/mm-21',
      'Filler four node.js',
      null::text,
      null::text,
      null::uuid,
      '2024-06-21 00:00:00+00'::timestamptz
    ),
    (
      'padding_5',
      'https://example.com/mm-22',
      'Filler five',
      null::text,
      null::text,
      null::uuid,
      '2024-06-22 00:00:00+00'::timestamptz
    ),
    (
      'padding_6',
      'https://example.com/mm-23',
      'Filler six',
      null::text,
      null::text,
      null::uuid,
      '2024-06-23 00:00:00+00'::timestamptz
    ),
    (
      'tie_low',
      'https://example.com/mm-24',
      'Tie low',
      null::text,
      null::text,
      null::uuid,
      '2020-01-01 00:00:00+00'::timestamptz
    ),
    (
      'tie_high',
      'https://example.com/mm-25',
      'Tie high',
      null::text,
      null::text,
      null::uuid,
      '2020-01-01 00:00:00+00'::timestamptz
    )
) as v(key, url, title, description, note, folder_id, created_at)
join search_fixture f on f.key = v.key;

insert into public.items (
  id,
  user_id,
  url,
  normalized_url,
  title,
  folder_id,
  created_at
)
select
  f.id,
  pg_temp.user_a(),
  'https://example.com/page-' || n,
  'https://example.com/page-' || n,
  'Page ' || n,
  '11111111-1111-1111-1111-111111111111',
  timestamptz '2024-01-01 00:00:00+00' + n * interval '1 minute'
from generate_series(1, 25) as n
join search_fixture f on f.key = 'page_' || lpad(n::text, 2, '0');

insert into public.items (
  id,
  user_id,
  url,
  normalized_url,
  title,
  created_at
)
select
  f.id,
  pg_temp.user_b(),
  v.url,
  v.url,
  v.title,
  v.created_at
from (
  values
    (
      'b_pineapple',
      'https://example.com/mm-01',
      'Pineapple tart',
      '2025-01-01 00:00:00+00'::timestamptz
    ),
    (
      'b_react',
      'https://example.com/mm-06',
      'React hooks',
      '2025-01-02 00:00:00+00'::timestamptz
    )
) as v(key, url, title, created_at)
join search_fixture f on f.key = v.key;

insert into public.item_tags (item_id, tag_id)
select f.id, t.tag_id
from (
  values
    ('saffron', 'aaaaaaaa-0000-0000-0000-000000000003'::uuid),
    ('trees', 'aaaaaaaa-0000-0000-0000-000000000001'::uuid),
    ('trees', 'aaaaaaaa-0000-0000-0000-000000000002'::uuid),
    ('evergreen', 'aaaaaaaa-0000-0000-0000-000000000002'::uuid),
    ('syrup', 'aaaaaaaa-0000-0000-0000-000000000001'::uuid),
    ('bread', 'aaaaaaaa-0000-0000-0000-000000000004'::uuid),
    ('padding_1', 'aaaaaaaa-0000-0000-0000-000000000005'::uuid),
    ('padding_5', 'aaaaaaaa-0000-0000-0000-000000000006'::uuid),
    ('b_pineapple', 'bbbbbbbb-0000-0000-0000-000000000002'::uuid),
    ('b_react', 'bbbbbbbb-0000-0000-0000-000000000001'::uuid)
) as t(key, tag_id)
join search_fixture f on f.key = t.key;

select pg_temp.authenticate_as(pg_temp.user_a());

select ok(
  (
    select title_rank > description_rank
    from (
      select
        max(rank) filter (
          where id = (select id from search_fixture where key = 'rank_title')
        ) as title_rank,
        max(rank) filter (
          where id = (select id from search_fixture where key = 'rank_desc')
        ) as description_rank
      from public.search_items(p_query => 'pineapple', p_limit => 50)
    ) ranks
  ),
  'a title match ranks above a description-only match'
);

select results_eq(
  $$select id from public.search_items(p_query => 'pineapple', p_limit => 50)$$,
  $$
    select f.id
    from (values (1, 'rank_title'), (2, 'rank_desc')) as e(ord, key)
    join search_fixture f on f.key = e.key
    order by e.ord
  $$,
  'pineapple returns the title match before the newer description-only match'
);

select results_eq(
  $$select id from public.search_items(p_query => 'saffron', p_limit => 50)$$,
  $$select id from search_fixture where key = 'saffron'$$,
  'a tag-name-only item is found'
);

select results_eq(
  $$select id from public.search_items(p_query => 'quinoa', p_limit => 50)$$,
  $$select id from search_fixture where key = 'quinoa'$$,
  'a note-only item is found'
);

select results_eq(
  $$select id from public.search_items(p_query => 'webpack', p_limit => 50)$$,
  $$select id from search_fixture where key = 'webpack'$$,
  'a url-word-only item is found'
);

-- Query and fields split on the same separators, so dotted or hyphenated words match
-- in the URL and keep matching in every other field.

select results_eq(
  $$select id from public.search_items(p_query => 'webpack-guide', p_limit => 50)$$,
  $$select id from search_fixture where key = 'webpack'$$,
  'webpack-guide finds the item whose url has it'
);

select results_eq(
  $$select id from public.search_items(p_query => 'example.com/webpack', p_limit => 50)$$,
  $$select id from search_fixture where key = 'webpack'$$,
  'example.com/webpack finds the item whose url has it'
);

select results_eq(
  $$select id from public.search_items(p_query => 'node.js', p_limit => 50)$$,
  $$select id from search_fixture where key = 'padding_4'$$,
  'node.js finds the item whose title has it'
);

select results_eq(
  $$select id from public.search_items(p_query => 'long-term', p_limit => 50)$$,
  $$select id from search_fixture where key = 'padding_2'$$,
  'long-term finds the item whose description has it'
);

select results_eq(
  $$select id from public.search_items(p_query => 'gitlab.io', p_limit => 50)$$,
  $$select id from search_fixture where key = 'padding_3'$$,
  'gitlab.io finds the item whose note has it'
);

select results_eq(
  $$select id from public.search_items(p_query => 'self-hosted', p_limit => 50)$$,
  $$select id from search_fixture where key = 'padding_5'$$,
  'self-hosted finds the item whose tag has it'
);

select results_eq(
  $$select id from public.search_items(p_query => 'js', p_limit => 50)$$,
  $$select id from search_fixture where key = 'padding_4'$$,
  'js finds the item whose title has node.js'
);

select set_eq(
  $$select id from public.search_items(p_query => 'reac', p_limit => 50)$$,
  $$select id from search_fixture where key in ('react_hooks', 'react_only')$$,
  'reac finds React hooks and the react-only item'
);

select results_eq(
  $$select id from public.search_items(p_query => 'reac hoo', p_limit => 50)$$,
  $$select id from search_fixture where key = 'react_hooks'$$,
  'reac hoo finds React hooks and not the react-only item'
);

select results_eq(
  $$select id from public.search_items(p_query => 'a & !b', p_limit => 50)$$,
  $$select id from search_fixture where key = 'words_ab'$$,
  'a & !b runs as the words a and b'
);

select results_eq(
  $$select id from public.search_items(p_query => '', p_limit => 50)$$,
  $$select id from public.items order by created_at desc, id desc$$,
  'an empty query returns the full list newest first'
);

select is(
  (select bool_and(rank = 0) from public.search_items(p_query => '', p_limit => 50)),
  true,
  'an empty query sets every rank to 0'
);

select results_eq(
  $$select id from public.search_items(p_query => '   ', p_limit => 50)$$,
  $$select id from public.items order by created_at desc, id desc$$,
  'a whitespace query returns the full list newest first'
);

select is(
  (
    select bool_and(rank = 0)
    from public.search_items(p_query => '   ', p_limit => 50)
  ),
  true,
  'a whitespace query sets every rank to 0'
);

select results_eq(
  $$select id from public.search_items(p_query => '?!.', p_limit => 50)$$,
  $$select id from public.items order by created_at desc, id desc$$,
  'a punctuation-only query returns the full list newest first'
);

select is(
  (
    select bool_and(rank = 0)
    from public.search_items(p_query => '?!.', p_limit => 50)
  ),
  true,
  'a punctuation-only query sets every rank to 0'
);

select results_eq(
  $$select id from public.search_items(p_query => null, p_limit => 50)$$,
  $$select id from public.items order by created_at desc, id desc$$,
  'a null query returns the full list newest first'
);

select is(
  (
    select bool_and(rank = 0)
    from public.search_items(p_query => null, p_limit => 50)
  ),
  true,
  'a null query sets every rank to 0'
);

select results_eq(
  $$select id from public.search_items(p_query => ':*', p_limit => 50)$$,
  $$select id from public.items order by created_at desc, id desc$$,
  ':* behaves as no query'
);

select is(
  (
    select bool_and(rank = 0)
    from public.search_items(p_query => ':*', p_limit => 50)
  ),
  true,
  ':* sets every rank to 0'
);

select results_eq(
  $$select id from public.search_items(p_query => '(', p_limit => 50)$$,
  $$select id from public.items order by created_at desc, id desc$$,
  '( behaves as no query'
);

select is(
  (
    select bool_and(rank = 0)
    from public.search_items(p_query => '(', p_limit => 50)
  ),
  true,
  '( sets every rank to 0'
);

select results_eq(
  $$
    select id
    from public.search_items(p_limit => 50)
    offset 48
  $$,
  $$
    select f.id
    from (values (1, 'tie_high'), (2, 'tie_low')) as e(ord, key)
    join search_fixture f on f.key = e.key
    order by e.ord
  $$,
  'equal created_at ties break by id desc'
);

select results_eq(
  $$
    select id
    from public.search_items(
      p_folder_id => '22222222-2222-2222-2222-222222222222',
      p_limit => 50
    )
  $$,
  $$
    select f.id
    from (values (1, 'stew'), (2, 'soup')) as e(ord, key)
    join search_fixture f on f.key = e.key
    order by e.ord
  $$,
  'p_folder_id returns only that folder''s items, newest first'
);

delete from public.folders
where id = '33333333-3333-3333-3333-333333333333';

select is(
  (
    select bool_and(folder_id is null)
    from public.search_items(p_no_folder => true, p_limit => 50)
  ),
  true,
  'p_no_folder returns only items with no folder'
);

select ok(
  exists (
    select 1
    from public.search_items(p_no_folder => true, p_limit => 50)
    where id = (select id from search_fixture where key = 'orphan')
  ),
  'p_no_folder includes an item whose folder was deleted'
);

select is(
  (select count(*) from public.search_items(p_no_folder => true, p_limit => 50)),
  (select count(*) from public.items where folder_id is null),
  'p_no_folder returns every unfiled item'
);

select throws_ok(
  $$
    select *
    from public.search_items(
      p_folder_id => '22222222-2222-2222-2222-222222222222',
      p_no_folder => true
    )
  $$,
  '22023',
  'p_folder_id and p_no_folder cannot be combined',
  'p_folder_id and p_no_folder together raises 22023'
);

select results_eq(
  $$
    select id
    from public.search_items(
      p_tag_ids => array[
        'aaaaaaaa-0000-0000-0000-000000000002',
        'aaaaaaaa-0000-0000-0000-000000000001'
      ]::uuid[],
      p_limit => 50
    )
  $$,
  $$select id from search_fixture where key = 'trees'$$,
  'p_tag_ids with cedar and Maple returns only items that have both'
);

select results_eq(
  $$select id from public.search_items(p_tag_ids => '{}'::uuid[], p_limit => 50)$$,
  $$select id from public.items order by created_at desc, id desc$$,
  'an empty tag id array means no tag filter'
);

select results_eq(
  $$
    select id
    from public.search_items(
      p_tag_ids => array[
        'aaaaaaaa-0000-0000-0000-000000000002',
        'aaaaaaaa-0000-0000-0000-000000000002'
      ]::uuid[],
      p_limit => 50
    )
  $$,
  $$
    select f.id
    from (values (1, 'evergreen'), (2, 'trees')) as e(ord, key)
    join search_fixture f on f.key = e.key
    order by e.ord
  $$,
  'a repeated tag id acts like that tag once'
);

select results_eq(
  $$
    select id
    from public.search_items(
      p_tag_ids => array['aaaaaaaa-0000-0000-0000-000000000002']::uuid[],
      p_limit => 50
    )
  $$,
  $$
    select f.id
    from (values (1, 'evergreen'), (2, 'trees')) as e(ord, key)
    join search_fixture f on f.key = e.key
    order by e.ord
  $$,
  'one tag id returns the items that have it'
);

select is(
  (
    select tags
    from public.search_items(p_limit => 50)
    where id = (select id from search_fixture where key = 'trees')
  ),
  jsonb_build_array(
    jsonb_build_object(
      'id',
      'aaaaaaaa-0000-0000-0000-000000000002'::uuid,
      'name',
      'cedar'
    ),
    jsonb_build_object(
      'id',
      'aaaaaaaa-0000-0000-0000-000000000001'::uuid,
      'name',
      'Maple'
    )
  ),
  'tags are [{id,name}] ordered by lower(name)'
);

select is(
  (
    select tags
    from public.search_items(p_limit => 50)
    where id = (select id from search_fixture where key = 'react_only')
  ),
  '[]'::jsonb,
  'an item with no tags returns []'
);

select is_empty(
  $$
    select id
    from public.search_items(
      p_tag_ids => array['bbbbbbbb-0000-0000-0000-000000000001']::uuid[],
      p_limit => 50
    )
  $$,
  'a foreign tag id returns 0 rows'
);

delete from public.tags
where id = 'aaaaaaaa-0000-0000-0000-000000000005';

select is_empty(
  $$
    select id
    from public.search_items(
      p_tag_ids => array['aaaaaaaa-0000-0000-0000-000000000005']::uuid[],
      p_limit => 50
    )
  $$,
  'a deleted tag id returns 0 rows'
);

select results_eq(
  $$select id from public.search_items(p_query => 'sourdough', p_limit => 50)$$,
  $$select id from search_fixture where key = 'bread'$$,
  'the original tag name is found'
);

update public.tags
set name = 'Baguette'
where id = 'aaaaaaaa-0000-0000-0000-000000000004';

select results_eq(
  $$select id from public.search_items(p_query => 'baguette', p_limit => 50)$$,
  $$select id from search_fixture where key = 'bread'$$,
  'a renamed tag is found under the new name'
);

select is_empty(
  $$select id from public.search_items(p_query => 'sourdough', p_limit => 50)$$,
  'a renamed tag is not found under the old name'
);

select results_eq(
  $$
    select id
    from public.search_items(
      p_folder_id => '11111111-1111-1111-1111-111111111111',
      p_limit => 10,
      p_offset => 0
    )
  $$,
  $$
    select ('c0000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid
    from generate_series(25, 16, -1) as n
  $$,
  'the first page of 25 paging items is the ten newest'
);

select results_eq(
  $$
    select id
    from public.search_items(
      p_folder_id => '11111111-1111-1111-1111-111111111111',
      p_limit => 10,
      p_offset => 10
    )
  $$,
  $$
    select ('c0000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid
    from generate_series(15, 6, -1) as n
  $$,
  'the second page of 25 paging items has no overlap with the first'
);

select results_eq(
  $$
    select id
    from public.search_items(
      p_folder_id => '11111111-1111-1111-1111-111111111111',
      p_limit => 10,
      p_offset => 20
    )
  $$,
  $$
    select ('c0000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid
    from generate_series(5, 1, -1) as n
  $$,
  'the third page finishes the 25 paging items'
);

select is_empty(
  $$select id from public.search_items(p_offset => 1000, p_limit => 50)$$,
  'offset 1000 returns an empty page'
);

select is(
  (select count(*) from public.search_items(p_limit => 0)),
  1::bigint,
  'p_limit 0 returns 1 row'
);

select is(
  (select count(*) from public.search_items(p_limit => 500)),
  50::bigint,
  'p_limit 500 returns 50 rows'
);

select is(
  (select count(*) from public.search_items(p_limit => null)),
  20::bigint,
  'p_limit null returns 20 rows'
);

select is(
  (
    select count(*)
    from (
      select id from public.search_items(p_query => 'pineapple', p_limit => 50)
      union all
      select id from public.search_items(p_query => 'react hooks', p_limit => 50)
    ) as hits
    where id in (
      select id from search_fixture where key in ('b_pineapple', 'b_react')
    )
  ),
  0::bigint,
  'A never sees B''s look-alike items'
);

select is(
  (
    select count(*)
    from public.search_items(p_limit => 50) as s
    cross join lateral jsonb_array_elements(s.tags) as tag
    where tag->>'id' in (
      'bbbbbbbb-0000-0000-0000-000000000001',
      'bbbbbbbb-0000-0000-0000-000000000002'
    )
  ),
  0::bigint,
  'A never sees B''s tags'
);

select pg_temp.authenticate_anon();

select throws_ok(
  'select * from public.search_items()',
  '42501',
  null,
  'anon cannot execute search_items'
);

select * from finish();
rollback;
