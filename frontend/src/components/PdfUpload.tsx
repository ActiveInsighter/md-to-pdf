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
  return (
    <section className="card">
      <h2>新建 PDF 任务</h2>
      <div className="upload-grid">
        <label className="drop-zone">
          <strong>Markdown 文件</strong>
          <span>{markdown?.name || '选择 .md 文件，最大 10 MiB'}</span>
          <input
            type="file"
            accept=".md,text/markdown,text/plain"
            onChange={(e) => onMarkdown(e.target.files?.[0] || null)}
          />
        </label>
        <label className="drop-zone">
          <strong>可选资源压缩包</strong>
          <span>{assets?.name || '选择 assets.zip，最大 50 MiB'}</span>
          <input
            type="file"
            accept=".zip,application/zip"
            onChange={(e) => onAssets(e.target.files?.[0] || null)}
          />
        </label>
      </div>
      <div className="options">
        <label>
          主题
          <select value="chatgpt-light" disabled>
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
      <div className="progress" aria-label={`上传进度 ${progress}%`}>
        <span style={{ width: `${progress}%` }} />
      </div>
      <button disabled={busy || !markdown} onClick={onStart}>
        {busy ? '正在处理…' : '开始生成 PDF'}
      </button>
    </section>
  )
}
