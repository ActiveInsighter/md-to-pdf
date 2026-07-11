create table if not exists public.pdf_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'created'
    check (status in ('created', 'uploaded', 'queued', 'building', 'uploading', 'completed', 'failed', 'expired')),
  input_path text,
  assets_path text,
  output_path text,
  has_assets boolean not null default false,
  theme text not null default 'chatgpt-light'
    check (theme ~ '^[A-Za-z0-9][A-Za-z0-9._-]*$'),
  options jsonb not null default '{"breaks": true, "toc": true}'::jsonb,
  github_run_id bigint,
  github_run_url text,
  github_commit text,
  error_message text,
  attempt_count smallint not null default 0 check (attempt_count between 0 and 3),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  expires_at timestamptz not null default (now() + interval '7 days'),
  constraint pdf_jobs_input_path_check check (
    input_path is null or input_path = 'jobs/' || id::text || '/input.md'
  ),
  constraint pdf_jobs_assets_path_check check (
    assets_path is null or assets_path = 'jobs/' || id::text || '/assets.zip'
  ),
  constraint pdf_jobs_output_path_check check (
    output_path is null or output_path = 'jobs/' || id::text || '/output.pdf'
  ),
  constraint pdf_jobs_options_object_check check (jsonb_typeof(options) = 'object')
);

create index if not exists pdf_jobs_user_created_idx
  on public.pdf_jobs (user_id, created_at desc);
create index if not exists pdf_jobs_status_idx
  on public.pdf_jobs (status);
create index if not exists pdf_jobs_expires_idx
  on public.pdf_jobs (expires_at)
  where status <> 'expired';

alter table public.pdf_jobs enable row level security;

revoke all on public.pdf_jobs from anon;
revoke all on public.pdf_jobs from authenticated;
grant select on public.pdf_jobs to authenticated;

create policy "Users can read their own PDF jobs"
on public.pdf_jobs
for select
to authenticated
using ((select auth.uid()) = user_id);

insert into storage.buckets (id, name, public, file_size_limit)
values ('pdf-jobs', 'pdf-jobs', false, 209715200)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit;

create policy "Users can inspect their own pending PDF inputs"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'pdf-jobs'
  and exists (
    select 1
    from public.pdf_jobs job
    where job.user_id = (select auth.uid())
      and job.id::text = split_part(name, '/', 2)
      and job.status = 'created'
      and name in (job.input_path, job.assets_path)
  )
);

create policy "Users can upload their own PDF inputs"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'pdf-jobs'
  and exists (
    select 1
    from public.pdf_jobs job
    where job.user_id = (select auth.uid())
      and job.id::text = split_part(name, '/', 2)
      and job.status = 'created'
      and name in (job.input_path, job.assets_path)
  )
);

create policy "Users can replace their own pending PDF inputs"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'pdf-jobs'
  and exists (
    select 1
    from public.pdf_jobs job
    where job.user_id = (select auth.uid())
      and job.id::text = split_part(name, '/', 2)
      and job.status = 'created'
      and name in (job.input_path, job.assets_path)
  )
)
with check (
  bucket_id = 'pdf-jobs'
  and exists (
    select 1
    from public.pdf_jobs job
    where job.user_id = (select auth.uid())
      and job.id::text = split_part(name, '/', 2)
      and job.status = 'created'
      and name in (job.input_path, job.assets_path)
  )
);

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'pdf_jobs'
  ) then
    alter publication supabase_realtime add table public.pdf_jobs;
  end if;
end
$$;
