import { Tabs as TabsPrimitive } from '@base-ui/react/tabs'
import { cn } from '@/lib/utils'

export const Tabs = TabsPrimitive.Root
export const TabsList = ({ className, ...props }: TabsPrimitive.List.Props) => <TabsPrimitive.List className={cn('inline-flex min-h-10 max-w-full items-center rounded-lg bg-muted p-1 text-muted-foreground', className)} {...props} />
export const TabsTrigger = ({ className, ...props }: TabsPrimitive.Tab.Props) => <TabsPrimitive.Tab className={cn('inline-flex h-8 min-w-0 items-center justify-center gap-2 rounded-md px-3 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2 data-active:bg-card data-active:text-foreground data-active:shadow-sm [&_svg]:size-4', className)} {...props} />
export const TabsContent = ({ className, ...props }: TabsPrimitive.Panel.Props) => <TabsPrimitive.Panel className={cn('mt-4 min-w-0 max-w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2', className)} {...props} />
