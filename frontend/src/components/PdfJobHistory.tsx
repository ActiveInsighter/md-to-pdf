import { useMemo, useState } from 'react'
import { readableError, rebuildPdfJob, setPdfJobFavorite } from '../api/pdfJobs'
import type { PdfJob } from '../types/pdfJob'
import { getPdfJobProgress, getPdfJobStageLabel, PDF_JOB_STATUS_LABELS } from '../utils/pdfJobStatus'

type Props = {
  jobs: PdfJob[]
  loading: boolean
  lastSyncedAt: number | null
  error: string
  selectedJobId: string | null
  onRefresh: () => void
  onSelect: (job: PdfJob) => void
}

type JobGroup = {
  key: string
  label: string
  jobs: PdfJob[]
}

function compactDuration(job: PdfJob): string {
  const start = new Date(job.created_at).getTime()
  const end = new Date(job.completed_at || job.updated_at).getTime()
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return '—'
  const seconds = Math.round((end - start) / 1000)
  if (seconds < 60) return `${seconds} 秒`
  const minutes = Math.floor(seconds / 60)
  return `${minutes} 分 ${seconds % 60} 秒`
}

function formatDate(value: string | null | undefined): string {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString()
}

function buildGroups(jobs: PdfJob[]): JobGroup[] {
  const now = Date.now()
  const groups: JobGroup[] = [
    { key: 'day-1', label: '1 天内', jobs: [] },
    { key: 'day-3', label: '3 天内', jobs: [] },
    { key: 'day-7', label: '7 天内', jobs: [] },
    { key: 'day-30', label: '30 天内', jobs: [] },
    { key: 'favorite-older', label: '更早的收藏', jobs: [] },
  ]

  for (const job of jobs) {
    const createdAt = new Date(job.created_at).getTime()
    const ageDays = Number.isFinite(createdAt) ? Math.max(0, (now - createdAt) / 86_400_000) : 31
    const group = ageDays <= 1
      ? groups[0]
      : ageDays <= 3
        ? groups[1]
        : ageDays <= 7
          ? groups[2]
          : ageDays <= 30
            ? groups[3]
            : job.is_favorite
              ? groups[4]
              : null
    if (group) group.jobs.push(job)
  }

  for (const group of groups) {
    group.jobs.sort((a, b) => {
      if (a.is_favorite !== b.is_favorite) return a.is_favorite ? -1 : 1
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    })
  }
  return groups.filter((group) => group.jobs.length > 0)
}

