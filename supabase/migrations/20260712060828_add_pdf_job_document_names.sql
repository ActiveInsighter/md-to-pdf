alter table public.pdf_jobs
  add column if not exists source_filename text,
  add column if not exists document_name text;

update public.pdf_jobs
set document_name = coalesce(
      nullif(document_name, ''),
      '历史任务 ' || left(id::text, 8)
    ),
    source_filename = coalesce(
      nullif(source_filename, ''),
      '历史任务-' || left(id::text, 8) || '.md'
    )
where document_name is null
   or document_name = ''
   or source_filename is null
   or source_filename = '';

alter table public.pdf_jobs
  alter column source_filename set not null,
  alter column document_name set not null;

alter table public.pdf_jobs
  drop constraint if exists pdf_jobs_source_filename_length,
  add constraint pdf_jobs_source_filename_length
    check (char_length(source_filename) between 4 and 180),
  drop constraint if exists pdf_jobs_document_name_length,
  add constraint pdf_jobs_document_name_length
    check (char_length(document_name) between 1 and 160);

comment on column public.pdf_jobs.source_filename is 'Sanitized original Markdown filename, including the .md extension.';
comment on column public.pdf_jobs.document_name is 'Human-readable task name derived from the source Markdown filename.';
