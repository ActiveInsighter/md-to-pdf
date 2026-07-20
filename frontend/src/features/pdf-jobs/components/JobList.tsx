import { Fragment } from 'react'
import { FileText, Heart, MoreHorizontal } from 'lucide-react'
import { Link } from 'react-router-dom'
import { buttonVariants } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Empty, EmptyDescription, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Skeleton } from '@/components/ui/skeleton'
import { cn, formatDateTime } from '@/lib/utils'
import type { PdfJob } from '../types'
import { JobStatusBadge } from './JobStatusBadge'

const DESKTOP_GRID = 'grid-cols-[minmax(300px,1fr)_120px_180px_40px]'
const DAY = 86_400_000

type JobListProps = {
  jobs: PdfJob[]
  loading?: boolean
  emptyMessage?: string
  grouped?: boolean
}

type JobGroup = { label: string; jobs: PdfJob[] }

function groupJobsByAge(jobs: PdfJob[]): JobGroup[] {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const start = today.getTime()
  const buckets: JobGroup[] = [
    { label: '今天', jobs: [] },
    { label: '近 3 天', jobs: [] },
    { label: '近 7 天', jobs: [] },
    { label: '近 30 天', jobs: [] },
    { label: '更早', jobs: [] },
  ]

  for (const job of jobs) {
    const createdAt = Date.parse(job.created_at)
    if (createdAt >= start) buckets[0]!.jobs.push(job)
    else if (createdAt >= start - 2 * DAY) buckets[1]!.jobs.push(job)
    else if (createdAt >= start - 6 * DAY) buckets[2]!.jobs.push(job)
    else if (createdAt >= start - 29 * DAY) buckets[3]!.jobs.push(job)
    else buckets[4]!.jobs.push(job)
  }

  return buckets.filter((group) => group.jobs.length > 0)
}

function buildCountLabel(job: PdfJob): string {
  const count = job.attempt_count || 0
  return count > 0 ? `${count} 次构建` : '尚未构建'
}

export function JobList({ jobs, loading, emptyMessage = '暂无任务。', grouped = false }: JobListProps) {
  if (loading) return <div className="space-y-2" role="status"><span className="sr-only">正在加载任务</span>{Array.from({ length: 5 }).map((_, index) => <Skeleton key={index} className="h-16 w-full" />)}</div>
  if (jobs.length === 0) return <Empty><EmptyMedia><FileText /></EmptyMedia><div><EmptyTitle>暂时没有任务</EmptyTitle><EmptyDescription className="mt-1">{emptyMessage}</EmptyDescription></div></Empty>

  const groups = grouped ? groupJobsByAge(jobs) : [{ label: '', jobs }]

  return (
    <>
      <div className="hidden overflow-hidden rounded-xl border bg-card shadow-sm md:block">
        <div className={`grid ${DESKTOP_GRID} items-center gap-4 border-b bg-muted/35 px-4 py-2.5 text-[11px] font-semibold text-muted-foreground`} role="row">
          <span>任务</span>
          <span>状态</span>
          <span>时间</span>
          <span className="sr-only">操作</span>
        </div>
        {groups.map((group) => (
          <Fragment key={group.label || 'all'}>
            {grouped && (
              <div className="flex items-center justify-between border-b bg-muted/15 px-4 py-2 text-xs">
                <strong className="font-semibold">{group.label}</strong>
                <span className="tabular-nums text-muted-foreground">{group.jobs.length} 条</span>
              </div>
            )}
            <div className="divide-y">
              {group.jobs.map((job) => (
                <article key={job.id} className={`grid ${DESKTOP_GRID} items-center gap-4 px-4 py-3 transition-colors hover:bg-muted/20`}>
                  <Link to={`/jobs/${job.id}`} className="group flex min-w-0 items-center gap-3" title={job.document_name}>
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><FileText className="size-4" /></span>
                    <span className="min-w-0 flex-1">
                      <span className="flex min-w-0 items-center gap-2">
                        <strong className="truncate text-sm font-semibold group-hover:text-primary">{job.document_name}</strong>
                        {job.is_favorite && <Heart className="size-3.5 shrink-0 fill-current text-rose-500" aria-label="已收藏" />}
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-muted-foreground">{job.source_filename}</span>
                    </span>
                  </Link>
                  <div><JobStatusBadge job={job} /></div>
                  <div className="whitespace-nowrap text-xs text-muted-foreground">
                    <span className="block font-medium text-foreground">{formatDateTime(job.created_at)}</span>
                    <span className="mt-0.5 block">{buildCountLabel(job)}</span>
                  </div>
                  <Link className={cn(buttonVariants({ variant: 'ghost', size: 'icon' }), 'size-9')} to={`/jobs/${job.id}`} aria-label={`打开任务 ${job.document_name}`}><MoreHorizontal /></Link>
                </article>
              ))}
            </div>
          </Fragment>
        ))}
      </div>

      <div className="space-y-5 md:hidden">
        {groups.map((group) => (
          <section key={group.label || 'all'} className="space-y-2">
            {grouped && <div className="flex items-center justify-between px-1 text-xs"><strong>{group.label}</strong><span className="text-muted-foreground">{group.jobs.length} 条</span></div>}
            <div className="grid gap-2">
              {group.jobs.map((job) => (
                <Card key={job.id}>
                  <CardContent className="space-y-3 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <Link to={`/jobs/${job.id}`} className="min-w-0">
                        <span className="flex items-center gap-2"><strong className="block break-words">{job.document_name}</strong>{job.is_favorite && <Heart className="size-3.5 shrink-0 fill-current text-rose-500" />}</span>
                        <span className="mt-1 block break-all text-xs text-muted-foreground">{job.source_filename}</span>
                      </Link>
                      <JobStatusBadge job={job} />
                    </div>
                    <div className="flex items-center justify-between gap-2 border-t pt-3 text-xs text-muted-foreground">
                      <span><span className="block text-foreground">{formatDateTime(job.created_at)}</span><span>{buildCountLabel(job)}</span></span>
                      <Link className={buttonVariants({ variant: 'outline', size: 'sm' })} to={`/jobs/${job.id}`}>查看</Link>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        ))}
      </div>
    </>
  )
}
