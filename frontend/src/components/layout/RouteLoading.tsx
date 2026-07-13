import { Spinner } from '@/components/ui/spinner'

export function RouteLoading() {
  return (
    <main className="flex min-h-dvh items-center justify-center p-6" aria-busy="true">
      <div className="flex items-center gap-3 rounded-full border bg-card/80 px-5 py-3 text-sm font-medium text-muted-foreground shadow-panel">
        <Spinner />
        正在打开工作台…
      </div>
    </main>
  )
}
