import { AppShell } from '../components/AppShell'
import { AuthPanel } from '../components/AuthPanel'
import { AuthSessionState } from '../components/AuthSessionState'
import { PageDropOverlay } from '../components/PageDropOverlay'
import { PdfJobHistory } from '../components/PdfJobHistory'
import { PdfJobStatus } from '../components/PdfJobStatus'
import { PdfUpload } from '../components/PdfUpload'
import { usePdfBuilder } from '../hooks/usePdfBuilder'
import { usePdfDelivery } from '../hooks/usePdfDelivery'

function ProductIntro() {
  return (
    <section className="intro-panel card" aria-labelledby="hero-title">
      <span className="intro-label">Markdown → PDF</span>
      <h1 id="hero-title">把文档交给稳定的构建流程</h1>
      <p>
        支持数学公式、代码高亮和本地资源。上传后可查看真实构建进度，并在完成时自动下载同名 PDF。
      </p>
      <div className="intro-points" aria-label="主要功能">
        <span>私有文件存储</span>
        <span>真实构建进度</span>
        <span>同名自动下载</span>
      </div>
    </section>
  )
}

export function PdfBuilderPage() {
  const {
    session,
    authStatus,
    authError,
    markdown,
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
    pageDropDisabled,
    setMarkdown,
    setAssets,
    acceptDroppedFiles,
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
    delivery.armNextJob()
    void start()
  }

  return (
    <AppShell authenticated onSignOut={() => void signOut()}>
      <PageDropOverlay disabled={pageDropDisabled} onFiles={acceptDroppedFiles} />

      <div className="workspace-intro" id="workspace">
        <div>
          <h1>Markdown 转 PDF</h1>
          <p>拖入文件即可开始。任务名称和下载文件名会自动沿用 Markdown 文件名。</p>
        </div>
        <span className="workspace-drop-hint">可拖到页面任意位置</span>
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
      {error && <div className="alert" role="alert">{error}</div>}

      <div className="workspace-grid">
        <div className="workspace-main">
          <PdfUpload
            markdown={markdown}
            assets={assets}
            recovery={submissionRecovery}
            busy={busy}
            progress={progress}
            phase={uploadPhase}
            autoDownload={delivery.autoDownload}
            notifyOnComplete={delivery.notifyOnComplete}
            onMarkdown={setMarkdown}
            onAssets={setAssets}
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
