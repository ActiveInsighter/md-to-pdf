alter table public.pdf_jobs
  add column if not exists progress_percent smallint not null default 0
    check (progress_percent between 0 and 100),
  add column if not exists progress_stage text not null default 'created'
    check (progress_stage ~ '^[a-z][a-z0-9-]{0,47}$'),
  add column if not exists uploaded_at timestamptz,
  add column if not exists queued_at timestamptz,
  add column if not exists rendering_at timestamptz,
  add column if not exists uploading_at timestamptz;

update public.pdf_jobs
set progress_percent = case status
      when 'created' then 0
      when 'uploaded' then 15
      when 'queued' then 25
      when 'building' then 60
      when 'uploading' then 90
      when 'completed' then 100
      when 'expired' then 100
      else greatest(progress_percent, 0)
    end,
    progress_stage = case status
      when 'created' then 'created'
      when 'uploaded' then 'input-ready'
      when 'queued' then 'queued'
      when 'building' then 'rendering'
      when 'uploading' then 'uploading-output'
      when 'completed' then 'completed'
      when 'failed' then 'failed'
      when 'expired' then 'expired'
      else progress_stage
    end,
    uploaded_at = coalesce(uploaded_at, case when status in ('uploaded', 'queued', 'building', 'uploading', 'completed', 'failed', 'expired') then updated_at end),
    queued_at = coalesce(queued_at, case when status in ('queued', 'building', 'uploading', 'completed', 'failed', 'expired') then started_at end),
    rendering_at = coalesce(rendering_at, case when status in ('building', 'uploading', 'completed', 'failed', 'expired') then started_at end),
    uploading_at = coalesce(uploading_at, case when status in ('uploading', 'completed', 'failed', 'expired') then completed_at end)
where progress_stage = 'created'
   or progress_percent = 0
   or uploaded_at is null
   or queued_at is null
   or rendering_at is null
   or uploading_at is null;

comment on column public.pdf_jobs.progress_percent is 'Latest server-confirmed PDF build milestone from 0 to 100.';
comment on column public.pdf_jobs.progress_stage is 'Machine-readable lifecycle stage reported by the upload API or GitHub Actions.';
comment on column public.pdf_jobs.uploaded_at is 'Time when required input objects were confirmed in private storage.';
comment on column public.pdf_jobs.queued_at is 'Time when the GitHub Actions workflow dispatch was accepted.';
comment on column public.pdf_jobs.rendering_at is 'Time when Chromium PDF rendering began.';
comment on column public.pdf_jobs.uploading_at is 'Time when the generated PDF began uploading to private storage.';
