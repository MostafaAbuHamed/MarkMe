begin;
\ir helpers/identity.psql

-- Schema guard for the current US1 state.
-- Widen a grant → this file must change on purpose.

select plan(72);

-- Tables and columns (data-model.md, post-T009).

select has_table('public', 'profiles', 'profiles table exists');
select has_table('public', 'folders', 'folders table exists');
select has_table('public', 'tags', 'tags table exists');
select has_table('public', 'items', 'items table exists');
select has_table('public', 'item_tags', 'item_tags table exists');

select columns_are(
  'public',
  'profiles',
  array['id', 'display_name', 'created_at'],
  'profiles columns match the data model'
);

select columns_are(
  'public',
  'folders',
  array['id', 'user_id', 'name', 'created_at'],
  'folders columns match the data model'
);

select columns_are(
  'public',
  'tags',
  array['id', 'user_id', 'name', 'created_at'],
  'tags columns match the data model'
);

select columns_are(
  'public',
  'items',
  array[
    'id',
    'user_id',
    'url',
    'normalized_url',
    'title',
    'description',
    'image_url',
    'favicon_url',
    'site_name',
    'media_type',
    'embed_provider',
    'embed_id',
    'folder_id',
    'note',
    'preview_status',
    'preview_fetched_at',
    'created_at',
    'updated_at',
    'search_vector'
  ],
  'items columns match the data model'
);

select columns_are(
  'public',
  'item_tags',
  array['item_id', 'tag_id'],
  'item_tags columns match the data model'
);

-- RLS enabled (relrowsecurity). Policies are proved in 020–060.

select is(
  (
    select c.relrowsecurity
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'profiles'
  ),
  true,
  'RLS is enabled on profiles'
);

select is(
  (
    select c.relrowsecurity
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'folders'
  ),
  true,
  'RLS is enabled on folders'
);

select is(
  (
    select c.relrowsecurity
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'tags'
  ),
  true,
  'RLS is enabled on tags'
);

select is(
  (
    select c.relrowsecurity
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'items'
  ),
  true,
  'RLS is enabled on items'
);

select is(
  (
    select c.relrowsecurity
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'item_tags'
  ),
  true,
  'RLS is enabled on item_tags'
);

-- Table privileges (access matrix layer 1). Column grants do not appear here.

select table_privs_are(
  'public',
  'profiles',
  'anon',
  '{}',
  'anon has no privileges on profiles'
);

select table_privs_are(
  'public',
  'folders',
  'anon',
  '{}',
  'anon has no privileges on folders'
);

select table_privs_are(
  'public',
  'tags',
  'anon',
  '{}',
  'anon has no privileges on tags'
);

select table_privs_are(
  'public',
  'items',
  'anon',
  '{}',
  'anon has no privileges on items'
);

select table_privs_are(
  'public',
  'item_tags',
  'anon',
  '{}',
  'anon has no privileges on item_tags'
);

select table_privs_are(
  'public',
  'profiles',
  'authenticated',
  array['SELECT'],
  'authenticated has select on profiles'
);

select table_privs_are(
  'public',
  'folders',
  'authenticated',
  array['DELETE', 'SELECT'],
  'authenticated has select and delete on folders'
);

select table_privs_are(
  'public',
  'tags',
  'authenticated',
  array['DELETE', 'SELECT'],
  'authenticated has select and delete on tags'
);

select table_privs_are(
  'public',
  'items',
  'authenticated',
  array['DELETE', 'SELECT'],
  'authenticated has select and delete on items'
);

select table_privs_are(
  'public',
  'item_tags',
  'authenticated',
  array['DELETE', 'INSERT', 'SELECT'],
  'authenticated has select, insert and delete on item_tags'
);

-- Column allowlists. Table-level SELECT shows up on every column.
-- A column outside the list has SELECT only, so a wider column grant fails here.

select column_privs_are(
  'public',
  'profiles',
  'id',
  'authenticated',
  array['SELECT'],
  'profiles.id is outside the authenticated update allowlist'
);

select column_privs_are(
  'public',
  'profiles',
  'display_name',
  'authenticated',
  array['SELECT', 'UPDATE'],
  'authenticated may update profiles.display_name'
);

