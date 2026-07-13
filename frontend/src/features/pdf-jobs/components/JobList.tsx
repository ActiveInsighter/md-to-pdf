import { FileText, MoreHorizontal } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import { formatDateTime } from '@/lib/utils'
import type { PdfJob } from '../types'
import { JobStatusBadge } from './JobStatusBadge'
import { JobProgress } from './JobProgress'

export function JobList({ jobs, loading, emptyMessage = '暂无任务。' }: { jobs: PdfJob[]; loading?: boolean; emptyMessage?: string }) {
  if (loading) return <div className="space-y-3">{Array.from({ length: 5 }).map((_, index) => <Skeleton key={index} className="h-16 w-full" />)}</div>
  if (jobs.length === 0) return <Card><CardContent className="flex min-h-40 flex-col items-center justify-center gap-3 text-center text-muted-foreground"><FileText className="h-8 w-8" /><p>{emptyMessage}</p></CardContent></Card>

  return (
    <>
      <div className="hidden md:block">
        <Card className="overflow-hidden">
          <Table>
            <TableHeader><TableRow><TableHead>任务</TableHead><TableHead>状态</TableHead><TableHead className="min-w-64">进度</TableHead><TableHead>创建时间</TableHead><TableHead className="w-16" /></TableRow></TableHeader>
            <TableBody>{jobs.map((job) => <TableRow key={job.id}>
              <TableCell><Link to={`/jobs/${job.id}`} className="block max-w-72"><strong className="block truncate font-medium">{job.document_name}</strong><span className="block truncate text-xs text-muted-foreground">{job.source_filename}</span></Link></TableCell>
              <TableCell><JobStatusBadge job={job} /></TableCell>
              <TableCell><JobProgress job={job} compact /></TableCell>
              <TableCell className="text-muted-foreground">{formatDateTime(job.created_at)}</TableCell>
              <TableCell><Button asChild variant="ghost" size="icon"><Link to={`/jobs/${job.id}`} aria-label="打开任务"><MoreHorizontal className="h-4 w-4" /></Link></Button></TableCell>
            </TableRow>)}</TableBody>
          </Table>
        </Card>
      </div>
      <div className="grid gap-3 md:hidden">{jobs.map((job) => <Card key={job.id}><CardContent className="space-y-4 p-4"><div className="flex items-start justify-between gap-3"><Link to={`/jobs/${job.id}`} className="min-w-0"><strong className="block break-words">{job.document_name}</strong><span className="block break-all text-xs text-muted-foreground">{job.source_filename}</span></Link><JobStatusBadge job={job} /></div><JobProgress job={job} /><div className="flex items-center justify-between text-xs text-muted-foreground"><span>{formatDateTime(job.created_at)}</span><Button asChild variant="outline" size="sm"><Link to={`/jobs/${job.id}`}>查看详情</Link></Button></div></CardContent></Card>)}</div>
    </>
  )
}
