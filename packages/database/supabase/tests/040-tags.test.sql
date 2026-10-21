begin;
\ir helpers/identity.psql
select plan(26);

-- A inserts with only name.
select pg_temp.authenticate_as(pg_temp.user_a());

select lives_ok(
  $$insert into public.tags (name) values ('Reading')$$,
  'A inserts a tag with only name'
);

select is(
  (select user_id from public.tags where name = 'Reading'),
  pg_temp.user_a(),
  'the tag user_id equals A''s id'
);

select ok(
  (
    select id is not null and created_at is not null
    from public.tags
    where name = 'Reading'
  ),
  'the tag id and created_at are filled'
);

select throws_ok(
  $$insert into public.tags (name, user_id) values ('Own', pg_temp.user_a())$$,
  '42501',
  null,
  'A inserting a tag with their own user_id is denied'
);

select throws_ok(
  $$insert into public.tags (name, user_id) values ('Theirs', pg_temp.user_b())$$,
  '42501',
  null,
  'A inserting a tag with B''s user_id is denied'
);

select throws_ok(
  $$insert into public.tags (name, id) values ('With id', gen_random_uuid())$$,
  '42501',
  null,
  'A inserting a tag with id is denied'
);

select throws_ok(
  $$insert into public.tags (name, created_at) values ('With time', now())$$,
  '42501',
  null,
  'A inserting a tag with created_at is denied'
);

-- A renames their own row. Other columns stay closed.
select lives_ok(
  $$update public.tags set name = 'Renamed' where name = 'Reading'$$,
  'A renames their own tag'
);

select is(
  (select name from public.tags),
  'Renamed',
  'A''s tag rename persists'
);

select throws_ok(
  $$update public.tags set user_id = pg_temp.user_b() where name = 'Renamed'$$,
  '42501',
  null,
  'A updating a tag user_id is denied'
);

select throws_ok(
  $$update public.tags set id = gen_random_uuid() where name = 'Renamed'$$,
  '42501',
  null,
  'A updating a tag id is denied'
);

select throws_ok(
  $$update public.tags set created_at = now() where name = 'Renamed'$$,
  '42501',
  null,
  'A updating a tag created_at is denied'
);

-- B cannot see or change A's row.
select pg_temp.authenticate_as(pg_temp.user_b());

select is(
  (select count(*) from public.tags where user_id = pg_temp.user_a()),
  0::bigint,
  'B selects 0 of A''s tags'
);

with updated as (
  update public.tags
  set name = 'hijacked'
  where user_id = pg_temp.user_a()
  returning id
)
select is(
  (select count(*) from updated),
  0::bigint,
  'B updating A''s tag affects 0 rows'
);

with deleted as (
  delete from public.tags
  where user_id = pg_temp.user_a()
  returning id
)
select is(
  (select count(*) from deleted),
  0::bigint,
  'B deleting A''s tag affects 0 rows'
);

-- anon has no access.
select pg_temp.authenticate_anon();

select throws_ok(
  'select id from public.tags',
  '42501',
  null,
  'anon select on tags is denied'
);

select throws_ok(
  $$insert into public.tags (name) values ('Anon')$$,
  '42501',
  null,
  'anon insert on tags is denied'
);

-- truncate is not granted to authenticated.
select pg_temp.authenticate_as(pg_temp.user_a());

select throws_ok(
  'truncate public.tags',
  '42501',
  null,
  'truncate tags as authenticated is denied'
);

-- Name rules: case-insensitive uniqueness per user, and trimmed length 1–100.

select lives_ok(
  $$insert into public.tags (name) values ('Reading')$$,
  'A creates a tag named Reading'
);

select throws_ok(
  $$insert into public.tags (name) values ('reading')$$,
  '23505',
  null,
  'A creating a case-insensitive duplicate tag name is denied'
);

select throws_ok(
  $$update public.tags set name = 'READING' where name = 'Renamed'$$,
  '23505',
  null,
  'A renaming another tag to READING is denied'
);

select pg_temp.authenticate_as(pg_temp.user_b());

select lives_ok(
  $$insert into public.tags (name) values ('Reading')$$,
  'B creates a tag named Reading'
);

select throws_ok(
  $$insert into public.tags (name) values ('')$$,
  '23514',
  null,
  'an empty tag name is denied'
);

select throws_ok(
  $$insert into public.tags (name) values ('   ')$$,
  '23514',
  null,
  'a whitespace-only tag name is denied'
);

select throws_ok(
  $$insert into public.tags (name) values (repeat('a', 101))$$,
  '23514',
  null,
  'a 101-character tag name is denied'
);

select lives_ok(
  $$insert into public.tags (name) values (repeat('a', 100))$$,
  'a tag name of exactly 100 characters succeeds'
);

select * from finish();
rollback;