select column_privs_are(
  'public',
  'profiles',
  'created_at',
  'authenticated',
  array['SELECT'],
  'profiles.created_at is outside the authenticated update allowlist'
);

select column_privs_are(
  'public',
  'folders',
  'id',
  'authenticated',
  array['SELECT'],
  'folders.id is outside the authenticated insert and update allowlist'
);

select column_privs_are(
  'public',
  'folders',
  'user_id',
  'authenticated',
  array['SELECT'],
  'folders.user_id is outside the authenticated insert and update allowlist'
);

select column_privs_are(
  'public',
  'folders',
  'name',
  'authenticated',
  array['INSERT', 'SELECT', 'UPDATE'],
  'authenticated may insert and update folders.name'
);

select column_privs_are(
  'public',
  'folders',
  'created_at',
  'authenticated',
  array['SELECT'],
  'folders.created_at is outside the authenticated insert and update allowlist'
);

select column_privs_are(
  'public',
  'tags',
  'id',
  'authenticated',
  array['SELECT'],
  'tags.id is outside the authenticated insert and update allowlist'
);

select column_privs_are(
  'public',
  'tags',
  'user_id',
  'authenticated',
  array['SELECT'],
  'tags.user_id is outside the authenticated insert and update allowlist'
);

select column_privs_are(
  'public',
  'tags',
  'name',
  'authenticated',
  array['INSERT', 'SELECT', 'UPDATE'],
  'authenticated may insert and update tags.name'
);

select column_privs_are(
  'public',
  'tags',
  'created_at',
  'authenticated',
  array['SELECT'],
  'tags.created_at is outside the authenticated insert and update allowlist'
);

select column_privs_are(
  'public',
  'items',
  'id',
  'authenticated',
  array['SELECT'],
  'items.id is outside the authenticated insert and update allowlist'
);

select column_privs_are(
  'public',
  'items',
  'user_id',
  'authenticated',
  array['SELECT'],
  'items.user_id is outside the authenticated insert and update allowlist'
);

select column_privs_are(
  'public',
  'items',
  'url',
  'authenticated',
  array['INSERT', 'SELECT'],
  'authenticated may insert items.url and may not update it'
);

select column_privs_are(
  'public',
  'items',
  'normalized_url',
  'authenticated',
  array['INSERT', 'SELECT'],
  'authenticated may insert items.normalized_url and may not update it'
);

select column_privs_are(
  'public',
  'items',
  'title',
  'authenticated',
  array['INSERT', 'SELECT', 'UPDATE'],
  'authenticated may insert and update items.title'
);

select column_privs_are(
  'public',
  'items',
  'description',
  'authenticated',
  array['INSERT', 'SELECT', 'UPDATE'],
  'authenticated may insert and update items.description'
);

select column_privs_are(
  'public',
  'items',
  'image_url',
  'authenticated',
  array['INSERT', 'SELECT', 'UPDATE'],
  'authenticated may insert and update items.image_url'
);

select column_privs_are(
  'public',
  'items',
  'favicon_url',
  'authenticated',
  array['INSERT', 'SELECT', 'UPDATE'],
  'authenticated may insert and update items.favicon_url'
);

select column_privs_are(
  'public',
  'items',
  'site_name',
  'authenticated',
  array['INSERT', 'SELECT', 'UPDATE'],
  'authenticated may insert and update items.site_name'
);

select column_privs_are(
  'public',
  'items',
  'media_type',
  'authenticated',
  array['INSERT', 'SELECT', 'UPDATE'],
  'authenticated may insert and update items.media_type'
);

select column_privs_are(
  'public',
  'items',
  'embed_provider',
  'authenticated',
  array['INSERT', 'SELECT', 'UPDATE'],
  'authenticated may insert and update items.embed_provider'
);

select column_privs_are(
  'public',
  'items',
  'embed_id',
  'authenticated',
  array['INSERT', 'SELECT', 'UPDATE'],
  'authenticated may insert and update items.embed_id'
);

select column_privs_are(
  'public',
  'items',
  'folder_id',
  'authenticated',
  array['INSERT', 'SELECT', 'UPDATE'],
  'authenticated may insert and update items.folder_id'
);

select column_privs_are(
  'public',
  'items',
  'note',
  'authenticated',
  array['INSERT', 'SELECT', 'UPDATE'],
  'authenticated may insert and update items.note'
);

