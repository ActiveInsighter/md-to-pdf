import * as React from 'react'
import { cn } from '@/lib/utils'

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, type, ...props }, ref) => (
  <input type={type} className={cn('flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base shadow-sm outline-none transition-[border-color,box-shadow] placeholder:text-muted-foreground/75 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20 aria-[invalid=true]:border-destructive aria-[invalid=true]:ring-destructive/15 disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-60 sm:text-sm', className)} ref={ref} {...props} />
))
Input.displayName = 'Input'
