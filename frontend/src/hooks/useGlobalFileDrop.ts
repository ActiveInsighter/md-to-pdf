import { useEffect, useRef, useState } from 'react'
import { validateAssetsFile, validateMarkdownFile } from '../utils/uploadFiles'

type Options = {
  disabled: boolean
  onMarkdown: (file: File) => void
  onAssets: (file: File) => void
}

function hasFiles(event: DragEvent): boolean {
  return Array.from(event.dataTransfer?.types || []).includes('Files')
}

function isMarkdown(file: File): boolean {
  return file.name.toLowerCase().endsWith('.md')
}

function isZip(file: File): boolean {
  return file.name.toLowerCase().endsWith('.zip')
}

export function useGlobalFileDrop({ disabled, onMarkdown, onAssets }: Options) {
  const [active, setActive] = useState(false)
  const [error, setError] = useState('')
  const dragDepth = useRef(0)

  useEffect(() => {
    const reset = () => {
      dragDepth.current = 0
      setActive(false)
    }

    const handleDragEnter = (event: DragEvent) => {
      if (disabled || !hasFiles(event)) return
      event.preventDefault()
      dragDepth.current += 1
      setActive(true)
    }

    const handleDragOver = (event: DragEvent) => {
      if (disabled || !hasFiles(event)) return
      event.preventDefault()
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
      setActive(true)
    }

    const handleDragLeave = (event: DragEvent) => {
      if (!hasFiles(event)) return
      dragDepth.current = Math.max(0, dragDepth.current - 1)
      if (dragDepth.current === 0) setActive(false)
    }

    const handleDrop = (event: DragEvent) => {
      if (!hasFiles(event)) return
      event.preventDefault()
      reset()
      if (disabled) return

      const files = Array.from(event.dataTransfer?.files || [])
      const markdownFiles = files.filter(isMarkdown)
      const zipFiles = files.filter(isZip)
      const unsupportedCount = files.length - markdownFiles.length - zipFiles.length
      const messages: string[] = []

      if (markdownFiles.length > 1) messages.push('一次只能选择一个 Markdown 文件。')
      if (zipFiles.length > 1) messages.push('一次只能选择一个 ZIP 资源包。')
      if (unsupportedCount > 0) messages.push('已忽略不支持的文件，仅接受 .md 和 .zip。')

      const markdown = markdownFiles[0]
      if (markdown) {
        const validationError = validateMarkdownFile(markdown)
        if (validationError) messages.push(validationError)
        else onMarkdown(markdown)
      }

      const assets = zipFiles[0]
      if (assets) {
        const validationError = validateAssetsFile(assets)
        if (validationError) messages.push(validationError)
        else onAssets(assets)
      }

      if (!markdown && !assets && messages.length === 0) {
        messages.push('请拖入 Markdown 文件或 ZIP 资源包。')
      }

      setError(messages.join(' '))
    }

    const handleWindowBlur = () => reset()

    document.addEventListener('dragenter', handleDragEnter)
    document.addEventListener('dragover', handleDragOver)
    document.addEventListener('dragleave', handleDragLeave)
    document.addEventListener('drop', handleDrop)
    window.addEventListener('blur', handleWindowBlur)

    return () => {
      document.removeEventListener('dragenter', handleDragEnter)
      document.removeEventListener('dragover', handleDragOver)
      document.removeEventListener('dragleave', handleDragLeave)
      document.removeEventListener('drop', handleDrop)
      window.removeEventListener('blur', handleWindowBlur)
    }
  }, [disabled, onAssets, onMarkdown])

  return {
    active,
    error,
    clearError: () => setError(''),
  }
}
