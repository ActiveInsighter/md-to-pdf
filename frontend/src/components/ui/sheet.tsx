import * as React from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

export const Sheet = DialogPrimitive.Root
export const SheetTrigger = DialogPrimitive.Trigger
export const SheetClose = DialogPrimitive.Close
export function SheetContent({ className, children, side = 'left', ...props }: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & { side?: 'left' | 'right' }) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-slate-950/35" />
      <DialogPrimitive.Content className={cn('fixed inset-y-0 z-50 w-[86vw] max-w-sm border bg-background p-5 shadow-xl outline-none', side === 'left' ? 'left-0 border-r' : 'right-0 border-l', className)} {...props}>
        {children}
        <DialogPrimitive.Close className="absolute right-4 top-4 rounded-md p-2 text-muted-foreground hover:bg-muted" aria-label="关闭"><X className="h-4 w-4" /></DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  )
}
export const SheetHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => <div className={cn('mb-4 flex flex-col gap-1.5', className)} {...props} />
export const SheetTitle = DialogPrimitive.Title
export const SheetDescription = DialogPrimitive.Description
