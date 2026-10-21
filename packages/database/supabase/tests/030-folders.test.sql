begin;
\ir helpers/identity.psql
select plan(18);

-- A inserts with only name.
select pg_temp.authenticate_as(pg_temp.user_a());

select lives_ok(
  $$insert into public.folders (name) values ('Reading')$$,
  'A inserts a folder with only name'
);

select is(
  (select user_id from public.folders where name = 'Reading'),
  pg_temp.user_a(),
  'the folder user_id equals A''s id'
);

select ok(
  (
    select id is not null and created_at is not null
    from public.folders
    where name = 'Reading'
  ),
  'the folder id and created_at are filled'
);

select throws_ok(
  $$insert into public.folders (name, user_id) values ('Own', pg_temp.user_a())$$,
  '42501',
  null,
  'A inserting a folder with their own user_id is denied'
);

select throws_ok(
  $$insert into public.folders (name, user_id) values ('Theirs', pg_temp.user_b())$$,
  '42501',
  null,
  'A inserting a folder with B''s user_id is denied'
);

select throws_ok(
  $$insert into public.folders (name, id) values ('With id', gen_random_uuid())$$,
  '42501',
  null,
  'A inserting a folder with id is denied'
);

select throws_ok(
  $$insert into public.folders (name, created_at) values ('With time', now())$$,
  '42501',
  null,
  'A inserting a folder with created_at is denied'
);

-- A renames their own row. Other columns stay closed.
select lives_ok(
  $$update public.folders set name = 'Renamed' where name = 'Reading'$$,
  'A renames their own folder'
);

select is(
  (select name from public.folders),
  'Renamed',
  'A''s folder rename persists'
);

select throws_ok(
  $$update public.folders set user_id = pg_temp.user_b() where name = 'Renamed'$$,
  '42501',
  null,
  'A updating a folder user_id is denied'
);

select throws_ok(
  $$update public.folders set id = gen_random_uuid() where name = 'Renamed'$$,
  '42501',
  null,
  'A updating a folder id is denied'
);

select throws_ok(
  $$update public.folders set created_at = now() where name = 'Renamed'$$,
  '42501',
  null,
  'A updating a folder created_at is denied'
);

-- B cannot see or change A's row.
select pg_temp.authenticate_as(pg_temp.user_b());

select is(
  (select count(*) from public.folders where user_id = pg_temp.user_a()),
  0::bigint,
  'B selects 0 of A''s folders'
);

with updated as (
  update public.folders
  set name = 'hijacked'
  where user_id = pg_temp.user_a()
  returning id
)
select is(
  (select count(*) from updated),
  0::bigint,
  'B updating A''s folder affects 0 rows'
);

with deleted as (
  delete from public.folders
  where user_id = pg_temp.user_a()
  returning id
)
select is(
  (select count(*) from deleted),
  0::bigint,
  'B deleting A''s folder affects 0 rows'
);

-- anon has no access.
select pg_temp.authenticate_anon();

select throws_ok(
  'select id from public.folders',
  '42501',
  null,
  'anon select on folders is denied'
);

select throws_ok(
  $$insert into public.folders (name) values ('Anon')$$,
  '42501',
  null,
  'anon insert on folders is denied'
);

-- truncate is not granted to authenticated.
select pg_temp.authenticate_as(pg_temp.user_a());

select throws_ok(
  'truncate public.folders',
  '42501',
  null,
  'truncate folders as authenticated is denied'
);

select * from finish();
rollback;
