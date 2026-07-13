import { useState } from 'react'
import { Download, FileDown, Heart, RefreshCw, StopCircle } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { triggerDownload } from '@/lib/download'
import { PDF_THEMES, type PdfThemeId } from '@/features/pdf-builder/types'
import { canCancelJob, canDownloadJob, canDownloadSource, canRetryJob } from '../status'
import type { PdfJob } from '../types'
import { usePdfJobActions } from '../hooks/usePdfJobActions'
import { useWorkspaceStore } from '@/stores/workspaceStore'

function validTheme(theme: string): PdfThemeId {
  return PDF_THEMES.some((item) => item.id === theme) ? theme as PdfThemeId : 'chatgpt-light'
}

export function JobActions({ job, compact = false }: { job: PdfJob; compact?: boolean }) {
  const actions = usePdfJobActions()
  const navigate = useNavigate()
  const setSelectedJobId = useWorkspaceStore((state) => state.setSelectedJobId)
  const [rebuildTheme, setRebuildTheme] = useState<PdfThemeId>(() => validTheme(job.theme))

  const openRebuild = async () => {
    const result = await actions.rebuild.mutateAsync({ jobId: job.id, theme: rebuildTheme })
    setSelectedJobId(result.jobId)
    navigate(`/jobs/${result.jobId}`)
  }

  const downloadPdf = async () => {
    const result = await actions.download.mutateAsync(job.id)
    triggerDownload(result.downloadUrl, result.fileName)
  }

  const downloadSource = async () => {
    const result = await actions.downloadSource.mutateAsync(job.id)
    triggerDownload(result.downloadUrl, result.fileName)
  }

  return (
    <div className="flex w-full flex-wrap items-center gap-2">
      {canDownloadJob(job) && <Button size={compact ? 'sm' : 'default'} onClick={() => void downloadPdf()} disabled={actions.download.isPending}><Download className="size-4" />下载 PDF</Button>}
      {canDownloadSource(job) && <Button size={compact ? 'sm' : 'default'} variant="outline" onClick={() => void downloadSource()} disabled={actions.downloadSource.isPending}><FileDown className="size-4" />下载 Markdown</Button>}
      {canRetryJob(job) && (compact
        ? <Button size="sm" variant="outline" onClick={() => void openRebuild()} disabled={actions.rebuild.isPending}><RefreshCw className="size-4" />重新构建</Button>
        : <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 sm:flex-initial">
            <Select aria-label="重新构建主题" className="min-w-44" value={rebuildTheme} onChange={(event) => setRebuildTheme(event.target.value as PdfThemeId)}>
              {PDF_THEMES.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </Select>
            <Button variant="outline" onClick={() => void openRebuild()} disabled={actions.rebuild.isPending}><RefreshCw className="size-4" />用源稿重新构建</Button>
          </div>)}
      {canCancelJob(job) && <Button size={compact ? 'sm' : 'default'} variant="destructive" onClick={() => actions.cancel.mutate(job.id)} disabled={actions.cancel.isPending}><StopCircle className="size-4" />取消</Button>}
      <Button size={compact ? 'sm' : 'default'} variant="ghost" onClick={() => actions.favorite.mutate({ jobId: job.id, isFavorite: !job.is_favorite })} disabled={actions.favorite.isPending} aria-label={job.is_favorite ? '取消收藏' : '收藏任务'}>
        <Heart className={`size-4 ${job.is_favorite ? 'fill-current text-rose-500' : ''}`} />{!compact && (job.is_favorite ? '已收藏' : '收藏')}
      </Button>
    </div>
  )
}
