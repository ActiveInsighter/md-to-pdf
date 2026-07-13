import { useEffect, useState } from 'react'
import { Progress } from '@/components/ui/progress'
import { formatDateTime } from '@/lib/utils'
import { getJobProgress, getJobStageDescription, isTerminalJob } from '../status'
import { getJobTimingSummary } from '../timing'
import type { PdfJob } from '../types'

export function JobProgress({ job, compact = false }: { job: PdfJob; compact?: boolean }) {
  const progress = getJobProgress(job)
  const terminal = isTerminalJob(job)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    setNow(Date.now())
    if (terminal) return

    const timer = window.setInterval(() => setNow(Date.now()), 1_000)
    return () => window.clearInterval(timer)
  }, [job.id, terminal])

  const timing = getJobTimingSummary(job, now)

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className={compact ? 'truncate text-muted-foreground' : 'text-muted-foreground'}>{getJobStageDescription(job)}</span>
        <strong className="shrink-0 text-foreground">{progress}%</strong>
      </div>
      <Progress value={progress} />
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span>{timing.label}：{timing.value}</span>
        <span>更新：{formatDateTime(job.updated_at)}</span>
      </div>
    </div>
  )
}
