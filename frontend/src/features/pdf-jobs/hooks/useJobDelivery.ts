import { useEffect, useRef } from 'react'
import { toast } from 'sonner'
import type { PdfJob } from '../types'
import { canDownloadJob } from '../status'
import { getPdfDownload } from '../api/pdfJobs'
import { triggerDownload } from '@/lib/download'
import { toUserMessage } from '@/lib/errors'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { shouldDeliverJobCompletion, type JobDeliverySnapshot } from '../delivery'

export function useJobDelivery(job: PdfJob | null | undefined) {
  const autoDownload = useWorkspaceStore((state) => state.autoDownload)
  const notifyOnComplete = useWorkspaceStore((state) => state.notifyOnComplete)
  const previousJob = useRef<JobDeliverySnapshot | null>(null)
  const delivered = useRef(new Set<string>())

  useEffect(() => {
    if (!job) return

    const current: JobDeliverySnapshot = { id: job.id, status: job.status }
    const previous = previousJob.current
    previousJob.current = current

    if (!shouldDeliverJobCompletion(previous, current)) return
    if (!canDownloadJob(job)) return
    if (!autoDownload && !notifyOnComplete) return

    const deliveryKey = `${job.id}:${job.completed_at || job.updated_at}`
    if (delivered.current.has(deliveryKey)) return
    delivered.current.add(deliveryKey)

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
  }, [
    autoDownload,
    job?.completed_at,
    job?.document_name,
    job?.expires_at,
    job?.id,
    job?.status,
    job?.updated_at,
    notifyOnComplete,
  ])
}