select column_privs_are(
  'public',
  'items',
  'preview_status',
  'authenticated',
  array['INSERT', 'SELECT', 'UPDATE'],
  'authenticated may insert and update items.preview_status'
);

select column_privs_are(
  'public',
  'items',
  'preview_fetched_at',
  'authenticated',
  array['INSERT', 'SELECT', 'UPDATE'],
  'authenticated may insert and update items.preview_fetched_at'
);

select column_privs_are(
  'public',
  'items',
  'created_at',
  'authenticated',
  array['SELECT'],
  'items.created_at is outside the authenticated insert and update allowlist'
);

select column_privs_are(
  'public',
  'items',
  'updated_at',
  'authenticated',
  array['SELECT'],
  'items.updated_at is outside the authenticated insert and update allowlist'
);

select column_privs_are(
  'public',
  'items',
  'search_vector',
  'authenticated',
  array['SELECT'],
  'items.search_vector is outside the authenticated insert and update allowlist'
);

select column_privs_are(
  'public',
  'item_tags',
  'item_id',
  'authenticated',
  array['INSERT', 'SELECT'],
  'authenticated may insert item_tags.item_id and may not update it'
);

select column_privs_are(
  'public',
  'item_tags',
  'tag_id',
  'authenticated',
  array['INSERT', 'SELECT'],
  'authenticated may insert item_tags.tag_id and may not update it'
);

select column_privs_are(
  'public',
  'item_tags',
  'item_id',
  'anon',
  '{}',
  'anon has no privileges on item_tags.item_id'
);

select column_privs_are(
  'public',
  'item_tags',
  'tag_id',
  'anon',
  '{}',
  'anon has no privileges on item_tags.tag_id'
);

-- private is not in the API (R4).

select schema_privs_are(
  'private',
  'anon',
  '{}',
  'anon has no privileges on schema private'
);

select schema_privs_are(
  'private',
  'authenticated',
  '{}',
  'authenticated has no privileges on schema private'
);

select function_privs_are(
  'private',
  'handle_new_user',
  '{}',
  'anon',
  '{}',
  'anon has no privileges on private.handle_new_user()'
);

select function_privs_are(
  'private',
  'handle_new_user',
  '{}',
  'authenticated',
  '{}',
  'authenticated has no privileges on private.handle_new_user()'
);

-- List indexes from the items migration.

select has_index(
  'public',
  'items',
  'items_user_created_at_id_idx',
  'items has index items_user_created_at_id_idx'
);

select has_index(
  'public',
  'items',
  'items_user_folder_id_idx',
  'items has index items_user_folder_id_idx'
);

select has_index(
  'public',
  'items',
  'items_user_normalized_url_uq',
  'items has index items_user_normalized_url_uq'
);

select has_index(
  'public',
  'item_tags',
  'item_tags_tag_id_idx',
  'item_tags has index item_tags_tag_id_idx'
);

select has_index(
  'public',
  'folders',
  'folders_user_name_uq',
  'folders has index folders_user_name_uq'
);

select has_index(
  'public',
  'tags',
  'tags_user_name_uq',
  'tags has index tags_user_name_uq'
);

select function_privs_are(
  'private',
  'set_updated_at',
  '{}',
  'anon',
  '{}',
  'anon has no privileges on private.set_updated_at()'
);

select function_privs_are(
  'private',
  'set_updated_at',
  '{}',
  'authenticated',
  '{}',
  'authenticated has no privileges on private.set_updated_at()'
);

select set_eq(
  $$
    select a.attname::text
    from pg_trigger t
    join pg_attribute a on a.attrelid = t.tgrelid and a.attnum = any (t.tgattr::int2[])
    where t.tgrelid = 'public.items'::regclass
      and t.tgname = 'items_set_updated_at'
  $$,
  $$
    select a.attname::text
    from pg_attribute a
    where a.attrelid = 'public.items'::regclass
      and a.attnum > 0
      and not a.attisdropped
      and has_column_privilege('authenticated', a.attrelid, a.attnum, 'UPDATE')
  $$,
  'items_set_updated_at fires on exactly the columns authenticated may update'
);

select * from finish();
rollback;
