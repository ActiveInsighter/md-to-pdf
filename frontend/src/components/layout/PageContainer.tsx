import * as React from 'react'
import { cn } from '@/lib/utils'

export function PageContainer({ className, id = 'main-content', tabIndex = -1, ...props }: React.HTMLAttributes<HTMLElement>) {
  return (
    <main
      id={id}
      tabIndex={tabIndex}
      className={cn('mx-auto w-full max-w-[1480px] p-4 outline-none sm:p-6 lg:p-8 xl:p-10', className)}
      {...props}
    />
  )
}
