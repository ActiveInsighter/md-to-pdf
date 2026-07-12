alter table public.pdf_jobs
  drop constraint if exists pdf_jobs_source_name_length_check,
  drop constraint if exists pdf_jobs_output_filename_length_check,
  drop column if exists source_name,
  drop column if exists output_filename;
