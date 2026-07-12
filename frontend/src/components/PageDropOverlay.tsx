import { useEffect, useRef, useState } from 'react'

type Props = {
  disabled: boolean
  onFiles: (files: File[]) => void
}

function hasFiles(event: DragEvent): boolean {
  return Array.from(event.dataTransfer?.types || []).includes('Files')
}

export function PageDropOverlay({ disabled, onFiles }: Props) {
  const [visible, setVisible] = useState(false)
  const dragDepth = useRef(0)

  useEffect(() => {
    const reset = () => {
      dragDepth.current = 0
      setVisible(false)
    }

    const handleDragEnter = (event: DragEvent) => {
      if (!hasFiles(event)) return
      event.preventDefault()
      dragDepth.current += 1
      if (!disabled) setVisible(true)
    }

    const handleDragOver = (event: DragEvent) => {
      if (!hasFiles(event)) return
      event.preventDefault()
      if (event.dataTransfer) event.dataTransfer.dropEffect = disabled ? 'none' : 'copy'
    }

    const handleDragLeave = (event: DragEvent) => {
      if (!hasFiles(event)) return
      dragDepth.current = Math.max(0, dragDepth.current - 1)
      if (dragDepth.current === 0) setVisible(false)
    }

    const handleDrop = (event: DragEvent) => {
      if (!hasFiles(event)) return
      event.preventDefault()
      const files = Array.from(event.dataTransfer?.files || [])
      reset()
      if (!disabled && files.length > 0) onFiles(files)
    }

    window.addEventListener('dragenter', handleDragEnter)
    window.addEventListener('dragover', handleDragOver)
    window.addEventListener('dragleave', handleDragLeave)
    window.addEventListener('drop', handleDrop)
    window.addEventListener('dragend', reset)

    return () => {
      window.removeEventListener('dragenter', handleDragEnter)
      window.removeEventListener('dragover', handleDragOver)
      window.removeEventListener('dragleave', handleDragLeave)
      window.removeEventListener('drop', handleDrop)
      window.removeEventListener('dragend', reset)
    }
  }, [disabled, onFiles])

  if (!visible) return null

  return (
    <div className="page-drop-overlay" role="status" aria-live="polite">
      <div className="page-drop-card">
        <span className="page-drop-icon" aria-hidden="true">↓</span>
        <strong>松开即可添加文件</strong>
        <span>支持一个 Markdown 文件和一个可选 ZIP 资源包</span>
      </div>
    </div>
  )
}
