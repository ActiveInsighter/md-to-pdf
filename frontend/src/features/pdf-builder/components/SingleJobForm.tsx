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
import { Progress } from '@/components/ui/progress'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { formatFileSize } from '@/lib/utils'
import { toUserMessage } from '@/lib/errors'
import type { MarkdownSource, SubmissionRecovery } from '../types'
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

export function SingleJobForm({ recovery }: { recovery: SubmissionRecovery | null }) {
  const navigate = useNavigate()
  const defaultTheme = useWorkspaceStore((state) => state.theme)
  const [markdownFile, setMarkdownFile] = useState<File | null>(null)
  const [assets, setAssets] = useState<File | null>(null)
  const [fileError, setFileError] = useState('')
  const [nameCustomized, setNameCustomized] = useState(false)
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

  const sourceLocked = Boolean(submission.recovery) || submission.busy
  const sourceMode = form.watch('sourceMode')
  const markdownText = form.watch('markdownText')

  const resolveDocumentName = useCallback((fallback: string) => {
    const current = form.getValues('documentName').trim()
    return nameCustomized && current ? current : fallback
  }, [form, nameCustomized])

  const prepareSource = useCallback(async ({
    source,
    documentName,
    selectedAssets,
  }: {
    source: MarkdownSource
    documentName: string
    selectedAssets: File | null
  }) => {
    setFileError('')
    form.setValue('documentName', documentName, { shouldValidate: true })
    await submission.prepare({
      source,
      assets: selectedAssets,
      documentName,
      theme: form.getValues('theme') as typeof defaultTheme,
    })
  }, [defaultTheme, form, submission])

  const prepareMarkdownFile = useCallback(async (file: File, selectedAssets = assets) => {
    const error = validateMarkdownFile(file)
    if (error) {
      setFileError(error)
      return
    }

    const documentName = resolveDocumentName(documentNameFromMarkdown(file.name))
    setMarkdownFile(file)
    setAssets(selectedAssets)
    form.setValue('sourceMode', 'file')
    await prepareSource({ source: { kind: 'file', file }, documentName, selectedAssets })
  }, [assets, form, prepareSource, resolveDocumentName])

  const prepareMarkdownText = useCallback(async (text: string) => {
    if (!text.trim() || sourceLocked) return
    const documentName = resolveDocumentName(inferMarkdownDocumentName(text))
    setMarkdownFile(null)
    form.setValue('sourceMode', 'text')
    form.setValue('markdownText', text, { shouldValidate: true })
    await prepareSource({
      source: { kind: 'text', text, filename: `${documentName}.md` },
      documentName,
      selectedAssets: assets,
    })
  }, [assets, form, prepareSource, resolveDocumentName, sourceLocked])

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
    void prepareMarkdownFile(file, selectedAssets)
  }, [assets, prepareMarkdownFile])

  const globalDrop = useGlobalUploadDrop({
    disabled: sourceLocked,
    onFiles: acceptDroppedFiles,
  })

  const pasteClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText()
      if (!text.trim()) throw new Error('剪切板中没有可用文本。')
      await prepareMarkdownText(text)
    } catch (cause) {
      setFileError(toUserMessage(cause, '无法读取剪切板，请检查浏览器权限。'))
    }
  }

  const submit = form.handleSubmit(async (values) => {
    setFileError('')
    if (!submission.recovery && values.sourceMode === 'file' && !markdownFile) {
      setFileError('请选择 Markdown 文件。')
      return
    }

    await submission.submit({
      source: submission.recovery
        ? null
        : values.sourceMode === 'file'
          ? markdownFile ? { kind: 'file', file: markdownFile } : null
          : { kind: 'text', text: values.markdownText, filename: `${values.documentName}.md` },
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
  const prepared = Boolean(submission.recovery) && !submission.busy

  return (
    <>
      {globalDrop.active && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-foreground/45 p-6 backdrop-blur-sm" role="status" aria-live="polite">
          <div className="rounded-2xl border border-background/50 bg-card p-8 text-center shadow-2xl">
            <UploadCloud className="mx-auto size-8 text-primary" />
            <strong className="mt-3 block">松开后上传</strong>
          </div>
        </div>
      )}

      <Card>
        <CardContent className="p-4 sm:p-6">
          <form className="space-y-5" onSubmit={submit} noValidate>
            {prepared && <Alert><CheckCircle2 className="size-4" /><AlertDescription>Markdown 已保存，点击“生成 PDF”开始构建。</AlertDescription></Alert>}

            <div className="grid gap-3 lg:grid-cols-[180px_minmax(0,1fr)] lg:items-start">
              <div className="pt-2"><FieldLabel htmlFor="document-name">文件命名</FieldLabel></div>
              <Field data-invalid={Boolean(form.formState.errors.documentName)}>
                <Input
                  id="document-name"
                  placeholder="自动使用文件名或 Markdown 标题"
                  autoComplete="off"
                  disabled={sourceLocked}
                  aria-invalid={Boolean(form.formState.errors.documentName)}
                  {...documentNameField}
                  onChange={(event) => {
                    setNameCustomized(true)
                    void documentNameField.onChange(event)
                  }}
                />
                <FieldError>{form.formState.errors.documentName?.message}</FieldError>
              </Field>
            </div>

            <div className="grid gap-3 lg:grid-cols-[180px_minmax(0,1fr)] lg:items-start">
              <div className="grid gap-2">
                <span className="text-sm font-semibold">文档内容</span>
                <Button type="button" size="sm" variant={sourceMode === 'file' ? 'secondary' : 'outline'} disabled={sourceLocked} onClick={() => form.setValue('sourceMode', 'file')}><FileText />上传文件</Button>
                <Button type="button" size="sm" variant={sourceMode === 'text' ? 'secondary' : 'outline'} disabled={sourceLocked} onClick={() => form.setValue('sourceMode', 'text')}><FileText />粘贴文本</Button>
                <Button type="button" size="sm" variant="outline" disabled={sourceLocked} onClick={() => void pasteClipboard()}><ClipboardPaste />粘贴剪切板</Button>
              </div>

              {sourceMode === 'file' ? (
                <label className="group flex min-h-36 cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed bg-muted/15 p-5 text-center transition-colors hover:border-primary/50 hover:bg-accent/40 focus-within:ring-2 focus-within:ring-ring">
                  <input className="sr-only" type="file" accept=".md,text/markdown,text/plain" disabled={sourceLocked} onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void prepareMarkdownFile(file) }} />
                  <FileText className="size-7 text-primary" />
                  <strong className="mt-3 max-w-full break-all">{markdownFile?.name || (prepared ? submission.recovery?.sourceFilename || 'Markdown 已上传' : '选择或拖入 Markdown')}</strong>
                  <span className="mt-1 text-xs text-muted-foreground">{markdownFile ? formatFileSize(markdownFile.size) : '最大 10 MiB'}</span>
                </label>
              ) : (
                <Field data-invalid={Boolean(form.formState.errors.markdownText)}>
                  <Textarea
                    id="markdown-text"
                    placeholder="# 标题"
                    className="min-h-52 resize-y font-mono text-sm leading-6"
                    disabled={sourceLocked}
                    aria-invalid={Boolean(form.formState.errors.markdownText)}
                    {...markdownTextField}
                    onBlur={(event) => {
                      void markdownTextField.onBlur(event)
                      if (event.currentTarget.value.trim()) void prepareMarkdownText(event.currentTarget.value)
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
                      void prepareMarkdownText(next)
                    }}
                  />
                  <FieldError>{form.formState.errors.markdownText?.message}</FieldError>
                </Field>
              )}
            </div>

            <div className="grid gap-3 border-t pt-5 lg:grid-cols-[180px_minmax(0,1fr)] lg:items-start">
              <div className="pt-2"><span className="text-sm font-semibold">构建选项</span></div>
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_220px]">
                <div className="flex min-h-11 items-center rounded-lg border bg-muted/10">
                  <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 px-3 py-2">
                    <input className="sr-only" type="file" accept=".zip,application/zip" disabled={sourceLocked} onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; if (file) acceptAssets(file) }} />
                    <Archive className="size-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 truncate text-sm">{assets?.name || '可选 ZIP 资源包'}</span>
                  </label>
                  {assets && !sourceLocked && <Button type="button" variant="ghost" size="icon" onClick={() => setAssets(null)} aria-label="移除 ZIP 资源包"><X /></Button>}
                </div>
                <Select aria-label="PDF 主题" disabled={sourceLocked} {...form.register('theme')}>
                  {PDF_THEMES.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </Select>
              </div>
            </div>

            {message && <Alert variant="destructive"><AlertDescription>{message}</AlertDescription></Alert>}
            {(submission.state.status !== 'idle' || submission.recovery) && (
              <div className="space-y-2" aria-live="polite">
                <div className="flex items-center justify-between gap-4 text-xs text-muted-foreground"><span>{submission.recovery && submission.state.status === 'idle' ? '源文件已保存' : getSubmissionLabel(submission.state)}</span><strong className="tabular-nums text-foreground">{submission.recovery && submission.state.status === 'idle' ? 100 : progress}%</strong></div>
                <Progress value={submission.recovery && submission.state.status === 'idle' ? 100 : progress} aria-label="源文件准备进度" />
              </div>
            )}

            <div className="flex flex-col-reverse gap-3 border-t pt-5 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" disabled={submission.busy} onClick={() => void clearTask()}><RotateCcw />{submission.recovery ? '清除上传' : '清空'}</Button>
              <Button type="submit" disabled={submission.busy || (!submission.recovery && !markdownFile && !markdownText.trim())}>
                {submission.state.status === 'starting' ? <LoaderCircle className="animate-spin" /> : <Play />}
                生成 PDF
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </>
  )
}
