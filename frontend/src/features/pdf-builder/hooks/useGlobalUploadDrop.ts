import { useEffect, useRef, useState } from 'react'
import { validateAssetsFile, validateMarkdownFile } from '../lib/files'

export function useGlobalUploadDrop({ disabled, onMarkdown, onAssets }: { disabled: boolean; onMarkdown: (file: File) => void; onAssets: (file: File) => void }) {
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
      const markdown = files.find((file) => file.name.toLowerCase().endsWith('.md'))
      const assets = files.find((file) => file.name.toLowerCase().endsWith('.zip'))
      if (!markdown && !assets) {
        setError('请拖入一个 .md 文件和可选的 .zip 资源包。')
        return
      }
      if (markdown) {
        const message = validateMarkdownFile(markdown)
        if (message) return setError(message)
        onMarkdown(markdown)
      }
      if (assets) {
        const message = validateAssetsFile(assets)
        if (message) return setError(message)
        onAssets(assets)
      }
      setError('')
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
  }, [disabled, onAssets, onMarkdown])

  return { active, error }
}
