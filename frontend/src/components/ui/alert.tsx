import * as React from 'react'
import { cn } from '@/lib/utils'

export function Alert({ className, variant = 'default', role, ...props }: React.HTMLAttributes<HTMLDivElement> & { variant?: 'default' | 'destructive' | 'warning' | 'success' }) {
  return <div role={role ?? (variant === 'destructive' ? 'alert' : 'status')} className={cn('rounded-lg border p-4 text-sm leading-6', variant === 'destructive' && 'border-destructive/25 bg-destructive/10 text-destructive', variant === 'warning' && 'border-warning/25 bg-warning-muted text-warning', variant === 'success' && 'border-success/25 bg-success-muted text-success', variant === 'default' && 'bg-card/80 text-foreground', className)} {...props} />
}
export const AlertTitle = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => <div className={cn('mb-1 font-semibold', className)} {...props} />
export const AlertDescription = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => <div className={cn('text-sm [&_p]:leading-relaxed', className)} {...props} />
