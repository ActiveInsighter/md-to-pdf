alter table public.pdf_jobs
  add column if not exists progress_percent smallint not null default 0
    check (progress_percent between 0 and 100),
  add column if not exists progress_message text not null default '等待上传文件',
  add column if not exists progress_updated_at timestamptz not null default now(),
  add column if not exists status_changed_at timestamptz not null default now(),
  add column if not exists uploaded_at timestamptz,
  add column if not exists queued_at timestamptz,
  add column if not exists uploading_at timestamptz,
  add column if not exists failed_at timestamptz;

update public.pdf_jobs
set progress_percent = case status
      when 'created' then 5
      when 'uploaded' then 25
      when 'queued' then 35
      when 'building' then 60
      when 'uploading' then 92
      when 'completed' then 100
      when 'failed' then greatest(progress_percent, 1)
      when 'expired' then progress_percent
      else progress_percent
    end,
    progress_message = case status
      when 'created' then '等待上传文件'
      when 'uploaded' then '文件上传完成'
      when 'queued' then '已进入构建队列'
      when 'building' then '正在生成 PDF'
      when 'uploading' then '正在上传生成结果'
      when 'completed' then 'PDF 已生成，可以下载'
      when 'failed' then coalesce(nullif(error_message, ''), 'PDF 构建失败')
      when 'expired' then '任务已过期'
      else progress_message
    end,
    uploaded_at = case
      when status in ('uploaded', 'queued', 'building', 'uploading', 'completed', 'failed')
        then coalesce(uploaded_at, created_at)
      else uploaded_at
    end,
    queued_at = case
      when status in ('queued', 'building', 'uploading', 'completed', 'failed')
        then coalesce(queued_at, started_at, created_at)
      else queued_at
    end,
    uploading_at = case
      when status in ('uploading', 'completed')
        then coalesce(uploading_at, completed_at, updated_at)
      else uploading_at
    end,
    failed_at = case
      when status = 'failed' then coalesce(failed_at, completed_at, updated_at)
      else failed_at
    end,
    progress_updated_at = coalesce(updated_at, created_at),
    status_changed_at = coalesce(updated_at, created_at);

create index if not exists pdf_jobs_active_progress_idx
  on public.pdf_jobs (status, progress_updated_at desc)
  where status in ('queued', 'building', 'uploading');
