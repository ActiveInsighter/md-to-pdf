import { useEffect, useRef, useState } from 'react'
import { validateAssetsFile, validateMarkdownFile } from '../lib/files'

type GlobalUploadDropOptions = {
  disabled: boolean
  onFiles: (markdown: File | null, assets: File | null) => void
}

export function useGlobalUploadDrop({ disabled, onFiles }: GlobalUploadDropOptions) {
  const [active, setActive] = useState(false)
  const [error, setError] = useState('')
  const dragDepth = useRef(0)

  useEffect(() => {
    if (disabled) {
      setActive(false)
      return
    }

    const hasFiles = (event: DragEvent) => Array.from(event.dataTransfer?.types || []).includes('Files')
    const enter = (event: DragEvent) => {
      if (!hasFiles(event)) return
      event.preventDefault()
      dragDepth.current += 1
      setActive(true)
    }
    const over = (event: DragEvent) => {
      if (!hasFiles(event)) return
      event.preventDefault()
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
    }
    const leave = (event: DragEvent) => {
      if (!hasFiles(event)) return
      dragDepth.current = Math.max(0, dragDepth.current - 1)
      if (dragDepth.current === 0) setActive(false)
    }
    const drop = (event: DragEvent) => {
      if (!hasFiles(event)) return
      event.preventDefault()
      dragDepth.current = 0
      setActive(false)

      const files = Array.from(event.dataTransfer?.files || [])
      const markdown = files.find((file) => file.name.toLowerCase().endsWith('.md')) || null
      const assets = files.find((file) => file.name.toLowerCase().endsWith('.zip')) || null
      if (!markdown && !assets) {
        setError('请拖入一个 .md 文件和可选的 .zip 资源包。')
        return
      }
      if (!markdown) {
        setError('请同时拖入 Markdown 文件；资源 ZIP 不能单独创建任务。')
        return
      }

      const markdownError = validateMarkdownFile(markdown)
      if (markdownError) {
        setError(markdownError)
        return
      }
      if (assets) {
        const assetsError = validateAssetsFile(assets)
        if (assetsError) {
          setError(assetsError)
          return
        }
      }

      setError('')
      onFiles(markdown, assets)
    }

    window.addEventListener('dragenter', enter)
    window.addEventListener('dragover', over)
    window.addEventListener('dragleave', leave)
    window.addEventListener('drop', drop)
    return () => {
      window.removeEventListener('dragenter', enter)
      window.removeEventListener('dragover', over)
      window.removeEventListener('dragleave', leave)
      window.removeEventListener('drop', drop)
    }
  }, [disabled, onFiles])

  return { active, error }
}
