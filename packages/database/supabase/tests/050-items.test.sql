begin;
\ir helpers/identity.psql
select plan(94);

-- Folders for the composite FK. B's id is read back as postgres: A cannot see it.
select pg_temp.authenticate_as(pg_temp.user_a());

insert into public.folders (name) values ('A folder');

select pg_temp.authenticate_as(pg_temp.user_b());

insert into public.folders (name) values ('B folder');

select pg_temp.reset_identity();

create function pg_temp.b_folder_id()
returns uuid
language sql
security definer
set search_path = ''
as $fn$
  select id from public.folders where user_id = pg_temp.user_b()
$fn$;

select pg_temp.authenticate_as(pg_temp.user_a());

-- A inserts with url and normalized_url only.
select lives_ok(
  $$insert into public.items (url, normalized_url)
    values ('https://example.com/a', 'https://example.com/a')$$,
  'A inserts an item with url and normalized_url only'
);

select is(
  (select user_id from public.items where url = 'https://example.com/a'),
  pg_temp.user_a(),
  'the item user_id equals A''s id'
);

select ok(
  (
    select
      id is not null
      and created_at is not null
      and updated_at is not null
      and search_vector is not null
    from public.items
    where url = 'https://example.com/a'
  ),
  'the item id, timestamps and search_vector are filled'
);

select throws_ok(
  $$insert into public.items (url, normalized_url, user_id)
    values ('https://example.com/own', 'https://example.com/own', pg_temp.user_a())$$,
  '42501',
  null,
  'A inserting an item with their own user_id is denied'
);

select throws_ok(
  $$insert into public.items (url, normalized_url, user_id)
    values ('https://example.com/theirs', 'https://example.com/theirs', pg_temp.user_b())$$,
  '42501',
  null,
  'A inserting an item with B''s user_id is denied'
);

select throws_ok(
  $$insert into public.items (url, normalized_url, id)
    values ('https://example.com/id', 'https://example.com/id', gen_random_uuid())$$,
  '42501',
  null,
  'A inserting an item with id is denied'
);

select throws_ok(
  $$insert into public.items (url, normalized_url, created_at)
    values ('https://example.com/created', 'https://example.com/created', now())$$,
  '42501',
  null,
  'A inserting an item with created_at is denied'
);

select throws_ok(
  $$insert into public.items (url, normalized_url, updated_at)
    values ('https://example.com/updated', 'https://example.com/updated', now())$$,
  '42501',
  null,
  'A inserting an item with updated_at is denied'
);

select throws_ok(
  $$insert into public.items (url, normalized_url, search_vector)
    values ('https://example.com/search', 'https://example.com/search', ''::tsvector)$$,
  '42501',
  null,
  'A inserting an item with search_vector is denied'
);

-- Closed columns on update.
select throws_ok(
  $$update public.items set url = 'https://example.com/changed'
    where url = 'https://example.com/a'$$,
  '42501',
  null,
  'A updating an item url is denied'
);

select throws_ok(
  $$update public.items set normalized_url = 'https://example.com/changed'
    where url = 'https://example.com/a'$$,
  '42501',
  null,
  'A updating an item normalized_url is denied'
);

select throws_ok(
  $$update public.items set user_id = pg_temp.user_b()
    where url = 'https://example.com/a'$$,
  '42501',
  null,
  'A updating an item user_id is denied'
);

select throws_ok(
  $$update public.items set created_at = now() where url = 'https://example.com/a'$$,
  '42501',
  null,
  'A updating an item created_at is denied'
);

select throws_ok(
  $$update public.items set updated_at = now() where url = 'https://example.com/a'$$,
  '42501',
  null,
  'A updating an item updated_at is denied'
);

select throws_ok(
  $$update public.items set search_vector = ''::tsvector
    where url = 'https://example.com/a'$$,
  '42501',
  null,
  'A updating an item search_vector is denied'
);

-- Update allowlist. Each value must persist: 0 rows still counts as lives_ok.
select lives_ok(
  $$update public.items set title = 'A title' where url = 'https://example.com/a'$$,
  'A updating title succeeds'
);

select is(
  (select title from public.items where url = 'https://example.com/a'),
  'A title',
  'A updating title persists'
);

select lives_ok(
  $$update public.items set description = 'A description'
    where url = 'https://example.com/a'$$,
  'A updating description succeeds'
);

