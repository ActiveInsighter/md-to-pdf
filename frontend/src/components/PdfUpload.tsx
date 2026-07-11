import { useRef, useState } from 'react';
import type { ChangeEvent, DragEvent, KeyboardEvent } from 'react';

interface PdfUploadProps {
  file: File | null;
  disabled: boolean;
  uploadProgress: number;
  onFileChange: (file: File | null) => void;
  onBuild: () => void;
}

function isSupported(file: File): boolean {
  const name = file.name.toLowerCase();
  return name.endsWith('.md') || name.endsWith('.markdown') || name.endsWith('.zip');
}

export function PdfUpload({ file, disabled, uploadProgress, onFileChange, onBuild }: PdfUploadProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragging, setDragging] = useState(false);

  function acceptFile(nextFile: File | undefined) {
    if (!nextFile) return;
    if (!isSupported(nextFile)) {
      window.alert('仅支持 .md、.markdown 或 .zip 文件。');
      return;
    }
    onFileChange(nextFile);
  }

  return (
    <section className="card upload-card">
      <div
        className={`drop-zone ${dragging ? 'dragging' : ''}`}
        onDragEnter={(event: DragEvent<HTMLDivElement>) => { event.preventDefault(); setDragging(true); }}
        onDragOver={(event: DragEvent<HTMLDivElement>) => event.preventDefault()}
        onDragLeave={() => setDragging(false)}
        onDrop={(event: DragEvent<HTMLDivElement>) => {
          event.preventDefault();
          setDragging(false);
          acceptFile(event.dataTransfer.files[0]);
        }}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => { if (event.key === 'Enter') inputRef.current?.click(); }}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".md,.markdown,.zip,text/markdown,application/zip"
          hidden
          onChange={(event: ChangeEvent<HTMLInputElement>) => acceptFile(event.target.files?.[0])}
        />
        <strong>{file ? file.name : '拖拽 Markdown 或 ZIP 到这里'}</strong>
        <span>{file ? `${(file.size / 1024 / 1024).toFixed(2)} MB` : '也可以点击选择文件'}</span>
      </div>

      {uploadProgress > 0 && uploadProgress < 100 && (
        <div className="progress" aria-label={`上传进度 ${uploadProgress}%`}>
          <div style={{ width: `${uploadProgress}%` }} />
        </div>
      )}

      <div className="actions-row">
        <button type="button" className="secondary" disabled={disabled || !file} onClick={() => onFileChange(null)}>
          清除
        </button>
        <button type="button" className="primary" disabled={disabled || !file} onClick={onBuild}>
          {disabled ? '处理中…' : '开始构建'}
        </button>
      </div>
    </section>
  );
}
