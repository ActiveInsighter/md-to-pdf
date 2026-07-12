alter table public.pdf_jobs
  add column if not exists source_name text not null default '未命名文档.md',
  add column if not exists output_filename text not null default '未命名文档.pdf';

update public.pdf_jobs
set source_name = concat('文档-', left(id::text, 8), '.md'),
    output_filename = concat('文档-', left(id::text, 8), '.pdf')
where source_name = '未命名文档.md'
  and output_filename = '未命名文档.pdf';

alter table public.pdf_jobs
  drop constraint if exists pdf_jobs_source_name_length_check,
  add constraint pdf_jobs_source_name_length_check
    check (char_length(source_name) between 4 and 180),
  drop constraint if exists pdf_jobs_output_filename_length_check,
  add constraint pdf_jobs_output_filename_length_check
    check (char_length(output_filename) between 5 and 180);

comment on column public.pdf_jobs.source_name is 'Original Markdown filename shown as the PDF job name.';
comment on column public.pdf_jobs.output_filename is 'User-facing PDF download filename derived from source_name.';
