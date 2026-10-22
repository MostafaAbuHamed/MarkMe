alter table public.folders
add constraint folders_name_len_chk check (char_length(btrim(name)) between 1 and 100);

create unique index folders_user_name_uq on public.folders (user_id, lower(name));

alter table public.tags
add constraint tags_name_len_chk check (char_length(btrim(name)) between 1 and 100);

create unique index tags_user_name_uq on public.tags (user_id, lower(name));
