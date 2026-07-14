import { useEffect, useState } from 'react'
import { Download, FileDown, Heart, LoaderCircle, RefreshCw, StopCircle } from 'lucide-react'
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

  useEffect(() => setRebuildTheme(validTheme(job.theme)), [job.id, job.theme])

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

  const size = compact ? 'sm' : 'default'

  return (
    <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        {canDownloadJob(job) && (
          <Button size={size} onClick={() => void downloadPdf()} disabled={actions.download.isPending} aria-busy={actions.download.isPending}>
            {actions.download.isPending ? <LoaderCircle className="animate-spin" /> : <Download />}
            下载 PDF
          </Button>
        )}
        {canDownloadSource(job) && (
          <Button size={size} variant="outline" onClick={() => void downloadSource()} disabled={actions.downloadSource.isPending} aria-busy={actions.downloadSource.isPending}>
            {actions.downloadSource.isPending ? <LoaderCircle className="animate-spin" /> : <FileDown />}
            下载 Markdown
          </Button>
        )}
        {canRetryJob(job) && (compact
          ? (
              <Button size="sm" variant="outline" onClick={() => void openRebuild()} disabled={actions.rebuild.isPending} aria-busy={actions.rebuild.isPending}>
                {actions.rebuild.isPending ? <LoaderCircle className="animate-spin" /> : <RefreshCw />}
                重新构建
              </Button>
            )
          : (
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <Select aria-label="重新构建主题" className="min-w-40" value={rebuildTheme} onChange={(event) => setRebuildTheme(event.target.value as PdfThemeId)} disabled={actions.rebuild.isPending}>
                  {PDF_THEMES.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </Select>
                <Button variant="outline" onClick={() => void openRebuild()} disabled={actions.rebuild.isPending} aria-busy={actions.rebuild.isPending}>
                  {actions.rebuild.isPending ? <LoaderCircle className="animate-spin" /> : <RefreshCw />}
                  用源稿重新构建
                </Button>
              </div>
            ))}
        {canCancelJob(job) && (
          <Button size={size} variant="destructive" onClick={() => actions.cancel.mutate(job.id)} disabled={actions.cancel.isPending} aria-busy={actions.cancel.isPending}>
            {actions.cancel.isPending ? <LoaderCircle className="animate-spin" /> : <StopCircle />}
            取消任务
          </Button>
        )}
      </div>

      <Button
        size={compact ? 'sm' : 'default'}
        variant="ghost"
        className="self-start sm:self-auto"
        onClick={() => actions.favorite.mutate({ jobId: job.id, isFavorite: !job.is_favorite })}
        disabled={actions.favorite.isPending}
        aria-label={job.is_favorite ? '取消收藏' : '收藏任务'}
        aria-pressed={job.is_favorite}
      >
        {actions.favorite.isPending ? <LoaderCircle className="animate-spin" /> : <Heart className={job.is_favorite ? 'fill-current text-rose-500' : ''} />}
        {!compact && (job.is_favorite ? '已收藏' : '收藏')}
      </Button>
    </div>
  )
}
