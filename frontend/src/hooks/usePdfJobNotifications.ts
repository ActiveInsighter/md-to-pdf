import { useCallback, useEffect, useRef, useState } from 'react'
import type { PdfJob } from '../types/pdfJob'
import { PDF_JOB_STATUS_LABELS, isTerminalPdfJobStatus } from '../utils/pdfJobStatus'
import { getPdfJobProgress } from '../utils/pdfJobProgress'

export type PdfJobCompletionNotice = {
  jobId: string
  status: 'completed' | 'failed' | 'expired'
  title: string
  message: string
}

function notificationAvailable(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window
}

export function usePdfJobNotifications(job: PdfJob | null) {
  const previousJob = useRef<PdfJob | null>(null)
  const [notice, setNotice] = useState<PdfJobCompletionNotice | null>(null)
  const [notificationsEnabled, setNotificationsEnabled] = useState(
    () => notificationAvailable() && Notification.permission === 'granted',
  )

  const notificationSupported = notificationAvailable()

  const enableNotifications = useCallback(async () => {
    if (!notificationAvailable()) return false
    const permission = await Notification.requestPermission()
    const enabled = permission === 'granted'
    setNotificationsEnabled(enabled)
    return enabled
  }, [])

  const dismissNotice = useCallback(() => setNotice(null), [])

  useEffect(() => {
    if (!job) {
      previousJob.current = null
      document.title = 'Markdown 转 PDF'
      return
    }

    const progress = getPdfJobProgress(job)
    document.title = isTerminalPdfJobStatus(job.status)
      ? `${PDF_JOB_STATUS_LABELS[job.status]} · Markdown 转 PDF`
      : `${progress.percent}% · ${PDF_JOB_STATUS_LABELS[job.status]} · Markdown 转 PDF`

    const previous = previousJob.current
    const becameTerminal = previous?.id === job.id
      && !isTerminalPdfJobStatus(previous.status)
      && isTerminalPdfJobStatus(job.status)

    if (becameTerminal) {
      const title = job.status === 'completed'
        ? 'PDF 构建完成'
        : job.status === 'failed'
          ? 'PDF 构建失败'
          : 'PDF 任务已过期'
      const message = progress.message
      setNotice({ jobId: job.id, status: job.status, title, message })

      if (notificationAvailable() && Notification.permission === 'granted') {
        new Notification(title, {
          body: message,
          tag: `pdf-job-${job.id}-${job.status}`,
        })
      }
    }

    previousJob.current = job
  }, [job])

  return {
    notice,
    notificationSupported,
    notificationsEnabled,
    enableNotifications,
    dismissNotice,
  }
}
