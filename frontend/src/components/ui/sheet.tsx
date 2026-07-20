import * as React from 'react'
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

export const Sheet = DialogPrimitive.Root
export const SheetTrigger = DialogPrimitive.Trigger
export const SheetClose = DialogPrimitive.Close

export function SheetContent({ className, children, side = 'left', ...props }: DialogPrimitive.Popup.Props & { side?: 'left' | 'right' }) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-foreground/35 backdrop-blur-sm transition-opacity data-ending-style:opacity-0 data-starting-style:opacity-0" />
      <DialogPrimitive.Popup
        data-side={side}
        className={cn(
          'fixed inset-y-0 z-50 w-[88vw] max-w-sm border bg-background p-5 shadow-lifted outline-none transition-[transform,opacity] data-ending-style:opacity-0 data-starting-style:opacity-0',
          side === 'left'
            ? 'left-0 border-r data-ending-style:-translate-x-10 data-starting-style:-translate-x-10'
            : 'right-0 border-l data-ending-style:translate-x-10 data-starting-style:translate-x-10',
          className,
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close className="absolute right-3 top-3 flex size-11 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring" aria-label="关闭"><X className="size-4" /></DialogPrimitive.Close>
      </DialogPrimitive.Popup>
    </DialogPrimitive.Portal>
  )
}

export const SheetHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => <div className={cn('mb-4 flex flex-col gap-1.5', className)} {...props} />
export const SheetTitle = ({ className, ...props }: DialogPrimitive.Title.Props) => <DialogPrimitive.Title className={cn('text-lg font-semibold', className)} {...props} />
export const SheetDescription = ({ className, ...props }: DialogPrimitive.Description.Props) => <DialogPrimitive.Description className={cn('text-sm text-muted-foreground', className)} {...props} />
