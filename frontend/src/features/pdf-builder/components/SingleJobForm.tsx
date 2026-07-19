import { useCallback, useEffect, useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { Archive, CheckCircle2, ClipboardPaste, FileText, LoaderCircle, Play, RotateCcw, UploadCloud, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { formatFileSize } from '@/lib/utils'
import { toUserMessage } from '@/lib/errors'
import type { SubmissionRecovery } from '../types'
import { PDF_THEMES } from '../types'
import {
  documentNameFromMarkdown,
  inferMarkdownDocumentName,
  validateAssetsFile,
  validateMarkdownFile,
} from '../lib/files'
import { builderSchema, type BuilderFormValues } from '../schemas/builderSchema'
import { usePdfSubmission } from '../hooks/usePdfSubmission'
import { useGlobalUploadDrop } from '../hooks/useGlobalUploadDrop'
import { getSubmissionLabel, getSubmissionProgress } from '../submissionReducer'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { BuilderFormSection } from './BuilderFormSection'
import { SubmissionStatus } from './SubmissionStatus'

function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => window.requestAnimationFrame(() => resolve()))
}

export function SingleJobForm({ recovery }: { recovery: SubmissionRecovery | null }) {
  const navigate = useNavigate()
  const defaultTheme = useWorkspaceStore((state) => state.theme)
  const [markdownFile, setMarkdownFile] = useState<File | null>(null)
  const [assets, setAssets] = useState<File | null>(null)
  const [fileError, setFileError] = useState('')
  const [nameCustomized, setNameCustomized] = useState(false)
  const [sourceIntent, setSourceIntent] = useState<string | null>(null)
  const submission = usePdfSubmission(recovery, (jobId) => navigate(`/jobs/${jobId}`))

  const form = useForm<BuilderFormValues>({
    resolver: zodResolver(builderSchema),
    defaultValues: {
      documentName: recovery?.documentName || '',
      sourceMode: 'file',
      markdownText: '',
      theme: defaultTheme,
    },
  })

  useEffect(() => {
    if (recovery?.documentName) form.setValue('documentName', recovery.documentName)
  }, [form, recovery?.documentName])

  const uploadedRecovery = submission.recovery?.status === 'uploaded'
  const createdRecovery = submission.recovery?.status === 'created'
  const sourceUnavailable = uploadedRecovery || submission.busy
  const inputDisabled = sourceUnavailable || Boolean(sourceIntent)
  const optionsDisabled = Boolean(submission.recovery) || submission.busy || Boolean(sourceIntent)
  const actionDisabled = submission.busy || Boolean(sourceIntent)
  const sourceMode = form.watch('sourceMode')
  const markdownText = form.watch('markdownText')

  const resolveDocumentName = useCallback((fallback: string) => {
    const current = form.getValues('documentName').trim()
    return nameCustomized && current ? current : fallback
  }, [form, nameCustomized])

  const selectMarkdownFile = useCallback((file: File, selectedAssets = assets) => {
    if (sourceUnavailable) return
    const error = validateMarkdownFile(file)
    if (error) {
      setFileError(error)
      return
    }

    const documentName = resolveDocumentName(documentNameFromMarkdown(file.name))
    setMarkdownFile(file)
    setAssets(selectedAssets)
    setFileError('')
    form.setValue('sourceMode', 'file')
    form.setValue('documentName', documentName, { shouldValidate: true })
    submission.reset()
  }, [assets, form, resolveDocumentName, sourceUnavailable, submission])

  const selectMarkdownText = useCallback(async (text: string) => {
    if (!text.trim() || sourceUnavailable) return

    setMarkdownFile(null)
    setFileError('')
    form.setValue('sourceMode', 'text')
    form.setValue('markdownText', text, { shouldValidate: true })
    setSourceIntent('正在分析 Markdown')
    await yieldToBrowser()

    try {
      const documentName = resolveDocumentName(inferMarkdownDocumentName(text))
      form.setValue('documentName', documentName, { shouldValidate: true })
      submission.reset()
    } finally {
      setSourceIntent(null)
    }
  }, [form, resolveDocumentName, sourceUnavailable, submission])

  const acceptAssets = useCallback((file: File) => {
    const error = validateAssetsFile(file)
    if (error) {
      setFileError(error)
      return
    }
    setAssets(file)
    setFileError('')
  }, [])

  const acceptDroppedFiles = useCallback((file: File | null, droppedAssets: File | null) => {
    if (!file) return
    const selectedAssets = droppedAssets || assets
    if (droppedAssets) setAssets(droppedAssets)
    selectMarkdownFile(file, selectedAssets)
  }, [assets, selectMarkdownFile])

  const globalDrop = useGlobalUploadDrop({
    disabled: inputDisabled,
    onFiles: acceptDroppedFiles,
  })

  const pasteClipboard = async () => {
    try {
      setSourceIntent('正在读取剪切板')
      await yieldToBrowser()
      const text = await navigator.clipboard.readText()
      setSourceIntent(null)
      if (!text.trim()) throw new Error('剪切板中没有可用文本。')
      await selectMarkdownText(text)
    } catch (cause) {
      setSourceIntent(null)
      setFileError(toUserMessage(cause, '无法读取剪切板，请检查浏览器权限。'))
    }
  }

  const submit = form.handleSubmit(async (values) => {
    setFileError('')
    const needsSource = !submission.recovery || submission.recovery.status === 'created'
    if (needsSource && values.sourceMode === 'file' && !markdownFile) {
      setFileError('请选择 Markdown 文件。')
      return
    }
    if (needsSource && values.sourceMode === 'text' && !values.markdownText.trim()) {
      setFileError('请输入或粘贴 Markdown 文本。')
      return
    }

    await submission.submit({
      source: needsSource
        ? values.sourceMode === 'file'
          ? markdownFile ? { kind: 'file', file: markdownFile } : null
          : { kind: 'text', text: values.markdownText, filename: `${values.documentName}.md` }
        : null,
      assets,
      documentName: values.documentName,
      theme: values.theme as typeof defaultTheme,
    })
  })

  const clearLocal = () => {
    setMarkdownFile(null)
    setAssets(null)
    setFileError('')
    setNameCustomized(false)
    setSourceIntent(null)
    submission.reset()
    form.reset({ documentName: '', sourceMode: 'file', markdownText: '', theme: defaultTheme })
  }

  const clearTask = async () => {
    if (submission.recovery) {
      const cancelled = await submission.cancelRecovery()
      if (!cancelled) return
    }
    clearLocal()
  }

  const documentNameField = form.register('documentName')
  const markdownTextField = form.register('markdownText')
  const progress = getSubmissionProgress(submission.state)
  const message = fileError || globalDrop.error || (submission.state.status === 'failed' ? submission.state.message : '')
  const showProgress = Boolean(sourceIntent) || submission.state.status !== 'idle' || Boolean(submission.recovery)
  const recoveryIdle = Boolean(submission.recovery) && submission.state.status === 'idle'
  const progressLabel = sourceIntent
    || (recoveryIdle
      ? createdRecovery ? '等待重新选择源文件' : '源文件已保存，等待生成 PDF'
      : getSubmissionLabel(submission.state))
  const progressValue = sourceIntent ? 4 : recoveryIdle ? createdRecovery ? 5 : 100 : progress
  const hasLocalSource = Boolean(markdownFile) || Boolean(markdownText.trim())

  return (
    <>
      {globalDrop.active && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-foreground/45 p-6 backdrop-blur-sm" role="status" aria-live="polite">
          <div className="rounded-2xl border border-background/50 bg-card p-8 text-center shadow-2xl">
            <span className="mx-auto flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary"><UploadCloud className="size-6" /></span>
            <strong className="mt-4 block text-lg">松开后选择文件</strong>
            <span className="mt-1 block text-sm text-muted-foreground">支持 Markdown 与可选 ZIP 资源包</span>
          </div>
        </div>
      )}

      <Card data-ui-capture="single-job-form" className="shadow-panel">
        <CardContent className="p-4 sm:p-6">
          <form className="space-y-5" onSubmit={submit} noValidate>
            {uploadedRecovery && <Alert><CheckCircle2 className="size-4" /><AlertDescription>Markdown 已保存，点击“生成 PDF”开始构建。</AlertDescription></Alert>}
            {createdRecovery && <Alert variant="warning"><FileText className="size-4" /><AlertDescription>上次任务尚未完成上传，请重新选择 Markdown 后再点击“生成 PDF”。</AlertDescription></Alert>}

            <BuilderFormSection
              title={<FieldLabel htmlFor="document-name">文件命名</FieldLabel>}
              description="默认读取 Markdown 文件名或首个一级标题。"
            >
              <Field data-invalid={Boolean(form.formState.errors.documentName)}>
                <Input
                  id="document-name"
                  placeholder="自动使用文件名或 Markdown 标题"
                  autoComplete="off"
                  disabled={optionsDisabled}
                  aria-invalid={Boolean(form.formState.errors.documentName)}
                  {...documentNameField}
                  onChange={(event) => {
                    setNameCustomized(true)
                    void documentNameField.onChange(event)
                  }}
                />
                <FieldError>{form.formState.errors.documentName?.message}</FieldError>
              </Field>
            </BuilderFormSection>

            <BuilderFormSection
              title="文档内容"
              description="选择文件或粘贴文本，内容会在提交前保留在本地。"
              actions={(
                <div className="grid gap-2">
                  <Button type="button" size="sm" variant={sourceMode === 'file' ? 'secondary' : 'outline'} disabled={inputDisabled} onClick={() => form.setValue('sourceMode', 'file')}><FileText />上传文件</Button>
                  <Button type="button" size="sm" variant={sourceMode === 'text' ? 'secondary' : 'outline'} disabled={inputDisabled} onClick={() => form.setValue('sourceMode', 'text')}><FileText />粘贴文本</Button>
                  <Button type="button" size="sm" variant="outline" disabled={inputDisabled} onClick={() => void pasteClipboard()}><ClipboardPaste />粘贴剪切板</Button>
                </div>
              )}
            >
              {sourceMode === 'file' ? (
                <label className="group flex min-h-40 cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed bg-muted/15 p-5 text-center transition-colors hover:border-primary/50 hover:bg-accent/40 focus-within:ring-2 focus-within:ring-ring">
                  <input data-ui-capture="markdown-file-input" className="sr-only" type="file" accept=".md,text/markdown,text/plain" disabled={inputDisabled} onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; if (file) selectMarkdownFile(file) }} />
                  <span className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary"><FileText className="size-5" /></span>
                  <strong className="mt-3 max-w-full break-all">{markdownFile?.name || (uploadedRecovery ? submission.recovery?.sourceFilename || 'Markdown 已上传' : createdRecovery ? '重新选择 Markdown' : '选择或拖入 Markdown')}</strong>
                  <span className="mt-1 text-xs text-muted-foreground">{markdownFile ? `${formatFileSize(markdownFile.size)} · 点击生成后上传` : '最大 10 MiB'}</span>
                </label>
              ) : (
                <Field data-invalid={Boolean(form.formState.errors.markdownText)}>
                  <Textarea
                    id="markdown-text"
                    placeholder="# 标题"
                    className="min-h-56 resize-y bg-muted/10 font-mono text-sm leading-6"
                    disabled={inputDisabled}
                    aria-invalid={Boolean(form.formState.errors.markdownText)}
                    {...markdownTextField}
                    onBlur={(event) => {
                      void markdownTextField.onBlur(event)
                      if (event.currentTarget.value.trim()) void selectMarkdownText(event.currentTarget.value)
                    }}
                    onPaste={(event) => {
                      const pasted = event.clipboardData.getData('text')
                      if (!pasted) return
                      event.preventDefault()
                      const current = event.currentTarget.value
                      const start = event.currentTarget.selectionStart || 0
                      const end = event.currentTarget.selectionEnd || 0
                      const next = `${current.slice(0, start)}${pasted}${current.slice(end)}`
                      form.setValue('markdownText', next, { shouldValidate: true })
                      void selectMarkdownText(next)
                    }}
                  />
                  <FieldError>{form.formState.errors.markdownText?.message}</FieldError>
                </Field>
              )}
            </BuilderFormSection>

            <BuilderFormSection
              title="构建选项"
              description="资源包可包含 Markdown 引用的本地图片与附件。"
              divided
            >
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_220px]">
                <div className="flex min-h-11 items-center rounded-lg border bg-muted/10">
                  <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 px-3 py-2">
                    <input className="sr-only" type="file" accept=".zip,application/zip" disabled={inputDisabled} onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; if (file) acceptAssets(file) }} />
                    <Archive className="size-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 truncate text-sm">{assets?.name || (createdRecovery && submission.recovery?.hasAssets ? '重新选择 ZIP 资源包' : '可选 ZIP 资源包')}</span>
                  </label>
                  {assets && !inputDisabled && <Button type="button" variant="ghost" size="icon" onClick={() => setAssets(null)} aria-label="移除 ZIP 资源包"><X /></Button>}
                </div>
                <Select aria-label="PDF 主题" disabled={optionsDisabled} {...form.register('theme')}>
                  {PDF_THEMES.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </Select>
              </div>
            </BuilderFormSection>

            {message && <Alert variant="destructive"><AlertDescription>{message}</AlertDescription></Alert>}
            <SubmissionStatus
              visible={showProgress}
              busy={Boolean(sourceIntent) || submission.busy}
              label={progressLabel}
              value={progressValue}
            />

            <div className="flex flex-col-reverse gap-3 border-t pt-5 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" disabled={actionDisabled} onClick={() => void clearTask()}><RotateCcw />{submission.recovery ? '清除任务' : '清空'}</Button>
              <Button type="submit" disabled={actionDisabled || (!submission.recovery && !hasLocalSource)}>
                {submission.busy ? <LoaderCircle className="animate-spin" /> : <Play />}
                生成 PDF
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </>
  )
}
