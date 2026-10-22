-- Splits text on URL separators before tokenizing. search_items applies the same
-- translate to the query; keep the two separator lists identical.
create function private.search_words(p_text text)
returns tsvector
language sql
immutable
set search_path = ''
as $$
  select to_tsvector(
    'simple',
    translate(coalesce(p_text, ''), '/:.?=&_-', '        ')
  );
$$;

revoke execute on function private.search_words(text) from public, anon, authenticated;

create function private.item_search_vector(
  p_item_id uuid,
  p_title text,
  p_description text,
  p_note text,
  p_url text
)
returns tsvector
language sql
stable
set search_path = ''
as $$
  select
    setweight(private.search_words(p_title), 'A')
    || setweight(
      private.search_words(
        (
          select string_agg(tags.name, ' ')
          from public.item_tags
          join public.tags on tags.id = item_tags.tag_id
          where item_tags.item_id = p_item_id
        )
      ),
      'B'
    )
    || setweight(private.search_words(p_note), 'B')
    || setweight(private.search_words(p_description), 'C')
    || setweight(private.search_words(p_url), 'D');
$$;

revoke execute on function private.item_search_vector(uuid, text, text, text, text)
from public, anon, authenticated;

create function private.items_set_search_vector()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.search_vector := private.item_search_vector(
    new.id,
    new.title,
    new.description,
    new.note,
    new.url
  );

  return new;
end;
$$;

revoke execute on function private.items_set_search_vector() from public, anon, authenticated;

create trigger items_search_vector
before insert or update of
  title,
  description,
  note,
  url
on public.items
for each row
execute function private.items_set_search_vector();

create function private.item_tags_refresh_vector()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.items
  set search_vector = private.item_search_vector(id, title, description, note, url)
  where id = coalesce(new.item_id, old.item_id);

  return null;
end;
$$;

revoke execute on function private.item_tags_refresh_vector() from public, anon, authenticated;

create trigger item_tags_refresh_vector
after insert or delete
on public.item_tags
for each row
execute function private.item_tags_refresh_vector();

create function private.tags_refresh_vectors()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.items
  set search_vector = private.item_search_vector(id, title, description, note, url)
  where id in (
    select item_id
    from public.item_tags
    where tag_id = new.id
  );

  return null;
end;
$$;

revoke execute on function private.tags_refresh_vectors() from public, anon, authenticated;

create trigger tags_refresh_vectors
after update of name
on public.tags
for each row
execute function private.tags_refresh_vectors();

create index items_search_vector_idx
on public.items
using gin (search_vector);
