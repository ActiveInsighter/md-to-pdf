import { type DragEvent, useEffect, useId, useState } from 'react'
import { formatFileSize } from '../utils/uploadFiles'

type Props = {
  title: string
  hint: string
  accept: string
  file: File | null
  optional?: boolean
  disabled?: boolean
  validate: (file: File) => string | null
  onChange: (file: File | null) => void
}

function FileStateIcon({ selected }: { selected: boolean }) {
  return selected ? (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="m5 12.5 4.2 4.2L19 7" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 16V5" />
      <path d="m8 9 4-4 4 4" />
      <path d="M5 15v3a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3" />
    </svg>
  )
}

export function FileDropField({
  title,
  hint,
  accept,
  file,
  optional = false,
  disabled = false,
  validate,
  onChange,
}: Props) {
  const inputId = useId()
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!file) setError('')
  }, [file])

  function choose(next: File | null) {
    if (!next || disabled) return
    const validationError = validate(next)
    if (validationError) {
      setError(validationError)
      return
    }

    setError('')
    onChange(next)
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    if (!disabled) setDragging(true)
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setDragging(false)
    choose(event.dataTransfer.files.item(0))
  }

  return (
    <div
      className={`file-drop-field${dragging ? ' is-dragging' : ''}${file ? ' has-file' : ''}${disabled ? ' is-disabled' : ''}`}
      onDragEnter={handleDragOver}
      onDragOver={handleDragOver}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
    >
      <label className="file-drop-target" htmlFor={inputId}>
        <span className="file-drop-icon" aria-hidden="true"><FileStateIcon selected={Boolean(file)} /></span>
        <span className="file-drop-copy">
          <span className="file-drop-title-row">
            <strong>{title}</strong>
            {optional && <span className="file-optional">可选</span>}
          </span>
          {file ? (
            <>
              <span className="file-name">{file.name}</span>
              <span className="file-meta">{formatFileSize(file.size)} · 点击或拖入文件可替换</span>
            </>
          ) : (
            <>
              <span>{hint}</span>
              <span className="file-meta">点击选择，或将文件拖到此处</span>
            </>
          )}
        </span>
        <input
          id={inputId}
          className="visually-hidden-file-input"
          type="file"
          accept={accept}
          disabled={disabled}
          onChange={(event) => {
            choose(event.currentTarget.files?.item(0) ?? null)
            event.currentTarget.value = ''
          }}
        />
      </label>
      {file && (
        <button
          type="button"
          className="file-remove-button"
          disabled={disabled}
          aria-label={`移除 ${file.name}`}
          onClick={() => {
            setError('')
            onChange(null)
          }}
        >
          移除
        </button>
      )}
      {error && <p className="file-validation-error" role="alert">{error}</p>}
    </div>
  )
}
