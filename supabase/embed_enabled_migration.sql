-- Epic #2 embed flag.
-- Enables per-project embed availability without breaking existing projects.

alter table public.projects
add column if not exists embed_enabled boolean not null default false;

create index if not exists idx_projects_embed_enabled
on public.projects(embed_enabled);