export function PdfJobHistory({
  jobs,
  loading,
  lastSyncedAt,
  error,
  selectedJobId,
  onRefresh,
  onSelect,
}: Props) {
  const [actionJobId, setActionJobId] = useState<string | null>(null)
  const [actionError, setActionError] = useState('')
  const groups = useMemo(() => buildGroups(jobs), [jobs])
  const showInitialLoading = loading && jobs.length === 0
  const syncedTime = lastSyncedAt
    ? new Date(lastSyncedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : null
  const syncLabel = loading
    ? '同步中'
    : error
      ? '同步失败'
      : syncedTime
        ? `${syncedTime} 更新`
        : '未同步'

  const toggleFavorite = async (job: PdfJob) => {
    setActionJobId(job.id)
    setActionError('')
    try {
      await setPdfJobFavorite(job.id, !job.is_favorite)
      onRefresh()
    } catch (cause) {
      setActionError(readableError(cause))
    } finally {
      setActionJobId(null)
    }
  }

  const rebuild = async (job: PdfJob) => {
    setActionJobId(job.id)
    setActionError('')
    try {
      await rebuildPdfJob(job.id)
      onRefresh()
    } catch (cause) {
      setActionError(readableError(cause))
    } finally {
      setActionJobId(null)
    }
  }

  return (
    <section className="card history-card" aria-busy={loading}>
      <div className="section-heading history-heading">
        <div>
          <h2>任务记录</h2>
          <p>{syncLabel} · 最近 30 天</p>
        </div>
        <button
          type="button"
          className="history-refresh secondary"
          onClick={onRefresh}
          disabled={loading}
        >
          {loading ? '同步中' : '刷新'}
        </button>
      </div>

      {error && jobs.length > 0 && <p className="history-error" role="alert">{error}</p>}
      {actionError && <p className="history-error" role="alert">{actionError}</p>}

      {showInitialLoading ? (
        <div className="history-state" role="status">
          <strong>正在加载任务</strong>
        </div>
      ) : jobs.length === 0 ? (
        <div className="history-state history-empty">
          <strong>{error ? '任务暂时不可用' : '还没有任务'}</strong>
          <p>{error || '生成 PDF 后会显示在这里。'}</p>
        </div>
      ) : (
        <div className="history-groups">
          {groups.map((group) => (
            <section className="history-time-group" key={group.key}>
              <h3>{group.label}<span>{group.jobs.length}</span></h3>
              <div className="history-list">
                {group.jobs.map((job) => {
                  const selected = job.id === selectedJobId
                  const progress = getPdfJobProgress(job)
                  const createdAt = new Date(job.created_at).toLocaleString()
                  const actionBusy = actionJobId === job.id
                  const canRebuild = job.status !== 'expired' && Boolean(job.input_path)

                  return (
                    <article className={`history-item-card${selected ? ' is-selected' : ''}`} key={job.id}>
                      <button
                        type="button"
                        className="history-item"
                        onClick={() => onSelect(job)}
                        aria-label={`${job.document_name}，${PDF_JOB_STATUS_LABELS[job.status]}，${createdAt}`}
                        aria-pressed={selected}
                      >
                        <span className="history-item-topline">
                          <strong title={job.document_name}>{job.is_favorite ? '★ ' : ''}{job.document_name}</strong>
                          <span className={`badge status-${job.status}`}>{PDF_JOB_STATUS_LABELS[job.status]}</span>
                        </span>
                        <span className="history-stage">{getPdfJobStageLabel(job)}</span>
                        <span className="history-mini-progress" aria-label={`进度 ${progress}%`}>
                          <span style={{ width: `${progress}%` }} />
                        </span>
                        <span className="history-item-meta">
                          <time>{createdAt}</time>
                          <span>{compactDuration(job)}</span>
                        </span>
                      </button>

                      <details className="history-job-details">
                        <summary>详情与操作</summary>
                        <dl>
                          <div><dt>源文件</dt><dd>{job.source_filename}</dd></div>
                          <div><dt>主题</dt><dd>{job.theme}</dd></div>
                          <div><dt>Action Run</dt><dd>{job.github_run_id || '尚未关联'}</dd></div>
                          <div><dt>创建时间</dt><dd>{formatDate(job.created_at)}</dd></div>
                          <div><dt>完成时间</dt><dd>{formatDate(job.completed_at)}</dd></div>
                          <div><dt>保留期限</dt><dd>{job.is_favorite ? '收藏任务不会自动删除' : formatDate(job.expires_at)}</dd></div>
                        </dl>
                        {job.error_message && <p className="error-text">{job.error_message}</p>}
                        <div className="history-item-actions">
                          <button type="button" disabled={actionBusy} onClick={() => void toggleFavorite(job)}>
                            {job.is_favorite ? '取消收藏' : '收藏任务'}
                          </button>
                          <button
                            type="button"
                            className="secondary"
                            disabled={actionBusy || !canRebuild}
                            onClick={() => void rebuild(job)}
                            title={canRebuild ? '使用保留的源文件创建新任务' : '源文件已过期，无法重复构建'}
                          >
                            重复构建
                          </button>
                          {job.github_run_url && (
                            <a href={job.github_run_url} target="_blank" rel="noreferrer">Action 日志</a>
                          )}
                        </div>
                      </details>
                    </article>
                  )
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </section>
  )
}
