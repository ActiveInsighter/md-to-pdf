import { useCallback, useEffect, useRef, useState } from 'react'
import { getPdfDownload } from '../api/pdfJobs'
import type { PdfJob } from '../types/pdfJob'
import { isTerminalPdfJobStatus } from '../utils/pdfJobStatus'

export type PdfDeliveryNotice = {
  kind: 'success' | 'error' | 'info'
  title: string
  message: string
}

type Options = {
  job: PdfJob | null
  userId: string | null
}

const AUTO_DOWNLOAD_KEY = 'md-to-pdf:auto-download'
const NOTIFY_KEY = 'md-to-pdf:notify-on-complete'

function targetKey(userId: string): string {
  return `md-to-pdf:auto-download-target:${userId}`
}

function readPreference(key: string, fallback: boolean): boolean {
  try {
    const value = localStorage.getItem(key)
    return value === null ? fallback : value === 'true'
  } catch {
    return fallback
  }
}

function writePreference(key: string, value: boolean): void {
  try {
    localStorage.setItem(key, String(value))
  } catch {
    // The preference remains active for the current page when storage is unavailable.
  }
}

function readNotificationPreference(): boolean {
  if (!('Notification' in window) || Notification.permission !== 'granted') return false
  return readPreference(NOTIFY_KEY, false)
}

function readSessionMarker(key: string): boolean {
  try {
    return sessionStorage.getItem(key) === 'true'
  } catch {
    return false
  }
}

function writeSessionMarker(key: string): void {
  try {
    sessionStorage.setItem(key, 'true')
  } catch {
    // The in-memory result guard still prevents duplicate handling on this page.
  }
}

function removeSessionMarker(key: string): void {
  try {
    sessionStorage.removeItem(key)
  } catch {
    // Nothing else is required when session storage is unavailable.
  }
}

function sendBrowserNotification(title: string, body: string): void {
  if (!('Notification' in window) || Notification.permission !== 'granted') return
  try {
    new Notification(title, { body, tag: 'md-to-pdf-build-result' })
  } catch {
    // In-page notifications remain available when system notifications fail.
  }
}

async function triggerDownload(jobId: string): Promise<void> {
  const download = await getPdfDownload(jobId)
  const anchor = document.createElement('a')
  anchor.href = download.downloadUrl
  anchor.download = download.fileName
  anchor.rel = 'noopener'
  anchor.style.display = 'none'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
}

export function usePdfDelivery({ job, userId }: Options) {
  const [autoDownload, setAutoDownloadState] = useState(() => readPreference(AUTO_DOWNLOAD_KEY, false))
  const [notifyOnComplete, setNotifyOnCompleteState] = useState(readNotificationPreference)
  const [notice, setNotice] = useState<PdfDeliveryNotice | null>(null)
  const pendingArm = useRef(false)
  const handledResults = useRef(new Set<string>())

  const setAutoDownload = useCallback((enabled: boolean) => {
    setAutoDownloadState(enabled)
    writePreference(AUTO_DOWNLOAD_KEY, enabled)
  }, [])

  const setNotifyOnComplete = useCallback((enabled: boolean) => {
    if (!enabled) {
      setNotifyOnCompleteState(false)
      writePreference(NOTIFY_KEY, false)
      return
    }

    if (!('Notification' in window)) {
      setNotifyOnCompleteState(false)
      writePreference(NOTIFY_KEY, false)
      setNotice({
        kind: 'info',
        title: '浏览器不支持系统通知',
        message: '页面内完成提示仍会正常显示。',
      })
      return
    }

    if (Notification.permission === 'granted') {
      setNotifyOnCompleteState(true)
      writePreference(NOTIFY_KEY, true)
      return
    }

    if (Notification.permission === 'denied') {
      setNotifyOnCompleteState(false)
      writePreference(NOTIFY_KEY, false)
      setNotice({
        kind: 'info',
        title: '系统通知已被浏览器阻止',
        message: '可以在浏览器站点设置中重新开启，页面内提示不受影响。',
      })
      return
    }

    void Notification.requestPermission()
      .then((permission) => {
        const allowed = permission === 'granted'
        setNotifyOnCompleteState(allowed)
        writePreference(NOTIFY_KEY, allowed)
        if (!allowed) {
          setNotice({
            kind: 'info',
            title: '未开启系统通知',
            message: '构建完成后仍会在页面中显示结果。',
          })
        }
      })
      .catch(() => {
        setNotifyOnCompleteState(false)
        writePreference(NOTIFY_KEY, false)
        setNotice({
          kind: 'info',
          title: '无法请求系统通知权限',
          message: '页面内完成提示仍会正常显示。',
        })
      })
  }, [])

  const armNextJob = useCallback(() => {
    if (!userId) return
    pendingArm.current = true
    try {
      localStorage.setItem(targetKey(userId), 'pending')
    } catch {
      // The in-memory arm still works while this page remains open.
    }
  }, [userId])

  const dismissNotice = useCallback(() => setNotice(null), [])

  useEffect(() => {
    if (!job || !userId) return

    let target = ''
    try {
      target = localStorage.getItem(targetKey(userId)) || ''
    } catch {
      target = pendingArm.current ? 'pending' : ''
    }

    if ((pendingArm.current || target === 'pending') && !isTerminalPdfJobStatus(job.status)) {
      pendingArm.current = false
      target = job.id
      try {
        localStorage.setItem(targetKey(userId), target)
      } catch {
        // Continue with the current in-memory job.
      }
    }

    if (!isTerminalPdfJobStatus(job.status) || target !== job.id) return

    const resultKey = `${job.id}:${job.status}:${job.updated_at}`
    if (handledResults.current.has(resultKey)) return
    handledResults.current.add(resultKey)

    try {
      localStorage.removeItem(targetKey(userId))
    } catch {
      // The handled result set still prevents duplicate work in this page.
    }

    if (job.status === 'completed') {
      const completionMessage = autoDownload
        ? `${job.document_name}.pdf 已生成，正在自动下载。`
        : `${job.document_name}.pdf 已生成，可以立即下载。`
      setNotice({ kind: 'success', title: 'PDF 构建完成', message: completionMessage })
      if (notifyOnComplete) sendBrowserNotification('PDF 构建完成', completionMessage)

      if (autoDownload) {
        const downloadMarker = `md-to-pdf:auto-downloaded:${job.id}`
        if (!readSessionMarker(downloadMarker)) {
          writeSessionMarker(downloadMarker)
          void triggerDownload(job.id).catch((error) => {
            removeSessionMarker(downloadMarker)
            setNotice({
              kind: 'error',
              title: '自动下载未能启动',
              message: error instanceof Error ? error.message : '请使用下载按钮重试。',
            })
          })
        }
      }
      return
    }

    if (job.status === 'failed') {
      const failureMessage = job.error_message || '构建未成功，请查看任务状态和 Actions 日志。'
      setNotice({ kind: 'error', title: `${job.document_name} 构建失败`, message: failureMessage })
      if (notifyOnComplete) sendBrowserNotification('PDF 构建失败', failureMessage)
      return
    }

    setNotice({ kind: 'info', title: 'PDF 已过期', message: '该任务的下载文件已过期，请重新生成。' })
  }, [autoDownload, job, notifyOnComplete, userId])

  return {
    autoDownload,
    notifyOnComplete,
    notice,
    setAutoDownload,
    setNotifyOnComplete,
    armNextJob,
    dismissNotice,
  }
}
