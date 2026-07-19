import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function BuilderFormSection({
  title,
  description,
  actions,
  children,
  divided = false,
  className,
}: {
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  children: ReactNode
  divided?: boolean
  className?: string
}) {
  return (
    <section
      className={cn(
        'grid min-w-0 max-w-full gap-3 lg:grid-cols-[180px_minmax(0,1fr)] lg:items-start',
        divided && 'border-t pt-5',
        className,
      )}
    >
      <div className="grid min-w-0 max-w-full gap-2 lg:pt-2">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-foreground">{title}</div>
          {description && <p className="mt-1 break-words text-xs leading-5 text-muted-foreground">{description}</p>}
        </div>
        {actions}
      </div>
      <div className="min-w-0 max-w-full">{children}</div>
    </section>
  )
}
