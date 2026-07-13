import * as React from 'react'
import { cn } from '@/lib/utils'

export function Alert({ className, variant = 'default', ...props }: React.HTMLAttributes<HTMLDivElement> & { variant?: 'default' | 'destructive' | 'warning' }) {
  return <div role="alert" className={cn('rounded-md border p-4 text-sm', variant === 'destructive' && 'border-red-200 bg-red-50 text-red-800', variant === 'warning' && 'border-amber-200 bg-amber-50 text-amber-800', variant === 'default' && 'bg-background', className)} {...props} />
}
export const AlertTitle = ({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => <h5 className={cn('mb-1 font-medium', className)} {...props} />
export const AlertDescription = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => <div className={cn('text-sm [&_p]:leading-relaxed', className)} {...props} />
