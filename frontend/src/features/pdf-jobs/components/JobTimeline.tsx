import { CheckCircle2, CircleDashed } from 'lucide-react'
import { formatDateTime } from '@/lib/utils'
import type { PdfJob } from '../types'
import { getJobTimeline } from '../timing'

export function JobTimeline({ job }: { job: PdfJob }) {
  const steps = getJobTimeline(job)

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {steps.map((step) => {
        const reached = Boolean(step.at)
        return (
          <div key={step.key} className="flex min-w-0 items-start gap-3 rounded-lg border bg-muted/20 p-3">
            {reached
              ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
              : <CircleDashed className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/60" />}
            <div className="min-w-0">
              <span className="block text-xs text-muted-foreground">{step.label}</span>
              <strong className="mt-1 block break-words text-sm font-medium">{formatDateTime(step.at)}</strong>
            </div>
          </div>
        )
      })}
    </div>
  )
}
