import { useReducer, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toUserMessage } from '@/lib/errors'
import { pdfJobKeys } from '@/features/pdf-jobs/queryKeys'
import { usePdfJobActions } from '@/features/pdf-jobs/hooks/usePdfJobActions'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import type { MarkdownSource, PdfThemeId, SubmissionRecovery } from '../types'
import { createSubmissionRecovery, markdownSourceToFile, validateAssetsFile, validateMarkdownFile } from '../lib/files'
import { initialSubmissionState, submissionReducer } from '../submissionReducer'

type SubmissionInput = {
  source: MarkdownSource | null
  assets: File | null
  documentName: string
  theme: PdfThemeId
}

export function usePdfSubmission(serverRecovery: SubmissionRecovery | null, onSubmitted?: (jobId: string) => void) {
  const [state, dispatch] = useReducer(submissionReducer, initialSubmissionState)
  const [localRecovery, setLocalRecovery] = useState<SubmissionRecovery | null>(null)
  const actions = usePdfJobActions()
  const queryClient = useQueryClient()
  const setSelectedJobId = useWorkspaceStore((store) => store.setSelectedJobId)
  const recovery = localRecovery || serverRecovery
  const busy = ['creating', 'uploading-markdown', 'uploading-assets', 'starting', 'cancelling'].includes(state.status)

  async function submit(input: SubmissionInput): Promise<void> {
    if (busy) return
    let target = recovery
    let targetJobId: string | undefined = target?.jobId
    try {
      const needsUpload = !target || target.status === 'created'
      const markdownFile = input.source ? markdownSourceToFile(input.source, input.documentName) : null
      if (needsUpload && !markdownFile) throw new Error('请选择 Markdown 文件或粘贴 Markdown 文本。')
      if (markdownFile) {
        const fileError = validateMarkdownFile(markdownFile)
        if (fileError) throw new Error(fileError)
      }
      if (input.assets) {
        const assetsError = validateAssetsFile(input.assets)
        if (assetsError) throw new Error(assetsError)
      }
      if (target?.status === 'created' && target.hasAssets && !input.assets) throw new Error('该恢复任务需要原资源压缩包，请重新选择 ZIP 文件。')
      if (target?.status === 'created' && !target.hasAssets && input.assets) throw new Error('该恢复任务创建时未包含资源包，请移除 ZIP 或放弃后重新创建。')

      if (!target) {
        dispatch({ type: 'CREATING' })
        const created = await actions.create.mutateAsync({ hasAssets: Boolean(input.assets), sourceFilename: markdownFile!.name, theme: input.theme })
        target = createSubmissionRecovery(created, Boolean(input.assets))
        targetJobId = created.jobId
        setLocalRecovery(target)
        setSelectedJobId(created.jobId)
      }

      if (target.status === 'created') {
        dispatch({ type: 'UPLOADING_MARKDOWN', jobId: target.jobId })
        await actions.uploadMarkdown.mutateAsync({ path: target.inputPath, file: markdownFile! })
        if (target.hasAssets && target.assetsPath && input.assets) {
          dispatch({ type: 'UPLOADING_ASSETS', jobId: target.jobId })
          await actions.uploadResources.mutateAsync({ path: target.assetsPath, file: input.assets })
        }
      }

      dispatch({ type: 'STARTING', jobId: target.jobId })
      await actions.start.mutateAsync(target.jobId)
      setLocalRecovery(null)
      dispatch({ type: 'SUBMITTED', jobId: target.jobId })
      setSelectedJobId(target.jobId)
      onSubmitted?.(target.jobId)
    } catch (cause) {
      dispatch({
        type: 'FAILED',
        jobId: targetJobId,
        message: `${toUserMessage(cause)}${targetJobId ? ' 任务已保留，可修复后重试。' : ''}`,
        recoverable: Boolean(targetJobId),
      })
      await queryClient.invalidateQueries({ queryKey: pdfJobKeys.all })
    }
  }

  async function cancelRecovery(): Promise<void> {
    if (!recovery || busy) {
      dispatch({ type: 'RESET' })
      return
    }
    dispatch({ type: 'CANCELLING', jobId: recovery.jobId })
    try {
      await actions.cancel.mutateAsync(recovery.jobId)
      setLocalRecovery(null)
      setSelectedJobId(null)
      dispatch({ type: 'RESET' })
    } catch (cause) {
      dispatch({ type: 'FAILED', jobId: recovery.jobId, message: toUserMessage(cause), recoverable: true })
    }
  }

  return { state, busy, recovery, submit, cancelRecovery, reset: () => dispatch({ type: 'RESET' }) }
}
