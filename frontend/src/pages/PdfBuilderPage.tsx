import { AppShell } from '../components/AppShell'
import { AuthPanel } from '../components/AuthPanel'
import { AuthSessionState } from '../components/AuthSessionState'
import { PdfJobHistory } from '../components/PdfJobHistory'
import { PdfJobStatus } from '../components/PdfJobStatus'
import { PdfUpload } from '../components/PdfUpload'
import { usePdfBuilder } from '../hooks/usePdfBuilder'
import { usePdfDelivery } from '../hooks/usePdfDelivery'

const capabilities = [
  ['KaTeX', '数学公式'],
  ['Shiki', '代码高亮'],
  ['Private', '私有存储'],
  ['Auto', '完成后自动下载'],
]

const workflow = [
  ['01', '上传源文件', 'Markdown 与可选资源包'],
  ['02', '查看真实进度', '构建里程碑和耗时持续同步'],
  ['03', '自动交付', '完成后通知并按设置自动下载'],
]

function ProductIntro() {
  return (
    <section className="intro-panel surface-panel hero-panel" aria-labelledby="hero-title">
      <div className="hero-content">
        <p className="hero-kicker"><span aria-hidden="true" />RELIABLE DOCUMENT PIPELINE</p>
        <h2 id="hero-title">
          <span className="hero-gradient">Markdown</span>
          <br />生成清晰 PDF
        </h2>
        <p className="hero-description">
          将结构化内容、数学公式和代码高亮送入稳定的 Chromium 渲染链路，实时查看构建阶段，完成后自动交付文件。
        </p>

        <div className="command-strip" aria-label="构建流程摘要">
          <span aria-hidden="true">›</span>
          <code>source.md → tracked build → document.pdf</code>
        </div>

        <div className="hero-actions">
          <a className="button-link" href="#auth-panel">开始使用</a>
          <a className="secondary-link" href="#workflow">查看流程</a>
        </div>
      </div>

      <div className="hero-metrics" aria-label="渲染能力">
        {capabilities.map(([value, label]) => (
          <div className="metric-card" key={value}>
            <strong>{value}</strong>
            <span>{label}</span>
          </div>
        ))}
      </div>

      <ol className="hero-workflow" id="workflow">
        {workflow.map(([number, title, description]) => (
          <li key={number}>
            <span>{number}</span>
            <div>
              <strong>{title}</strong>
              <p>{description}</p>
            </div>
          </li>
        ))}
      </ol>
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
    setMarkdown,
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
      <div className="workspace-grid" id="workspace">
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
