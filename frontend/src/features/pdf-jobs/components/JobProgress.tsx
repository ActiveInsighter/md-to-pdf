import { Progress } from '@/components/ui/progress'
import { getJobProgress, getJobStageDescription } from '../status'
import type { PdfJob } from '../types'

export function JobProgress({ job, compact = false }: { job: PdfJob; compact?: boolean }) {
  const progress = getJobProgress(job)
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className={compact ? 'truncate text-muted-foreground' : 'text-muted-foreground'}>{getJobStageDescription(job)}</span>
        <strong className="shrink-0 text-foreground">{progress}%</strong>
      </div>
      <Progress value={progress} />
    </div>
  )
}