select is(
  (select description from public.items where url = 'https://example.com/a'),
  'A description',
  'A updating description persists'
);

select lives_ok(
  $$update public.items set image_url = 'https://img.example/a.png'
    where url = 'https://example.com/a'$$,
  'A updating image_url succeeds'
);

select is(
  (select image_url from public.items where url = 'https://example.com/a'),
  'https://img.example/a.png',
  'A updating image_url persists'
);

select lives_ok(
  $$update public.items set favicon_url = 'https://img.example/favicon.ico'
    where url = 'https://example.com/a'$$,
  'A updating favicon_url succeeds'
);

select is(
  (select favicon_url from public.items where url = 'https://example.com/a'),
  'https://img.example/favicon.ico',
  'A updating favicon_url persists'
);

select lives_ok(
  $$update public.items set site_name = 'Example' where url = 'https://example.com/a'$$,
  'A updating site_name succeeds'
);

select is(
  (select site_name from public.items where url = 'https://example.com/a'),
  'Example',
  'A updating site_name persists'
);

select lives_ok(
  $$update public.items set media_type = 'article' where url = 'https://example.com/a'$$,
  'A updating media_type succeeds'
);

select is(
  (select media_type from public.items where url = 'https://example.com/a'),
  'article'::public.media_type,
  'A updating media_type persists'
);

-- Set a valid id in the same update: the pair check rejects a provider alone.
select lives_ok(
  $$update public.items
    set embed_provider = 'youtube', embed_id = 'dQw4w9WgXcQ'
    where url = 'https://example.com/a'$$,
  'A updating embed_provider succeeds'
);

select is(
  (select embed_provider from public.items where url = 'https://example.com/a'),
  'youtube'::public.embed_provider,
  'A updating embed_provider persists'
);

select lives_ok(
  $$update public.items set embed_id = 'abcdefghijk' where url = 'https://example.com/a'$$,
  'A updating embed_id succeeds'
);

select is(
  (select embed_id from public.items where url = 'https://example.com/a'),
  'abcdefghijk',
  'A updating embed_id persists'
);

select lives_ok(
  $$update public.items
    set folder_id = (select id from public.folders where name = 'A folder')
    where url = 'https://example.com/a'$$,
  'A setting their own item''s folder_id to their own folder succeeds'
);

select is(
  (select folder_id from public.items where url = 'https://example.com/a'),
  (select id from public.folders where name = 'A folder'),
  'A updating folder_id persists'
);

select lives_ok(
  $$update public.items set note = 'A note' where url = 'https://example.com/a'$$,
  'A updating note succeeds'
);

select is(
  (select note from public.items where url = 'https://example.com/a'),
  'A note',
  'A updating note persists'
);

select lives_ok(
  $$update public.items set preview_status = 'ok' where url = 'https://example.com/a'$$,
  'A updating preview_status succeeds'
);

select is(
  (select preview_status from public.items where url = 'https://example.com/a'),
  'ok'::public.preview_status,
  'A updating preview_status persists'
);

select lives_ok(
  $$update public.items set preview_fetched_at = '2026-01-02 03:04:05+00'
    where url = 'https://example.com/a'$$,
  'A updating preview_fetched_at succeeds'
);

select is(
  (select preview_fetched_at from public.items where url = 'https://example.com/a'),
  '2026-01-02 03:04:05+00'::timestamptz,
  'A updating preview_fetched_at persists'
);

-- Cross-user folder: composite FK, not RLS.
select throws_ok(
  $$insert into public.items (url, normalized_url, folder_id)
    values (
      'https://example.com/b-folder',
      'https://example.com/b-folder',
      pg_temp.b_folder_id()
    )$$,
  '23503',
  null,
  'A inserting an item with B''s folder is denied'
);

select throws_ok(
  $$update public.items set folder_id = pg_temp.b_folder_id()
    where url = 'https://example.com/a'$$,
  '23503',
  null,
  'A setting folder_id to B''s folder is denied'
);

-- B cannot see or change A's item.
select pg_temp.authenticate_as(pg_temp.user_b());

select is(
  (select count(*) from public.items where user_id = pg_temp.user_a()),
  0::bigint,
  'B selects 0 of A''s items'
);

