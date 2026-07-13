import * as React from 'react'
import { cn } from '@/lib/utils'
export function PageContainer({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) { return <main className={cn('mx-auto w-full max-w-[1440px] p-4 sm:p-6 lg:p-8', className)} {...props} /> }
