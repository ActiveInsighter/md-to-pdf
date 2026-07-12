alter table public.pdf_jobs
  add column if not exists is_favorite boolean not null default false,
  add column if not exists source_job_id uuid references public.pdf_jobs(id) on delete set null;

alter table public.pdf_jobs
  alter column expires_at set default (now() + interval '30 days');

update public.pdf_jobs
set expires_at = greatest(expires_at, created_at + interval '30 days')
where status <> 'expired'
  and is_favorite = false;

create index if not exists pdf_jobs_user_favorite_created_idx
  on public.pdf_jobs (user_id, is_favorite desc, created_at desc);

create index if not exists pdf_jobs_cleanup_idx
  on public.pdf_jobs (expires_at)
  where status <> 'expired' and is_favorite = false;

create index if not exists pdf_jobs_source_job_idx
  on public.pdf_jobs (source_job_id)
  where source_job_id is not null;

comment on column public.pdf_jobs.is_favorite is
  'Favorite jobs are excluded from automatic storage cleanup.';

comment on column public.pdf_jobs.source_job_id is
  'Original job used when the task was rebuilt from retained source files.';