with updated as (
  update public.items
  set title = 'hijacked'
  where user_id = pg_temp.user_a()
  returning id
)
select is(
  (select count(*) from updated),
  0::bigint,
  'B updating A''s item affects 0 rows'
);

with deleted as (
  delete from public.items
  where user_id = pg_temp.user_a()
  returning id
)
select is(
  (select count(*) from deleted),
  0::bigint,
  'B deleting A''s item affects 0 rows'
);

-- anon has no access.
select pg_temp.authenticate_anon();

select throws_ok(
  'select id from public.items',
  '42501',
  null,
  'anon select on items is denied'
);

select throws_ok(
  $$insert into public.items (url, normalized_url)
    values ('https://example.com/anon', 'https://example.com/anon')$$,
  '42501',
  null,
  'anon insert on items is denied'
);

-- truncate is not granted to authenticated.
select pg_temp.authenticate_as(pg_temp.user_a());

select throws_ok(
  'truncate public.items',
  '42501',
  null,
  'truncate items as authenticated is denied'
);

-- Item rules: duplicate normalized_url, format, length caps, embed, defaults.

select throws_ok(
  $$insert into public.items (url, normalized_url)
    values ('https://example.com/a', 'https://example.com/a')$$,
  '23505',
  null,
  'A saving a second item with the same normalized_url is denied'
);

select pg_temp.authenticate_as(pg_temp.user_b());

select lives_ok(
  $$insert into public.items (url, normalized_url)
    values ('https://example.com/a', 'https://example.com/a')$$,
  'B saving the same URL succeeds'
);

select pg_temp.authenticate_as(pg_temp.user_a());

select throws_ok(
  $$insert into public.items (url, normalized_url)
    values ('https://example.com/a?utm=1', 'https://example.com/a')$$,
  '23505',
  null,
  'two different urls with the same normalized_url are denied'
);

select throws_ok(
  $$insert into public.items (url, normalized_url)
    values ('ftp://x', 'https://example.com/rule-ftp-url')$$,
  '23514',
  null,
  'an ftp url is denied'
);

select throws_ok(
  $$insert into public.items (url, normalized_url)
    values ('https://example.com/rule-ftp-norm', 'ftp://x')$$,
  '23514',
  null,
  'an ftp normalized_url is denied'
);

select throws_ok(
  $$insert into public.items (url, normalized_url)
    values ('example.com', 'https://example.com/rule-bare-url')$$,
  '23514',
  null,
  'a url without a scheme is denied'
);

select throws_ok(
  $$insert into public.items (url, normalized_url)
    values ('https://example.com/rule-bare-norm', 'example.com')$$,
  '23514',
  null,
  'a normalized_url without a scheme is denied'
);

select throws_ok(
  $$insert into public.items (url, normalized_url)
    values ('https://' || repeat('a', 2041), 'https://example.com/rule-long-url')$$,
  '23514',
  null,
  'a 2049-character url is denied'
);

select throws_ok(
  $$insert into public.items (url, normalized_url)
    values ('https://example.com/rule-long-norm', 'https://' || repeat('a', 2041))$$,
  '23514',
  null,
  'a 2049-character normalized_url is denied'
);

select lives_ok(
  $$insert into public.items (url, normalized_url)
    values ('HTTPS://x', 'HTTPS://x')$$,
  'an uppercase HTTPS url passes'
);

-- Length caps: one over is denied, and exactly at the cap succeeds, on insert and update.

select throws_ok(
  $$insert into public.items (url, normalized_url, title)
    values ('https://example.com/title-over', 'https://example.com/title-over', repeat('t', 501))$$,
  '23514',
  null,
  'a title of 501 characters is denied on insert'
);

select lives_ok(
  $$insert into public.items (url, normalized_url, title)
    values ('https://example.com/title-cap', 'https://example.com/title-cap', repeat('t', 500))$$,
  'a title of exactly 500 characters succeeds on insert'
);

select throws_ok(
  $$update public.items set title = repeat('t', 501)
    where url = 'https://example.com/a'$$,
  '23514',
  null,
  'a title of 501 characters is denied on update'
);

select lives_ok(
  $$update public.items set title = repeat('t', 500)
    where url = 'https://example.com/a'$$,
  'a title of exactly 500 characters succeeds on update'
);

