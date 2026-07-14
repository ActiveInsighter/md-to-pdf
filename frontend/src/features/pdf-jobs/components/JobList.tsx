import { FileText, MoreHorizontal } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Empty, EmptyDescription, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Skeleton } from '@/components/ui/skeleton'
import { formatDateTime } from '@/lib/utils'
import type { PdfJob } from '../types'
import { JobStatusBadge } from './JobStatusBadge'

const DESKTOP_GRID = 'grid-cols-[minmax(280px,1fr)_120px_180px_52px]'

type JobListProps = {
  jobs: PdfJob[]
  loading?: boolean
  emptyMessage?: string
}

export function JobList({ jobs, loading, emptyMessage = '暂无任务。' }: JobListProps) {
  if (loading) return <div className="space-y-2" role="status"><span className="sr-only">正在加载任务</span>{Array.from({ length: 5 }).map((_, index) => <Skeleton key={index} className="h-18 w-full" />)}</div>
  if (jobs.length === 0) return <Empty><EmptyMedia><FileText /></EmptyMedia><div><EmptyTitle>暂时没有任务</EmptyTitle><EmptyDescription className="mt-1">{emptyMessage}</EmptyDescription></div></Empty>

  return (
    <>
      <div className="hidden overflow-hidden rounded-xl border bg-card md:block">
        <div className={`grid ${DESKTOP_GRID} items-center gap-4 border-b bg-muted/20 px-5 py-3 text-xs font-semibold text-muted-foreground`} role="row">
          <span>任务</span>
          <span>状态</span>
          <span>创建时间</span>
          <span className="sr-only">操作</span>
        </div>
        <div className="divide-y">
          {jobs.map((job) => (
            <article key={job.id} className={`grid ${DESKTOP_GRID} items-center gap-4 px-5 py-4 transition-colors hover:bg-muted/15`}>
              <Link to={`/jobs/${job.id}`} className="group min-w-0" title={job.document_name}>
                <strong className="block truncate text-sm font-semibold group-hover:text-primary group-hover:underline">{job.document_name}</strong>
                <span className="mt-1 block truncate text-xs text-muted-foreground">{job.source_filename}</span>
              </Link>
              <div><JobStatusBadge job={job} /></div>
              <div className="whitespace-nowrap text-xs text-muted-foreground">
                <span className="block font-medium text-foreground">{formatDateTime(job.created_at)}</span>
                <span className="mt-1 block">{job.attempt_count || 1} 次构建</span>
              </div>
              <Button asChild variant="ghost" size="icon">
                <Link to={`/jobs/${job.id}`} aria-label={`打开任务 ${job.document_name}`}><MoreHorizontal className="size-4" /></Link>
              </Button>
            </article>
          ))}
        </div>
      </div>

      <div className="grid gap-3 md:hidden">
        {jobs.map((job) => (
          <Card key={job.id}>
            <CardContent className="space-y-3 p-4">
              <div className="flex items-start justify-between gap-3">
                <Link to={`/jobs/${job.id}`} className="min-w-0">
                  <strong className="block break-words">{job.document_name}</strong>
                  <span className="mt-1 block break-all text-xs text-muted-foreground">{job.source_filename}</span>
                </Link>
                <JobStatusBadge job={job} />
              </div>
              <div className="flex items-center justify-between gap-2 border-t pt-3 text-xs text-muted-foreground">
                <span>{formatDateTime(job.created_at)}</span>
                <Button asChild variant="outline" size="sm"><Link to={`/jobs/${job.id}`}>查看</Link></Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  )
}
