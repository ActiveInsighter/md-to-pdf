import * as React from 'react'
import { cn } from '@/lib/utils'

export const Checkbox = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => (
  <input type="checkbox" ref={ref} className={cn('h-4 w-4 rounded border-input accent-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2', className)} {...props} />
))
Checkbox.displayName = 'Checkbox'
