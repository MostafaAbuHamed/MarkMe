create function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();

  return new;
end;
$$;

revoke execute on function private.set_updated_at() from public, anon, authenticated;

-- Column list must match the authenticated UPDATE grant on public.items
-- (20261021114734_items.sql). Keep the two lists identical.
create trigger items_set_updated_at
before update of
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
on public.items
for each row
execute function private.set_updated_at();
