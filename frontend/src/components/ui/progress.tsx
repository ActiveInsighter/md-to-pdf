import { cn } from '@/lib/utils'

export function Progress({ value = 0, className }: { value?: number; className?: string }) {
  const normalized = Math.max(0, Math.min(100, value))
  return (
    <div className={cn('relative h-2 w-full overflow-hidden rounded-full bg-secondary', className)} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={normalized}>
      <div className="h-full bg-primary transition-[width] duration-300" style={{ width: `${normalized}%` }} />
    </div>
  )
}
