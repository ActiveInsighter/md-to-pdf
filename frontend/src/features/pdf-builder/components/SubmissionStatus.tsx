import type { HTMLAttributes } from 'react'
import { LoaderCircle } from 'lucide-react'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'

type SubmissionStatusProps = HTMLAttributes<HTMLDivElement> & {
  visible: boolean
  busy: boolean
  label: string
  value: number
}

export function SubmissionStatus({
  visible,
  busy,
  label,
  value,
  className,
  ...props
}: SubmissionStatusProps) {
  if (!visible) return null

  return (
    <div className={cn('rounded-xl border bg-muted/25 p-4', className)} aria-live="polite" {...props}>
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
