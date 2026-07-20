import { isRouteErrorResponse, Link, useRouteError } from 'react-router-dom'
import { AlertTriangle } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { Empty, EmptyContent, EmptyDescription, EmptyMedia, EmptyTitle } from '@/components/ui/empty'

export function RouteErrorPage() {
  const error = useRouteError()
  const message = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : error instanceof Error ? error.message : '页面加载失败。'

  return (
    <main id="main-content" tabIndex={-1} className="mx-auto flex min-h-dvh max-w-2xl items-center p-6 outline-none">
      <Empty className="w-full bg-card/80 shadow-panel">
        <EmptyMedia><AlertTriangle /></EmptyMedia>
        <EmptyTitle>这个页面暂时打不开</EmptyTitle>
        <EmptyDescription>{message}</EmptyDescription>
        <EmptyContent><Link className={buttonVariants()} to="/workspace">返回工作台</Link></EmptyContent>
      </Empty>
    </main>
  )
}
