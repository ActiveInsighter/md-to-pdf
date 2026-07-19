import { LoaderCircle } from 'lucide-react'
import { Progress } from '@/components/ui/progress'

export function SubmissionStatus({
  visible,
  busy,
  label,
  value,
}: {
  visible: boolean
  busy: boolean
  label: string
  value: number
}) {
  if (!visible) return null

  return (
    <div data-ui-capture="source-upload-status" className="rounded-xl border bg-muted/25 p-4" aria-live="polite">
      <div className="flex items-center justify-between gap-4 text-xs text-muted-foreground">
        <span className="inline-flex min-w-0 items-center gap-2">
          {busy && <LoaderCircle className="size-3.5 shrink-0 animate-spin" />}
          <span className="truncate">{label}</span>
        </span>
        <strong className="shrink-0 tabular-nums text-foreground">{value}%</strong>
      </div>
      <Progress className="mt-3" value={value} aria-label="任务提交进度" />
    </div>
  )
}
