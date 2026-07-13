import * as React from 'react'
import { cn } from '@/lib/utils'

type ProgressProps = Omit<React.HTMLAttributes<HTMLDivElement>, 'children'> & {
  value?: number | null
}

export function Progress({ value = 0, className, ...props }: ProgressProps) {
  const normalized = value === null ? null : Math.max(0, Math.min(100, value))
  return (
    <div className={cn('relative h-2.5 w-full overflow-hidden rounded-full bg-secondary', className)} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={normalized ?? undefined} {...props}>
      <div
        className={cn('h-full origin-left rounded-full bg-primary transition-transform duration-300', normalized === null && 'w-1/3 animate-pulse')}
        style={normalized === null ? undefined : { transform: `scaleX(${normalized / 100})` }}
      />
    </div>
  )
}
