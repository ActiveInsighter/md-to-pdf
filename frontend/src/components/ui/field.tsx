import * as React from 'react'
import { cn } from '@/lib/utils'

export function FieldGroup({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div data-slot="field-group" className={cn('flex w-full flex-col gap-5', className)} {...props} />
}

export function Field({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div role="group" data-slot="field" className={cn('group/field flex w-full flex-col gap-2 data-[invalid=true]:text-destructive data-[disabled=true]:opacity-60', className)} {...props} />
}

export function FieldLabel({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label data-slot="field-label" className={cn('flex min-h-6 w-fit items-center gap-2 text-sm font-semibold leading-6', className)} {...props} />
}

export function FieldDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p data-slot="field-description" className={cn('text-sm leading-5 text-muted-foreground', className)} {...props} />
}

export function FieldError({ className, children, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  if (!children) return null
  return <p role="alert" data-slot="field-error" className={cn('text-sm leading-5 text-destructive', className)} {...props}>{children}</p>
}

export function FieldSet({ className, ...props }: React.FieldsetHTMLAttributes<HTMLFieldSetElement>) {
  return <fieldset data-slot="field-set" className={cn('flex min-w-0 flex-col gap-4', className)} {...props} />
}

export function FieldLegend({ className, ...props }: React.HTMLAttributes<HTMLLegendElement>) {
  return <legend data-slot="field-legend" className={cn('text-sm font-semibold', className)} {...props} />
}