select throws_ok(
  $$insert into public.items (url, normalized_url, description)
    values (
      'https://example.com/description-over',
      'https://example.com/description-over',
      repeat('d', 2001)
    )$$,
  '23514',
  null,
  'a description of 2001 characters is denied on insert'
);

select lives_ok(
  $$insert into public.items (url, normalized_url, description)
    values (
      'https://example.com/description-cap',
      'https://example.com/description-cap',
      repeat('d', 2000)
    )$$,
  'a description of exactly 2000 characters succeeds on insert'
);

select throws_ok(
  $$update public.items set description = repeat('d', 2001)
    where url = 'https://example.com/a'$$,
  '23514',
  null,
  'a description of 2001 characters is denied on update'
);

select lives_ok(
  $$update public.items set description = repeat('d', 2000)
    where url = 'https://example.com/a'$$,
  'a description of exactly 2000 characters succeeds on update'
);

select throws_ok(
  $$insert into public.items (url, normalized_url, note)
    values ('https://example.com/note-over', 'https://example.com/note-over', repeat('n', 1001))$$,
  '23514',
  null,
  'a note of 1001 characters is denied on insert'
);

select lives_ok(
  $$insert into public.items (url, normalized_url, note)
    values ('https://example.com/note-cap', 'https://example.com/note-cap', repeat('n', 1000))$$,
  'a note of exactly 1000 characters succeeds on insert'
);

select throws_ok(
  $$update public.items set note = repeat('n', 1001)
    where url = 'https://example.com/a'$$,
  '23514',
  null,
  'a note of 1001 characters is denied on update'
);

select lives_ok(
  $$update public.items set note = repeat('n', 1000)
    where url = 'https://example.com/a'$$,
  'a note of exactly 1000 characters succeeds on update'
);

select throws_ok(
  $$insert into public.items (url, normalized_url, site_name)
    values (
      'https://example.com/site-name-over',
      'https://example.com/site-name-over',
      repeat('s', 201)
    )$$,
  '23514',
  null,
  'a site_name of 201 characters is denied on insert'
);

select lives_ok(
  $$insert into public.items (url, normalized_url, site_name)
    values (
      'https://example.com/site-name-cap',
      'https://example.com/site-name-cap',
      repeat('s', 200)
    )$$,
  'a site_name of exactly 200 characters succeeds on insert'
);

select throws_ok(
  $$update public.items set site_name = repeat('s', 201)
    where url = 'https://example.com/a'$$,
  '23514',
  null,
  'a site_name of 201 characters is denied on update'
);

select lives_ok(
  $$update public.items set site_name = repeat('s', 200)
    where url = 'https://example.com/a'$$,
  'a site_name of exactly 200 characters succeeds on update'
);

select throws_ok(
  $$insert into public.items (url, normalized_url, image_url)
    values (
      'https://example.com/image-url-over',
      'https://example.com/image-url-over',
      repeat('i', 2049)
    )$$,
  '23514',
  null,
  'an image_url of 2049 characters is denied on insert'
);

select lives_ok(
  $$insert into public.items (url, normalized_url, image_url)
    values (
      'https://example.com/image-url-cap',
      'https://example.com/image-url-cap',
      repeat('i', 2048)
    )$$,
  'an image_url of exactly 2048 characters succeeds on insert'
);

select throws_ok(
  $$update public.items set image_url = repeat('i', 2049)
    where url = 'https://example.com/a'$$,
  '23514',
  null,
  'an image_url of 2049 characters is denied on update'
);

select lives_ok(
  $$update public.items set image_url = repeat('i', 2048)
    where url = 'https://example.com/a'$$,
  'an image_url of exactly 2048 characters succeeds on update'
);

select throws_ok(
  $$insert into public.items (url, normalized_url, favicon_url)
    values (
      'https://example.com/favicon-url-over',
      'https://example.com/favicon-url-over',
      repeat('f', 2049)
    )$$,
  '23514',
  null,
  'a favicon_url of 2049 characters is denied on insert'
);

select lives_ok(
  $$insert into public.items (url, normalized_url, favicon_url)
    values (
      'https://example.com/favicon-url-cap',
      'https://example.com/favicon-url-cap',
      repeat('f', 2048)
    )$$,
  'a favicon_url of exactly 2048 characters succeeds on insert'
);

select throws_ok(
  $$update public.items set favicon_url = repeat('f', 2049)
    where url = 'https://example.com/a'$$,
  '23514',
  null,
  'a favicon_url of 2049 characters is denied on update'
);

