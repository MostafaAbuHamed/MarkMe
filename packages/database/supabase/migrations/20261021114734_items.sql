create table public.items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  url text not null,
  normalized_url text not null,
  title text,
  description text,
  image_url text,
  favicon_url text,
  site_name text,
  media_type public.media_type not null default 'link',
  embed_provider public.embed_provider,
  embed_id text,
  folder_id uuid,
  note text,
  preview_status public.preview_status not null default 'pending',
  preview_fetched_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  search_vector tsvector not null default ''::tsvector,
  foreign key (folder_id, user_id) references public.folders (id, user_id) on delete set null (folder_id)
);

create index items_user_created_at_id_idx
on public.items (user_id, created_at desc, id desc);

create index items_user_folder_id_idx
on public.items (user_id, folder_id);

create table public.item_tags (
  item_id uuid not null references public.items (id) on delete cascade,
  tag_id uuid not null references public.tags (id) on delete cascade,
  primary key (item_id, tag_id)
);

create index item_tags_tag_id_idx
on public.item_tags (tag_id);

revoke all on public.items from anon;

revoke insert, update, truncate, references, trigger on public.items from authenticated;

grant insert (
  url,
  normalized_url,
  title,
  description,
  image_url,
  favicon_url,
  site_name,
  media_type,
  embed_provider,
  embed_id,
  folder_id,
  note,
  preview_status,
  preview_fetched_at
) on public.items to authenticated;

grant update (
  title,
  description,
  image_url,
  favicon_url,
  site_name,
  media_type,
  embed_provider,
  embed_id,
  folder_id,
  note,
  preview_status,
  preview_fetched_at
) on public.items to authenticated;

revoke all on public.item_tags from anon;

revoke update, truncate, references, trigger on public.item_tags from authenticated;

alter table public.items enable row level security;

create policy items_select_own
on public.items
for select
to authenticated
using (user_id = (select auth.uid()));

create policy items_insert_own
on public.items
for insert
to authenticated
with check (user_id = (select auth.uid()));

create policy items_update_own
on public.items
for update
to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create policy items_delete_own
on public.items
for delete
to authenticated
using (user_id = (select auth.uid()));

alter table public.item_tags enable row level security;

create policy item_tags_select_own
on public.item_tags
for select
to authenticated
using (
  exists (
    select 1
    from public.items i
    where i.id = item_id
      and i.user_id = (select auth.uid())
  )
  and exists (
    select 1
    from public.tags t
    where t.id = tag_id
      and t.user_id = (select auth.uid())
  )
);

create policy item_tags_insert_own
on public.item_tags
for insert
to authenticated
with check (
  exists (
    select 1
    from public.items i
    where i.id = item_id
      and i.user_id = (select auth.uid())
  )
  and exists (
    select 1
    from public.tags t
    where t.id = tag_id
      and t.user_id = (select auth.uid())
  )
);

create policy item_tags_delete_own
on public.item_tags
for delete
to authenticated
using (
  exists (
    select 1
    from public.items i
    where i.id = item_id
      and i.user_id = (select auth.uid())
  )
  and exists (
    select 1
    from public.tags t
    where t.id = tag_id
      and t.user_id = (select auth.uid())
  )
);
