alter table public.pdf_jobs
  drop constraint if exists pdf_jobs_status_check;

alter table public.pdf_jobs
  add constraint pdf_jobs_status_check
  check (
    status in (
      'created',
      'uploaded',
      'queued',
      'building',
      'uploading',
      'completed',
      'failed',
      'cancelled',
      'expired'
    )
  );

-- Earlier cancellation requests were represented as failed jobs with a
-- sentinel message. Normalize those rows before the transition guard is
-- installed so existing cancelled work follows the first-class lifecycle.
update public.pdf_jobs
set status = 'cancelled',
    progress_stage = 'cancelled',
    error_message = null,
    completed_at = coalesce(completed_at, updated_at, pg_catalog.now()),
    updated_at = pg_catalog.now()
where status = 'failed'
  and error_message = '用户已取消未启动任务。';

create or replace function public.enforce_pdf_job_status_transition()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  if not (
    (old.status = 'created' and new.status in ('uploaded', 'failed', 'cancelled', 'expired'))
    or (old.status = 'uploaded' and new.status in ('queued', 'failed', 'cancelled', 'expired'))
    or (old.status = 'queued' and new.status in ('building', 'failed'))
    or (old.status = 'building' and new.status in ('uploading', 'failed'))
    or (old.status = 'uploading' and new.status in ('completed', 'failed'))
    or (old.status in ('completed', 'failed', 'cancelled') and new.status = 'expired')
  ) then
    raise exception 'Illegal PDF job status transition: % -> %', old.status, new.status
      using errcode = 'check_violation';
  end if;

  return new;
end
$$;

drop trigger if exists enforce_pdf_job_status_transition on public.pdf_jobs;
create trigger enforce_pdf_job_status_transition
before update of status on public.pdf_jobs
for each row execute function public.enforce_pdf_job_status_transition();

create or replace function public.sync_pdf_job_lifecycle()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  lifecycle_time timestamptz := coalesce(new.updated_at, now());
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    case new.status
      when 'created' then
        new.progress_percent := 0;
        new.progress_stage := 'created';
      when 'uploaded' then
        new.progress_percent := greatest(new.progress_percent, 15);
        new.progress_stage := 'input-ready';
        new.uploaded_at := coalesce(new.uploaded_at, lifecycle_time);
      when 'queued' then
        new.progress_percent := greatest(new.progress_percent, 25);
        new.progress_stage := 'queued';
        new.uploaded_at := coalesce(new.uploaded_at, lifecycle_time);
        new.queued_at := coalesce(new.queued_at, lifecycle_time);
      when 'building' then
        new.progress_percent := greatest(new.progress_percent, 35);
        new.progress_stage := 'runner-started';
        new.started_at := coalesce(new.started_at, lifecycle_time);
      when 'uploading' then
        new.progress_percent := greatest(new.progress_percent, 90);
        new.progress_stage := 'uploading-output';
        new.uploading_at := coalesce(new.uploading_at, lifecycle_time);
      when 'completed' then
        new.progress_percent := 100;
        new.progress_stage := 'completed';
        new.completed_at := coalesce(new.completed_at, lifecycle_time);
      when 'failed' then
        new.progress_stage := 'failed';
        new.completed_at := coalesce(new.completed_at, lifecycle_time);
      when 'cancelled' then
        new.progress_stage := 'cancelled';
        new.completed_at := coalesce(new.completed_at, lifecycle_time);
      when 'expired' then
        new.progress_percent := 100;
        new.progress_stage := 'expired';
      else
        null;
    end case;
  end if;

  return new;
end
$$;

create or replace function public.complete_pdf_job_from_storage_object()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  job_id uuid;
begin
  if new.bucket_id <> 'pdf-jobs'
     or new.name !~ '^jobs/[0-9a-fA-F-]{36}/output\.pdf$' then
    return new;
  end if;

  begin
    job_id := pg_catalog.split_part(new.name, '/', 2)::uuid;
  exception
    when invalid_text_representation then
      return new;
  end;

  update public.pdf_jobs
  set status = 'completed',
      progress_percent = 100,
      progress_stage = 'completed',
      output_path = new.name,
      completed_at = coalesce(completed_at, pg_catalog.now()),
      updated_at = pg_catalog.now(),
      error_message = null
  where id = job_id
    and status = 'uploading';

  return new;
end;
$$;

revoke all on function public.complete_pdf_job_from_storage_object() from public;
revoke all on function public.complete_pdf_job_from_storage_object() from anon;
revoke all on function public.complete_pdf_job_from_storage_object() from authenticated;
revoke all on function public.complete_pdf_job_from_storage_object() from service_role;
