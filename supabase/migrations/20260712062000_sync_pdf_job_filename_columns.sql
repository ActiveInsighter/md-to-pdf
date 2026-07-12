alter table public.pdf_jobs
  add column if not exists source_name text,
  add column if not exists output_filename text;

create or replace function public.sync_pdf_job_filename_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  canonical_source text;
  canonical_document text;
begin
  if tg_op = 'UPDATE'
     and new.source_name is distinct from old.source_name
     and new.source_filename is not distinct from old.source_filename then
    canonical_source := nullif(btrim(new.source_name), '');
  else
    canonical_source := coalesce(
      nullif(btrim(new.source_filename), ''),
      nullif(btrim(new.source_name), ''),
      'document.md'
    );
  end if;

  if lower(right(canonical_source, 3)) <> '.md' then
    canonical_source := canonical_source || '.md';
  end if;
  canonical_source := left(canonical_source, 180);

  if tg_op = 'UPDATE'
     and new.document_name is distinct from old.document_name
     and new.source_filename is not distinct from old.source_filename
     and new.source_name is not distinct from old.source_name then
    canonical_document := nullif(btrim(new.document_name), '');
  else
    canonical_document := nullif(
      btrim(regexp_replace(canonical_source, '\.md$', '', 'i')),
      ''
    );
  end if;

  canonical_document := left(coalesce(canonical_document, 'document'), 160);

  new.source_filename := canonical_source;
  new.source_name := canonical_source;
  new.document_name := canonical_document;
  new.output_filename := canonical_document || '.pdf';
  return new;
end
$$;

update public.pdf_jobs
set source_filename = coalesce(nullif(source_filename, ''), nullif(source_name, ''), 'document.md'),
    source_name = coalesce(nullif(source_filename, ''), nullif(source_name, ''), 'document.md'),
    document_name = left(coalesce(
      nullif(document_name, ''),
      nullif(regexp_replace(coalesce(nullif(source_filename, ''), nullif(source_name, ''), 'document.md'), '\.md$', '', 'i'), ''),
      'document'
    ), 160),
    output_filename = left(coalesce(
      nullif(document_name, ''),
      nullif(regexp_replace(coalesce(nullif(source_filename, ''), nullif(source_name, ''), 'document.md'), '\.md$', '', 'i'), ''),
      'document'
    ), 160) || '.pdf';

alter table public.pdf_jobs
  alter column source_filename set not null,
  alter column document_name set not null,
  alter column source_name set not null,
  alter column output_filename set not null;

drop trigger if exists sync_pdf_job_filename_columns on public.pdf_jobs;
create trigger sync_pdf_job_filename_columns
before insert or update of source_filename, document_name, source_name, output_filename
on public.pdf_jobs
for each row execute function public.sync_pdf_job_filename_columns();

comment on column public.pdf_jobs.source_name is 'Compatibility alias of source_filename.';
comment on column public.pdf_jobs.output_filename is 'Compatibility PDF filename derived from document_name.';
