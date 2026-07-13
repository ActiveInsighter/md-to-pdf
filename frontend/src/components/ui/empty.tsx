import * as React from 'react'
import { cn } from '@/lib/utils'

export function Empty({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex min-h-48 min-w-0 flex-col items-center justify-center gap-5 rounded-xl border border-dashed bg-muted/25 p-6 text-center sm:p-10', className)} {...props} />
}

export function EmptyMedia({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex size-12 items-center justify-center rounded-xl bg-accent text-accent-foreground [&_svg]:size-6', className)} {...props} />
}

export function EmptyTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn('text-lg font-semibold tracking-tight', className)} {...props} />
}

export function EmptyDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('max-w-sm text-sm leading-6 text-muted-foreground', className)} {...props} />
}

export function EmptyContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-wrap items-center justify-center gap-3', className)} {...props} />
}
