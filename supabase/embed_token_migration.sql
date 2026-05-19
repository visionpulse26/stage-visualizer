-- EPIC #2 P9 — Opaque embed token (public URLs must not expose raw project UUID)
-- Run in Supabase SQL Editor after backup.

alter table public.projects
  add column if not exists embed_token uuid;

-- Backfill: unique per row (multiple NULLs allowed before NOT NULL)
update public.projects
set embed_token = gen_random_uuid()
where embed_token is null;

create unique index if not exists projects_embed_token_key
  on public.projects (embed_token);

alter table public.projects
  alter column embed_token set default gen_random_uuid();

alter table public.projects
  alter column embed_token set not null;

comment on column public.projects.embed_token is
  'Public embed URL segment; regenerate to revoke old iframe links.';
