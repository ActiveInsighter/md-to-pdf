import { useMemo, useState } from 'react'
import { getPdfJob, readableError, rebuildPdfJob, setPdfJobFavorite } from '../api/pdfJobs'
import type { PdfJob } from '../types/pdfJob'
import {
  getPdfJobProgress,
  getPdfJobStageLabel,
  isTerminalPdfJobStatus,
  PDF_JOB_STATUS_LABELS,
} from '../utils/pdfJobStatus'

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

type HistoryFilter = 'all' | 'active' | 'favorite' | 'failed'

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
    { key: 'day-3', label: '1–3 天', jobs: [] },
    { key: 'day-7', label: '3–7 天', jobs: [] },
    { key: 'day-30', label: '7–30 天', jobs: [] },
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

function SearchIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <circle cx="8.5" cy="8.5" r="5" />
      <path d="m12.5 12.5 4 4" />
    </svg>
  )
}

function FavoriteIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="m10 2.8 2.1 4.3 4.7.7-3.4 3.3.8 4.7-4.2-2.2-4.2 2.2.8-4.7-3.4-3.3 4.7-.7z" />
    </svg>
  )
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
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<HistoryFilter>('all')

  const filterCounts = useMemo(() => ({
    all: jobs.length,
    active: jobs.filter((job) => !isTerminalPdfJobStatus(job.status)).length,
    favorite: jobs.filter((job) => job.is_favorite).length,
    failed: jobs.filter((job) => job.status === 'failed').length,
  }), [jobs])

  const visibleJobs = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase()
    return jobs.filter((job) => {
      const matchesQuery = !normalizedQuery || `${job.document_name} ${job.source_filename}`
        .toLocaleLowerCase()
        .includes(normalizedQuery)
      if (!matchesQuery) return false
      if (filter === 'active') return !isTerminalPdfJobStatus(job.status)
      if (filter === 'favorite') return job.is_favorite
      if (filter === 'failed') return job.status === 'failed'
      return true
    })
  }, [filter, jobs, query])

  const groups = useMemo(() => buildGroups(visibleJobs), [visibleJobs])
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
    } catch (cause) {
      setActionError(readableError(cause))
    } finally {
      onRefresh()
      setActionJobId(null)
    }
  }

  const rebuild = async (job: PdfJob) => {
    setActionJobId(job.id)
    setActionError('')
    try {
      const rebuilt = await rebuildPdfJob(job.id)
      const nextJob = await getPdfJob(rebuilt.jobId)
      onSelect(nextJob)
    } catch (cause) {
      setActionError(readableError(cause))
    } finally {
      onRefresh()
      setActionJobId(null)
    }
  }

  return (
    <section className="card history-card" aria-busy={loading}>
      <div className="section-heading history-heading">
        <div>
          <span className="section-kicker">LIBRARY</span>
          <h2>任务记录</h2>
          <p>{syncLabel} · 最近 30 天与长期收藏</p>
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

      <label className="history-search">
        <span><SearchIcon /></span>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜索任务或源文件"
          aria-label="搜索任务记录"
        />
      </label>

      <div className="history-filters" role="tablist" aria-label="筛选任务记录">
        {([
          ['all', '全部'],
          ['active', '进行中'],
          ['favorite', '收藏'],
          ['failed', '失败'],
        ] as const).map(([key, label]) => (
          <button
            type="button"
            role="tab"
            aria-selected={filter === key}
            className={filter === key ? 'is-active' : ''}
            onClick={() => setFilter(key)}
            key={key}
          >
            {label}<span>{filterCounts[key]}</span>
          </button>
        ))}
      </div>

      {error && jobs.length > 0 && <p className="history-error" role="alert">{error}</p>}
      {actionError && <p className="history-error" role="alert">{actionError}</p>}

      {showInitialLoading ? (
        <div className="history-state" role="status">
          <strong>正在加载任务</strong>
          <p>正在同步最新构建状态。</p>
        </div>
      ) : jobs.length === 0 ? (
        <div className="history-state history-empty">
          <strong>{error ? '任务暂时不可用' : '还没有任务'}</strong>
          <p>{error || '生成 PDF 后会显示在这里。'}</p>
        </div>
      ) : groups.length === 0 ? (
        <div className="history-state history-empty">
          <strong>没有匹配的任务</strong>
          <p>调整关键词或切换筛选条件。</p>
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
                          <strong title={job.document_name}>
                            {job.is_favorite && <span className="history-favorite-icon"><FavoriteIcon /></span>}
                            <span>{job.document_name}</span>
                          </strong>
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
                        {job.error_message && <p className="inline-message is-error">{job.error_message}</p>}
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
