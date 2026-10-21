create table public.folders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique (id, user_id)
);

revoke all on public.folders from anon;

revoke insert, update, truncate, references, trigger on public.folders from authenticated;

grant insert (name), update (name) on public.folders to authenticated;

alter table public.folders enable row level security;

create policy folders_select_own
on public.folders
for select
to authenticated
using (user_id = (select auth.uid()));

create policy folders_insert_own
on public.folders
for insert
to authenticated
with check (user_id = (select auth.uid()));

create policy folders_update_own
on public.folders
for update
to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create policy folders_delete_own
on public.folders
for delete
to authenticated
using (user_id = (select auth.uid()));

create table public.tags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique (id, user_id)
);

revoke all on public.tags from anon;

revoke insert, update, truncate, references, trigger on public.tags from authenticated;

grant insert (name), update (name) on public.tags to authenticated;

alter table public.tags enable row level security;

create policy tags_select_own
on public.tags
for select
to authenticated
using (user_id = (select auth.uid()));

create policy tags_insert_own
on public.tags
for insert
to authenticated
with check (user_id = (select auth.uid()));

create policy tags_update_own
on public.tags
for update
to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create policy tags_delete_own
on public.tags
for delete
to authenticated
using (user_id = (select auth.uid()));
