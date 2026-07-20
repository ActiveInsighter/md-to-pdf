import { Button as ButtonPrimitive } from '@base-ui/react/button'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-semibold transition-[color,background-color,border-color,box-shadow,transform] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 active:translate-y-px disabled:pointer-events-none disabled:opacity-45 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground shadow-sm hover:bg-primary/92 hover:shadow',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/75',
        outline: 'border border-input bg-background text-foreground shadow-sm hover:border-primary/30 hover:bg-accent hover:text-accent-foreground',
        ghost: 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
        destructive: 'bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90',
        link: 'h-auto text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-9 px-3 text-xs',
        lg: 'h-11 px-5 text-base',
        icon: 'size-10 p-0',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
)

type ButtonProps = ButtonPrimitive.Props & VariantProps<typeof buttonVariants>

export function Button({ className, variant, size, ...props }: ButtonProps) {
  return <ButtonPrimitive data-slot="button" className={cn(buttonVariants({ variant, size, className }))} {...props} />
}

export { buttonVariants }
export type { ButtonProps }
