create schema private;

revoke all on schema private from public, anon, authenticated;

create type public.media_type as enum ('article', 'video', 'image', 'post', 'link');

create type public.preview_status as enum ('pending', 'ok', 'failed');

create type public.embed_provider as enum ('youtube');
