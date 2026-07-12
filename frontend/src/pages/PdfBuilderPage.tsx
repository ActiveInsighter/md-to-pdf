import { useCallback } from 'react'
import { AppShell } from '../components/AppShell'
import { AuthPanel } from '../components/AuthPanel'
import { AuthSessionState } from '../components/AuthSessionState'
import { PdfJobHistory } from '../components/PdfJobHistory'
import { PdfJobStatus } from '../components/PdfJobStatus'
import { PdfUpload } from '../components/PdfUpload'
import { useGlobalFileDrop } from '../hooks/useGlobalFileDrop'
import { usePdfBuilder } from '../hooks/usePdfBuilder'
import { usePdfDelivery } from '../hooks/usePdfDelivery'

function ProductIntro() {
  return (
    <section className="intro-panel">
      <p className="eyebrow">MARKDOWN TO PDF</p>
      <h1>把文档直接变成 PDF</h1>
      <p>上传文件或粘贴 Markdown 文本，保留公式、代码高亮和目录书签。完成后可自动下载。</p>
      <div className="intro-file-example" aria-label="文件命名示例">
        <code>操作系统第5章.md</code>
        <span>→</span>
        <code>操作系统第5章.pdf</code>
      </div>
    </section>
  )
}

export function PdfBuilderPage() {
  const {
    session,
    authStatus,
    authError,
    markdownSource,
    assets,
    job,
    history,
    historyLoading,
    historySyncedAt,
    historyError,
    submissionRecovery,
    busy,
    progress,
    uploadPhase,
    error,
    setMarkdownSource,
    setAssets,
    retryAuth,
    refreshHistory,
    start,
    download,
    reset,
    selectJob,
    signOut,
  } = usePdfBuilder()

  const delivery = usePdfDelivery({
    job,
    userId: session?.user.id ?? null,
  })

  const handleMarkdown = useCallback((file: File | null) => {
    setMarkdownSource(file ? { kind: 'file', file } : null)
  }, [setMarkdownSource])

  const handleAssets = useCallback((file: File | null) => {
    setAssets(file)
  }, [setAssets])

  const globalDrop = useGlobalFileDrop({
    disabled: authStatus !== 'ready'
      || !session
      || busy
      || uploadPhase === 'submitted'
      || submissionRecovery?.status === 'uploaded',
    onMarkdown: handleMarkdown,
    onAssets: handleAssets,
  })

  if (authStatus !== 'ready') {
    return (
      <AppShell authenticated={false}>
        <div className="auth-layout">
          <ProductIntro />
          <AuthSessionState
            status={authStatus}
            error={authError}
            onRetry={() => void retryAuth()}
          />
        </div>
      </AppShell>
    )
  }

  if (!session) {
    return (
      <AppShell authenticated={false}>
        <div className="auth-layout">
          <ProductIntro />
          <AuthPanel />
        </div>
      </AppShell>
    )
  }

  const startWithDelivery = () => {
    if (markdownSource || submissionRecovery) delivery.armNextJob()
    void start()
  }

  return (
    <AppShell authenticated onSignOut={() => void signOut()}>
      {globalDrop.active && (
        <div className="global-drop-overlay" role="status" aria-live="polite">
          <div>
            <span className="global-drop-icon" aria-hidden="true">↓</span>
            <strong>松开即可添加文件</strong>
            <p>支持一个 `.md` 和一个可选 `.zip`</p>
          </div>
        </div>
      )}

      <div className="workspace-intro">
        <div>
          <h1>生成 PDF</h1>
          <p>上传 Markdown 文件或直接粘贴文本，任务和 PDF 都会沿用文档名称。</p>
        </div>
        <span>私有存储 · 真实进度</span>
      </div>

      {delivery.notice && (
        <div className={`job-notice notice-${delivery.notice.kind}`} role="status" aria-live="assertive">
          <div>
            <strong>{delivery.notice.title}</strong>
            <span>{delivery.notice.message}</span>
          </div>
          <button type="button" className="notice-dismiss" onClick={delivery.dismissNotice} aria-label="关闭提示">×</button>
        </div>
      )}
      {globalDrop.error && <div className="alert" role="alert">{globalDrop.error}</div>}
      {error && <div className="alert" role="alert">{error}</div>}

      <div className="workspace-grid" id="workspace">
        <div className="workspace-main">
          <PdfUpload
            markdownSource={markdownSource}
            assets={assets}
            recovery={submissionRecovery}
            busy={busy}
            progress={progress}
            phase={uploadPhase}
            autoDownload={delivery.autoDownload}
            notifyOnComplete={delivery.notifyOnComplete}
            onMarkdownSource={setMarkdownSource}
            onAssets={handleAssets}
            onAutoDownload={delivery.setAutoDownload}
            onNotifyOnComplete={delivery.setNotifyOnComplete}
            onStart={startWithDelivery}
            onReset={() => void reset()}
          />
          <PdfJobStatus
            job={job}
            autoDownload={delivery.autoDownload}
            notifyOnComplete={delivery.notifyOnComplete}
            onDownload={() => void download()}
            onNew={() => void reset()}
          />
        </div>
        <aside className="workspace-sidebar" id="history" aria-label="任务历史">
          <PdfJobHistory
            jobs={history}
            loading={historyLoading}
            lastSyncedAt={historySyncedAt}
            error={historyError}
            selectedJobId={job?.id ?? null}
            onRefresh={() => void refreshHistory()}
            onSelect={selectJob}
          />
        </aside>
      </div>
    </AppShell>
  )
}
