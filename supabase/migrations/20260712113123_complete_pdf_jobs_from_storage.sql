create or replace function public.complete_pdf_job_from_storage_object()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, storage
as $$
declare
  job_id uuid;
begin
  if new.bucket_id <> 'pdf-jobs'
     or new.name !~ '^jobs/[0-9a-fA-F-]{36}/output\.pdf$' then
    return new;
  end if;

  begin
    job_id := split_part(new.name, '/', 2)::uuid;
  exception
    when invalid_text_representation then
      return new;
  end;

  update public.pdf_jobs
  set status = 'completed',
      progress_percent = 100,
      progress_stage = 'completed',
      output_path = new.name,
      completed_at = coalesce(completed_at, now()),
      updated_at = now(),
      error_message = null
  where id = job_id
    and status in ('queued', 'building', 'uploading');

  return new;
end;
$$;

revoke all on function public.complete_pdf_job_from_storage_object() from public;

drop trigger if exists complete_pdf_job_after_storage_upload on storage.objects;
create trigger complete_pdf_job_after_storage_upload
after insert or update on storage.objects
for each row
when (
  new.bucket_id = 'pdf-jobs'
  and new.name ~ '^jobs/[0-9a-fA-F-]{36}/output\.pdf$'
)
execute function public.complete_pdf_job_from_storage_object();
