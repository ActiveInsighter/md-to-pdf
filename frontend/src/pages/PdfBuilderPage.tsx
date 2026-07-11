import { AppShell } from '../components/AppShell'
import { AuthPanel } from '../components/AuthPanel'
import { PdfJobHistory } from '../components/PdfJobHistory'
import { PdfJobStatus } from '../components/PdfJobStatus'
import { PdfUpload } from '../components/PdfUpload'
import { usePdfBuilder } from '../hooks/usePdfBuilder'

export function PdfBuilderPage() {
  const {
    session,
    markdown,
    assets,
    job,
    history,
    busy,
    progress,
    error,
    setMarkdown,
    setAssets,
    start,
    download,
    reset,
    selectJob,
    signOut,
  } = usePdfBuilder()

  if (!session) {
    return (
      <AppShell authenticated={false}>
        <div className="auth-layout">
          <section className="intro-panel glass-panel">
            <p className="eyebrow">FROM SOURCE TO DOCUMENT</p>
            <h2>保留 Markdown 结构，交付稳定 PDF</h2>
            <p className="muted">服务复用现有 KaTeX、Shiki 与 Chromium 渲染链路，用户文件不会写入 Git 仓库。</p>
            <ol className="process-list">
              <li><span>01</span><div><strong>上传源文件</strong><p>选择 Markdown 与可选资源压缩包。</p></div></li>
              <li><span>02</span><div><strong>异步安全构建</strong><p>私有存储与 GitHub Actions 隔离处理。</p></div></li>
              <li><span>03</span><div><strong>签名链接下载</strong><p>任务完成后获取短期 PDF 下载地址。</p></div></li>
            </ol>
          </section>
          <AuthPanel />
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell authenticated onSignOut={() => void signOut()}>
      {error && <div className="alert" role="alert">{error}</div>}
      <div className="workspace-grid">
        <div className="workspace-main">
          <PdfUpload
            markdown={markdown}
            assets={assets}
            busy={busy}
            progress={progress}
            onMarkdown={setMarkdown}
            onAssets={setAssets}
            onStart={() => void start()}
          />
          <PdfJobStatus job={job} onDownload={() => void download()} onNew={reset} />
        </div>
        <aside className="workspace-sidebar" aria-label="任务历史">
          <PdfJobHistory jobs={history} onSelect={selectJob} />
        </aside>
      </div>
    </AppShell>
  )
}
