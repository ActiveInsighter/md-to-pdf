import { Download, Heart, RefreshCw, StopCircle } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { triggerDownload } from '@/lib/download'
import { canCancelJob, canDownloadJob, canRetryJob } from '../status'
import type { PdfJob } from '../types'
import { usePdfJobActions } from '../hooks/usePdfJobActions'
import { useWorkspaceStore } from '@/stores/workspaceStore'

export function JobActions({ job, compact = false }: { job: PdfJob; compact?: boolean }) {
  const actions = usePdfJobActions()
  const navigate = useNavigate()
  const setSelectedJobId = useWorkspaceStore((state) => state.setSelectedJobId)

  const openRebuild = async () => {
    const result = await actions.rebuild.mutateAsync(job.id)
    setSelectedJobId(result.jobId)
    navigate(`/jobs/${result.jobId}`)
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {canDownloadJob(job) && <Button size={compact ? 'sm' : 'default'} onClick={async () => { const result = await actions.download.mutateAsync(job.id); triggerDownload(result.downloadUrl, result.fileName) }} disabled={actions.download.isPending}><Download className="h-4 w-4" />下载</Button>}
      {canRetryJob(job) && <Button size={compact ? 'sm' : 'default'} variant="outline" onClick={() => void openRebuild()} disabled={actions.rebuild.isPending}><RefreshCw className="h-4 w-4" />重试</Button>}
      {canCancelJob(job) && <Button size={compact ? 'sm' : 'default'} variant="destructive" onClick={() => actions.cancel.mutate(job.id)} disabled={actions.cancel.isPending}><StopCircle className="h-4 w-4" />取消</Button>}
      <Button size={compact ? 'sm' : 'default'} variant="ghost" onClick={() => actions.favorite.mutate({ jobId: job.id, isFavorite: !job.is_favorite })} disabled={actions.favorite.isPending} aria-label={job.is_favorite ? '取消收藏' : '收藏任务'}>
        <Heart className={`h-4 w-4 ${job.is_favorite ? 'fill-current text-rose-500' : ''}`} />{!compact && (job.is_favorite ? '已收藏' : '收藏')}
      </Button>
    </div>
  )
}
