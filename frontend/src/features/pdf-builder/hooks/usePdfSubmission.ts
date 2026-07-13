import { useEffect, useReducer, useRef, useState } from 'react'
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
  const operationRef = useRef(false)
  const recovery = localRecovery || serverRecovery
  const recoveryRef = useRef<SubmissionRecovery | null>(recovery)
  const busy = ['creating', 'uploading-markdown', 'uploading-assets', 'starting', 'cancelling'].includes(state.status)

  useEffect(() => {
    recoveryRef.current = recovery
    if (recovery?.status === 'uploaded' && state.status === 'idle') {
      dispatch({ type: 'PREPARED', jobId: recovery.jobId })
    }
  }, [recovery, state.status])

  function rememberRecovery(next: SubmissionRecovery | null) {
    recoveryRef.current = next
    setLocalRecovery(next)
  }

  async function createAndUpload(input: SubmissionInput): Promise<SubmissionRecovery> {
    let target = recoveryRef.current
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
    if (target?.status === 'created' && target.hasAssets && !input.assets) {
      throw new Error('该待启动任务需要原资源压缩包，请重新选择 ZIP 文件。')
    }
    if (target?.status === 'created' && !target.hasAssets && input.assets) {
      throw new Error('该待启动任务创建时未包含资源包，请先清空任务再重新选择。')
    }

    if (!target) {
      dispatch({ type: 'CREATING' })
      const created = await actions.create.mutateAsync({
        hasAssets: Boolean(input.assets),
        sourceFilename: markdownFile!.name,
        theme: input.theme,
      })
      target = createSubmissionRecovery(created, Boolean(input.assets))
      rememberRecovery(target)
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

    dispatch({ type: 'PREPARED', jobId: target.jobId })
    await queryClient.invalidateQueries({ queryKey: pdfJobKeys.all })
    return target
  }

  async function prepare(input: SubmissionInput): Promise<SubmissionRecovery | null> {
    if (operationRef.current) return recoveryRef.current
    operationRef.current = true
    const initialJobId = recoveryRef.current?.jobId
    try {
      return await createAndUpload(input)
    } catch (cause) {
      const targetJobId = recoveryRef.current?.jobId || initialJobId
      dispatch({
        type: 'FAILED',
        jobId: targetJobId,
        message: `${toUserMessage(cause)}${targetJobId ? ' 待启动任务已保留，可重新选择所需文件后重试。' : ''}`,
        recoverable: Boolean(targetJobId),
      })
      await queryClient.invalidateQueries({ queryKey: pdfJobKeys.all })
      return null
    } finally {
      operationRef.current = false
    }
  }

  async function submit(input: SubmissionInput): Promise<void> {
    if (operationRef.current) return
    operationRef.current = true
    let target = recoveryRef.current
    let targetJobId = target?.jobId
    try {
      if (!target) {
        target = await createAndUpload(input)
        targetJobId = target.jobId
      }

      dispatch({ type: 'STARTING', jobId: target.jobId })
      await actions.start.mutateAsync(target.jobId)
      rememberRecovery(null)
      dispatch({ type: 'SUBMITTED', jobId: target.jobId })
      setSelectedJobId(target.jobId)
      onSubmitted?.(target.jobId)
    } catch (cause) {
      dispatch({
        type: 'FAILED',
        jobId: targetJobId,
        message: `${toUserMessage(cause)}${targetJobId ? ' 文件仍保留在私有存储中，可以再次点击生成。' : ''}`,
        recoverable: Boolean(targetJobId),
      })
      await queryClient.invalidateQueries({ queryKey: pdfJobKeys.all })
    } finally {
      operationRef.current = false
    }
  }

  async function cancelRecovery(): Promise<boolean> {
    const target = recoveryRef.current
    if (!target || operationRef.current) {
      dispatch({ type: 'RESET' })
      return !target
    }

    operationRef.current = true
    dispatch({ type: 'CANCELLING', jobId: target.jobId })
    try {
      await actions.cancel.mutateAsync(target.jobId)
      rememberRecovery(null)
      setSelectedJobId(null)
      dispatch({ type: 'RESET' })
      return true
    } catch (cause) {
      dispatch({ type: 'FAILED', jobId: target.jobId, message: toUserMessage(cause), recoverable: true })
      return false
    } finally {
      operationRef.current = false
    }
  }

  return {
    state,
    busy,
    recovery,
    prepare,
    submit,
    cancelRecovery,
    reset: () => dispatch({ type: 'RESET' }),
  }
}
