import * as React from 'react'
import { cn } from '@/lib/utils'

export function PageContainer({ className, id = 'main-content', tabIndex = -1, ...props }: React.HTMLAttributes<HTMLElement>) {
  return (
    <main
      id={id}
      tabIndex={tabIndex}
      className={cn('mx-auto box-border w-full min-w-0 max-w-[1320px] p-4 outline-none sm:p-6 lg:p-8', className)}
      {...props}
    />
  )
}
