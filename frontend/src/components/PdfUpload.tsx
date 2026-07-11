type Props = {
  markdown: File | null
  assets: File | null
  busy: boolean
  progress: number
  onMarkdown: (file: File | null) => void
  onAssets: (file: File | null) => void
  onStart: () => void
}

export function PdfUpload({
  markdown,
  assets,
  busy,
  progress,
  onMarkdown,
  onAssets,
  onStart,
}: Props) {
  const progressText =
    progress === 0
      ? '尚未开始处理文件。'
      : progress >= 100
        ? '文件上传完成，PDF 构建任务已启动。'
        : `文件处理进度 ${progress}%。`

  return (
    <section className="card" aria-labelledby="pdf-upload-title" aria-busy={busy}>
      <h2 id="pdf-upload-title">新建 PDF 任务</h2>
      <div className="upload-grid">
        <label className="drop-zone" htmlFor="markdown-file">
          <strong>Markdown 文件</strong>
          <span id="markdown-file-help">{markdown?.name || '选择 .md 文件，最大 10 MiB'}</span>
          <input
            id="markdown-file"
            type="file"
            accept=".md,text/markdown,text/plain"
            aria-describedby="markdown-file-help"
            onChange={(event) => onMarkdown(event.target.files?.[0] || null)}
          />
        </label>
        <label className="drop-zone" htmlFor="assets-file">
          <strong>可选资源压缩包</strong>
          <span id="assets-file-help">{assets?.name || '选择 assets.zip，最大 50 MiB'}</span>
          <input
            id="assets-file"
            type="file"
            accept=".zip,application/zip"
            aria-describedby="assets-file-help"
            onChange={(event) => onAssets(event.target.files?.[0] || null)}
          />
        </label>
      </div>
      <div className="options" aria-label="PDF 构建选项">
        <label>
          主题
          <select value="chatgpt-light" disabled aria-label="PDF 主题">
            <option>chatgpt-light</option>
          </select>
        </label>
        <label>
          <input type="checkbox" checked readOnly /> Markdown 软换行
        </label>
        <label>
          <input type="checkbox" checked readOnly /> PDF 书签
        </label>
      </div>
      <div
        className="progress"
        role="progressbar"
        aria-label="文件处理进度"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress}
        aria-valuetext={progressText}
      >
        <span style={{ width: `${progress}%` }} />
      </div>
      <p id="pdf-upload-status" className="sr-only" aria-live="polite" aria-atomic="true">
        {progressText}
      </p>
      <button type="button" disabled={busy || !markdown} onClick={onStart} aria-describedby="pdf-upload-status">
        {busy ? '正在处理…' : '开始生成 PDF'}
      </button>
    </section>
  )
}
