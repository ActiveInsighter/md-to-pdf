import { FileQuestion } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Empty, EmptyContent, EmptyDescription, EmptyMedia, EmptyTitle } from '@/components/ui/empty'

export function NotFoundPage() {
  return (
    <main id="main-content" tabIndex={-1} className="mx-auto flex min-h-dvh max-w-2xl items-center p-6 outline-none">
      <Empty className="w-full bg-card/80 shadow-panel">
        <EmptyMedia><FileQuestion /></EmptyMedia>
        <EmptyTitle>没有找到这个页面</EmptyTitle>
        <EmptyDescription>地址可能已经变化，也可能从未存在。返回工作台继续创建或查看任务。</EmptyDescription>
        <EmptyContent><Button asChild><Link to="/workspace">返回工作台</Link></Button></EmptyContent>
      </Empty>
    </main>
  )
}
