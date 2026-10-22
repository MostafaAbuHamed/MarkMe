alter table public.items
add constraint items_user_normalized_url_uq unique (user_id, normalized_url);

alter table public.items
add constraint items_url_chk check (url ~* '^https?://' and char_length(url) <= 2048);

alter table public.items
add constraint items_normalized_url_chk check (
  normalized_url ~* '^https?://' and char_length(normalized_url) <= 2048
);

alter table public.items
add constraint items_title_len_chk check (char_length(title) <= 500);

alter table public.items
add constraint items_description_len_chk check (char_length(description) <= 2000);

alter table public.items
add constraint items_note_len_chk check (char_length(note) <= 1000);

alter table public.items
add constraint items_site_name_len_chk check (char_length(site_name) <= 200);

alter table public.items
add constraint items_image_url_len_chk check (char_length(image_url) <= 2048);

alter table public.items
add constraint items_favicon_url_len_chk check (char_length(favicon_url) <= 2048);

alter table public.items
add constraint items_embed_pair_chk check ((embed_provider is null) = (embed_id is null));

alter table public.items
add constraint items_embed_youtube_chk check (
  embed_provider is distinct from 'youtube' or embed_id ~ '^[A-Za-z0-9_-]{11}$'
);
