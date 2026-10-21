begin;
\ir helpers/identity.psql
select plan(17);

-- Sign-up (users A and B come from the identity helper).
select is(
  (select display_name from public.profiles where id = pg_temp.user_a()),
  'Alice A',
  'sign-up sets A''s display_name from full_name'
);

select is(
  (select display_name from public.profiles where id = pg_temp.user_b()),
  'b',
  'sign-up with no full name uses the email local part'
);

-- Extra users are inserted as postgres. Same auth.users columns as the helper.
select pg_temp.reset_identity();

insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  raw_user_meta_data,
  created_at,
  updated_at
)
values (
  '00000000-0000-0000-0000-000000000000'::uuid,
  '00000000-0000-0000-0000-0000000000c1'::uuid,
  'authenticated',
  'authenticated',
  null,
  '{}'::jsonb,
  now(),
  now()
);

select ok(
  (
    select display_name is null
    from public.profiles
    where id = '00000000-0000-0000-0000-0000000000c1'::uuid
  ),
  'a user with neither full name nor email gets a null display_name'
);

select lives_ok(
  $$
    insert into auth.users (
      instance_id,
      id,
      aud,
      role,
      email,
      raw_user_meta_data,
      created_at,
      updated_at
    )
    values (
      '00000000-0000-0000-0000-000000000000'::uuid,
      '00000000-0000-0000-0000-0000000000c2'::uuid,
      'authenticated',
      'authenticated',
      'longname@test.local',
      jsonb_build_object('full_name', repeat('n', 150)),
      now(),
      now()
    )
  $$,
  'a 150-character full name does not block sign-up'
);

select is(
  (
    select display_name
    from public.profiles
    where id = '00000000-0000-0000-0000-0000000000c2'::uuid
  ),
  repeat('n', 100),
  'a 150-character full name is stored as 100 characters'
);

insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  raw_user_meta_data,
  created_at,
  updated_at
)
values (
  '00000000-0000-0000-0000-000000000000'::uuid,
  '00000000-0000-0000-0000-0000000000c3'::uuid,
  'authenticated',
  'authenticated',
  'spaced@test.local',
  '{"full_name":"   "}'::jsonb,
  now(),
  now()
);

select is(
  (
    select display_name
    from public.profiles
    where id = '00000000-0000-0000-0000-0000000000c3'::uuid
  ),
  'spaced',
  'a full name of only spaces falls back to the email local part'
);

-- Reads.
select pg_temp.authenticate_as(pg_temp.user_a());

select ok(
  (
    select count(*) = 1 and bool_and(id = pg_temp.user_a())
    from public.profiles
  ),
  'A selects profiles and sees exactly 1 row (their own)'
);

select pg_temp.authenticate_as(pg_temp.user_b());

select is(
  (select count(*) from public.profiles where id = pg_temp.user_a()),
  0::bigint,
  'B sees 0 of A''s profiles'
);

select pg_temp.authenticate_anon();

select throws_ok(
  'select id from public.profiles',
  '42501',
  null,
  'anon select on profiles is denied'
);

-- Writes.
select pg_temp.authenticate_as(pg_temp.user_a());

select lives_ok(
  $$
    update public.profiles
    set display_name = 'Renamed Alice'
    where id = pg_temp.user_a()
  $$,
  'A updates their own display_name'
);

select is(
  (select display_name from public.profiles where id = pg_temp.user_a()),
  'Renamed Alice',
  'A''s display_name update persists'
);

select pg_temp.authenticate_as(pg_temp.user_b());

with updated as (
  update public.profiles
  set display_name = 'hijacked'
  where id = pg_temp.user_a()
  returning id
)
select is(
  (select count(*) from updated),
  0::bigint,
  'B updating A''s profile affects 0 rows'
);

select pg_temp.authenticate_as(pg_temp.user_a());

select throws_ok(
  $$update public.profiles set created_at = now() where id = pg_temp.user_a()$$,
  '42501',
  null,
  'A updating created_at is denied'
);

select throws_ok(
  $$update public.profiles set display_name = repeat('x', 101) where id = pg_temp.user_a()$$,
  '23514',
  null,
  'A updating display_name to 101 characters is rejected'
);

select throws_ok(
  $$insert into public.profiles (id) values (pg_temp.user_a())$$,
  '42501',
  null,
  'A inserting a profile is denied'
);

select throws_ok(
  $$delete from public.profiles where id = pg_temp.user_a()$$,
  '42501',
  null,
  'A deleting a profile is denied'
);

select pg_temp.reset_identity();

delete from auth.users where id = pg_temp.user_a();

select is(
  (select count(*) from public.profiles where id = pg_temp.user_a()),
  0::bigint,
  'deleting A from auth.users removes A''s profile'
);

select * from finish();
rollback;
