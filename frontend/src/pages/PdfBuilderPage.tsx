import { useCallback, useMemo, useState } from 'react'
import { AppShell } from '../components/AppShell'
import { AuthPanel } from '../components/AuthPanel'
import { AuthSessionState } from '../components/AuthSessionState'
import { PdfBatchUpload } from '../components/PdfBatchUpload'
import { PdfJobHistory } from '../components/PdfJobHistory'
import { PdfJobStatus } from '../components/PdfJobStatus'
import { PdfUpload } from '../components/PdfUpload'
import { useGlobalFileDrop } from '../hooks/useGlobalFileDrop'
import { usePdfBuilder } from '../hooks/usePdfBuilder'
import { usePdfDelivery } from '../hooks/usePdfDelivery'
import { isTerminalPdfJobStatus } from '../utils/pdfJobStatus'

type WorkspaceMode = 'single' | 'batch'

function BenefitIcon({ name }: { name: 'upload' | 'progress' | 'delivery' }) {
  if (name === 'upload') {
    return (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M12 15V4M8 8l4-4 4 4" />
        <path d="M5 14v4.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V14" />
      </svg>
    )
  }
  if (name === 'progress') {
    return (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M4 18V9M10 18V5M16 18v-7M22 18V3" />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 4v11M8 11l4 4 4-4" />
      <path d="M5 19h14" />
    </svg>
  )
}

function ProductIntro() {
  return (
    <section className="intro-panel">
      <span className="section-kicker">MARKDOWN PDF WORKSPACE</span>
      <h1>从 Markdown 到 PDF，过程清楚，结果可靠。</h1>
      <p>上传文档或粘贴文本，选择主题后交给独立构建队列。公式、代码高亮、图片附件和目录书签都会进入同一条可追踪流程。</p>
      <div className="intro-file-example" aria-label="文件命名示例">
        <code>操作系统第5章.md</code>
        <svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M4 10h12M12 6l4 4-4 4" /></svg>
        <code>操作系统第5章.pdf</code>
      </div>
      <div className="intro-benefits">
        <div><span><BenefitIcon name="upload" /></span><strong>私有上传</strong><small>源文件不进入仓库</small></div>
        <div><span><BenefitIcon name="progress" /></span><strong>真实进度</strong><small>同步 Action 关键阶段</small></div>
        <div><span><BenefitIcon name="delivery" /></span><strong>灵活交付</strong><small>手动或自动下载</small></div>
      </div>
    </section>
  )
}

export function PdfBuilderPage() {
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>('single')
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

  const activeTaskCount = useMemo(
    () => history.filter((item) => !isTerminalPdfJobStatus(item.status)).length,
    [history],
  )
  const completedTaskCount = useMemo(
    () => history.filter((item) => item.status === 'completed').length,
    [history],
  )
  const favoriteTaskCount = useMemo(
    () => history.filter((item) => item.is_favorite).length,
    [history],
  )

  const handleMarkdown = useCallback((file: File | null) => {
    if (file) setWorkspaceMode('single')
    setMarkdownSource(file ? { kind: 'file', file } : null)
  }, [setMarkdownSource])

  const handleAssets = useCallback((file: File | null) => {
    if (file) setWorkspaceMode('single')
    setAssets(file)
  }, [setAssets])

  const handleBatchSubmitted = useCallback(() => {
    void refreshHistory()
  }, [refreshHistory])

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
            <span className="global-drop-icon" aria-hidden="true"><BenefitIcon name="upload" /></span>
            <strong>松开即可添加到单文件任务</strong>
            <p>支持一个 `.md` 和一个可选 `.zip` 资源包</p>
          </div>
        </div>
      )}

      <section className="workspace-hero">
        <div className="workspace-hero-copy">
          <span className="section-kicker">PDF WORKSPACE</span>
          <h1>生成、跟踪并管理你的 PDF</h1>
          <p>单个文档适合精细配置，批量队列适合并发处理。两种模式共享任务历史和真实构建状态。</p>
        </div>
        <div className="workspace-metrics" aria-label="任务概览">
          <div><strong>{activeTaskCount}</strong><span>进行中</span></div>
          <div><strong>{completedTaskCount}</strong><span>已完成</span></div>
          <div><strong>{favoriteTaskCount}</strong><span>已收藏</span></div>
        </div>
      </section>

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
          <div className="workspace-mode-bar">
            <div>
              <span className="section-kicker">CREATE</span>
              <strong>选择任务模式</strong>
            </div>
            <div className="workspace-mode-switch" role="tablist" aria-label="PDF 任务模式">
              <button
                type="button"
                role="tab"
                aria-selected={workspaceMode === 'single'}
                aria-controls="single-workspace"
                className={workspaceMode === 'single' ? 'is-active' : ''}
                onClick={() => setWorkspaceMode('single')}
              >
                单个文档
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={workspaceMode === 'batch'}
                aria-controls="batch-workspace"
                className={workspaceMode === 'batch' ? 'is-active' : ''}
                onClick={() => setWorkspaceMode('batch')}
              >
                批量并发
              </button>
            </div>
          </div>

          <div id="single-workspace" role="tabpanel" hidden={workspaceMode !== 'single'}>
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
          </div>

          <div id="batch-workspace" role="tabpanel" hidden={workspaceMode !== 'batch'}>
            <PdfBatchUpload disabled={busy} onSubmitted={handleBatchSubmitted} />
          </div>

          <PdfJobStatus
            job={job}
            autoDownload={delivery.autoDownload}
            notifyOnComplete={delivery.notifyOnComplete}
            onDownload={() => void download()}
            onNew={() => {
              void reset()
              setWorkspaceMode('single')
            }}
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
