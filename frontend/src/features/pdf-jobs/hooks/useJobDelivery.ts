import { useEffect, useRef } from 'react'
import { toast } from 'sonner'
import type { PdfJob } from '../types'
import { canDownloadJob } from '../status'
import { getPdfDownload } from '../api/pdfJobs'
import { triggerDownload } from '@/lib/download'
import { toUserMessage } from '@/lib/errors'
import { useWorkspaceStore } from '@/stores/workspaceStore'

export function useJobDelivery(job: PdfJob | null | undefined) {
  const autoDownload = useWorkspaceStore((state) => state.autoDownload)
  const notifyOnComplete = useWorkspaceStore((state) => state.notifyOnComplete)
  const delivered = useRef(new Set<string>())

  useEffect(() => {
    if (!job || !canDownloadJob(job) || delivered.current.has(job.id)) return
    if (!autoDownload && !notifyOnComplete) return
    delivered.current.add(job.id)

    void (async () => {
      if (notifyOnComplete && 'Notification' in window) {
        try {
          if (Notification.permission === 'granted') {
            new Notification('PDF 构建完成', { body: `${job.document_name} 已可下载。` })
          }
        } catch {
          toast.warning('浏览器通知发送失败，任务仍可手动下载。')
        }
      }
      if (autoDownload) {
        try {
          const download = await getPdfDownload(job.id)
          triggerDownload(download.downloadUrl, download.fileName)
          toast.success(`${download.fileName} 已开始下载。`)
        } catch (cause) {
          toast.error(`${toUserMessage(cause, '自动下载失败。')} 可在任务详情中手动下载。`)
        }
      }
    })()
  }, [autoDownload, job, notifyOnComplete])
}
