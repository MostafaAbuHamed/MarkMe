create function public.search_items(
  p_query text default null,
  p_folder_id uuid default null,
  p_no_folder boolean default false,
  p_tag_ids uuid[] default null,
  p_limit int default 20,
  p_offset int default 0
)
returns table (
  id uuid,
  url text,
  normalized_url text,
  title text,
  description text,
  image_url text,
  favicon_url text,
  site_name text,
  media_type public.media_type,
  embed_provider public.embed_provider,
  embed_id text,
  folder_id uuid,
  note text,
  preview_status public.preview_status,
  preview_fetched_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  tags jsonb,
  rank real
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_terms text;
  v_tsquery pg_catalog.tsquery;
  v_limit integer;
  v_offset integer;
  v_tag_ids uuid[];
  v_no_folder boolean;
begin
  v_no_folder := coalesce(p_no_folder, false);

  if p_folder_id is not null and v_no_folder then
    raise exception 'p_folder_id and p_no_folder cannot be combined'
      using errcode = '22023';
  end if;

  v_limit := least(greatest(coalesce(p_limit, 20), 1), 50);
  v_offset := greatest(coalesce(p_offset, 0), 0);

  if p_tag_ids is null or coalesce(pg_catalog.cardinality(p_tag_ids), 0) = 0 then
    v_tag_ids := null;
  else
    select pg_catalog.array_agg(distinct tag_id)
    into v_tag_ids
    from pg_catalog.unnest(p_tag_ids) as tag_id;
  end if;

  -- Split on the same separators as private.search_words, so a dotted or hyphenated
  -- query matches the indexed parts. Each lexeme is a quoted prefix literal:
  -- backslash escaped, quotes doubled.
  select pg_catalog.string_agg(
    ''''
      || pg_catalog.replace(
        pg_catalog.replace(lex.lexeme, E'\\', E'\\\\'),
        '''',
        ''''''
      )
      || ''':*',
    ' & '
  )
  into v_terms
  from pg_catalog.unnest(
    pg_catalog.to_tsvector(
      'simple',
      pg_catalog.translate(coalesce(p_query, ''), '/:.?=&_-', '        ')
    )
  ) as lex(lexeme, positions, weights);

  if v_terms is null then
    v_tsquery := null;
  else
    v_tsquery := pg_catalog.to_tsquery('simple', v_terms);
  end if;

  return query
  select
    i.id,
    i.url,
    i.normalized_url,
    i.title,
    i.description,
    i.image_url,
    i.favicon_url,
    i.site_name,
    i.media_type,
    i.embed_provider,
    i.embed_id,
    i.folder_id,
    i.note,
    i.preview_status,
    i.preview_fetched_at,
    i.created_at,
    i.updated_at,
    coalesce(
      (
        select pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object('id', t.id, 'name', t.name)
          order by pg_catalog.lower(t.name)
        )
        from public.item_tags as it
        join public.tags as t on t.id = it.tag_id
        where it.item_id = i.id
      ),
      '[]'::jsonb
    ),
    case
      when v_tsquery is null then 0::real
      else pg_catalog.ts_rank_cd(i.search_vector, v_tsquery)
    end
  from public.items as i
  where
    (v_tsquery is null or i.search_vector @@ v_tsquery)
    and (p_folder_id is null or i.folder_id = p_folder_id)
    and (not v_no_folder or i.folder_id is null)
    and (
      v_tag_ids is null
      or (
        select pg_catalog.count(distinct it.tag_id)
        from public.item_tags as it
        where it.item_id = i.id
          and it.tag_id = any (v_tag_ids)
      ) = pg_catalog.cardinality(v_tag_ids)
    )
  order by
    (
      case
        when v_tsquery is null then 0::real
        else pg_catalog.ts_rank_cd(i.search_vector, v_tsquery)
      end
    ) desc,
    i.created_at desc,
    i.id desc
  limit v_limit
  offset v_offset;
end;
$$;

revoke execute on function public.search_items(text, uuid, boolean, uuid[], int, int)
from public, anon;

grant execute on function public.search_items(text, uuid, boolean, uuid[], int, int)
to authenticated;
