import * as React from 'react'
import { LoaderCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

export function Spinner({ className, ...props }: React.SVGProps<SVGSVGElement>) {
  return <LoaderCircle role="status" aria-label="加载中" className={cn('size-4 animate-spin', className)} {...props} />
}