select lives_ok(
  $$update public.items set favicon_url = repeat('f', 2048)
    where url = 'https://example.com/a'$$,
  'a favicon_url of exactly 2048 characters succeeds on update'
);

select throws_ok(
  $$insert into public.items (url, normalized_url, embed_provider)
    values ('https://example.com/embed-provider', 'https://example.com/embed-provider', 'youtube')$$,
  '23514',
  null,
  'an embed provider without an id is denied'
);

select throws_ok(
  $$insert into public.items (url, normalized_url, embed_id)
    values ('https://example.com/embed-id', 'https://example.com/embed-id', 'dQw4w9WgXcQ')$$,
  '23514',
  null,
  'an embed id without a provider is denied'
);

select lives_ok(
  $$insert into public.items (url, normalized_url, embed_provider, embed_id)
    values (
      'https://example.com/embed-ok',
      'https://example.com/embed-ok',
      'youtube',
      'dQw4w9WgXcQ'
    )$$,
  'a youtube embed with a valid id succeeds'
);

select throws_ok(
  $$insert into public.items (url, normalized_url, embed_provider, embed_id)
    values (
      'https://example.com/embed-short',
      'https://example.com/embed-short',
      'youtube',
      'abcdefghij'
    )$$,
  '23514',
  null,
  'a youtube embed id of 10 characters is denied'
);

select throws_ok(
  $$insert into public.items (url, normalized_url, embed_provider, embed_id)
    values (
      'https://example.com/embed-bang',
      'https://example.com/embed-bang',
      'youtube',
      'abcdefghij!'
    )$$,
  '23514',
  null,
  'a youtube embed id containing ! is denied'
);

select lives_ok(
  $$insert into public.items (url, normalized_url)
    values ('https://example.com/defaults', 'https://example.com/defaults')$$,
  'a new item inserts for the default check'
);

select is(
  (select preview_status from public.items where url = 'https://example.com/defaults'),
  'pending'::public.preview_status,
  'a new item has preview_status pending'
);

select is(
  (select media_type from public.items where url = 'https://example.com/defaults'),
  'link'::public.media_type,
  'a new item has media_type link'
);

select throws_ok(
  $$insert into public.items (url, normalized_url, media_type)
    values ('https://example.com/bad-media', 'https://example.com/bad-media', 'nope')$$,
  '22P02',
  null,
  'an invalid media_type is denied'
);

-- updated_at moves on client edits. now() is fixed for this transaction, so
-- postgres backdates it first. That write does not fire the trigger: updated_at
-- is outside the trigger column list.

select pg_temp.reset_identity();

update public.items
set updated_at = now() - interval '1 day'
where url = 'https://example.com/a';

select pg_temp.authenticate_as(pg_temp.user_a());

update public.items
set title = 'Touched title'
where url = 'https://example.com/a';

select is(
  (select updated_at from public.items where url = 'https://example.com/a'),
  now(),
  'updating title sets updated_at to now()'
);

select pg_temp.reset_identity();

update public.items
set updated_at = now() - interval '1 day'
where url = 'https://example.com/a';

select pg_temp.authenticate_as(pg_temp.user_a());

update public.items
set note = 'Touched note'
where url = 'https://example.com/a';

select is(
  (select updated_at from public.items where url = 'https://example.com/a'),
  now(),
  'updating note sets updated_at to now()'
);

select pg_temp.reset_identity();

update public.items
set updated_at = now() - interval '1 day'
where url = 'https://example.com/a';

select pg_temp.authenticate_as(pg_temp.user_a());

update public.items
set folder_id = (select id from public.folders where name = 'A folder')
where url = 'https://example.com/a';

select is(
  (select updated_at from public.items where url = 'https://example.com/a'),
  now(),
  'updating folder_id sets updated_at to now()'
);

select pg_temp.reset_identity();

update public.items
set updated_at = now() - interval '1 day'
where url = 'https://example.com/a';

select pg_temp.authenticate_as(pg_temp.user_a());

update public.items
set preview_status = 'failed'
where url = 'https://example.com/a';

select is(
  (select updated_at from public.items where url = 'https://example.com/a'),
  now(),
  'updating preview_status sets updated_at to now()'
);

select * from finish();
rollback;
