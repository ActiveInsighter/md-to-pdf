import { useCallback, useEffect, useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { Controller, useForm } from 'react-hook-form'
import { Archive, Bell, CheckCircle2, ClipboardPaste, FileText, LoaderCircle, Play, RotateCcw, UploadCloud, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { Select } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
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
  const theme = useWorkspaceStore((state) => state.theme)
  const autoDownload = useWorkspaceStore((state) => state.autoDownload)
  const notifyOnComplete = useWorkspaceStore((state) => state.notifyOnComplete)
  const setTheme = useWorkspaceStore((state) => state.setTheme)
  const setAutoDownload = useWorkspaceStore((state) => state.setAutoDownload)
  const setNotifyOnComplete = useWorkspaceStore((state) => state.setNotifyOnComplete)
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
      theme,
      autoDownload,
      notifyOnComplete,
    },
  })

  useEffect(() => {
    if (recovery?.documentName) form.setValue('documentName', recovery.documentName)
  }, [form, recovery?.documentName])

  const sourceLocked = Boolean(submission.recovery) || submission.busy

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
      theme: form.getValues('theme') as typeof theme,
    })
  }, [form, submission, theme])

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

    let notificationsEnabled = values.notifyOnComplete
    if (notificationsEnabled) {
      if (!('Notification' in window)) {
        notificationsEnabled = false
        toast.warning('当前浏览器不支持通知，构建完成后仍可手动查看和下载。')
      } else if (Notification.permission === 'default') {
        notificationsEnabled = (await Notification.requestPermission()) === 'granted'
        if (!notificationsEnabled) toast.warning('浏览器通知未获授权，已关闭本次通知选项。')
      } else if (Notification.permission === 'denied') {
        notificationsEnabled = false
        toast.warning('浏览器已拒绝通知权限，请在浏览器设置中重新授权。')
      }
    }

    setTheme(values.theme as typeof theme)
    setAutoDownload(values.autoDownload)
    setNotifyOnComplete(notificationsEnabled)
    form.setValue('notifyOnComplete', notificationsEnabled)

    await submission.submit({
      source: submission.recovery
        ? null
        : values.sourceMode === 'file'
          ? markdownFile ? { kind: 'file', file: markdownFile } : null
          : { kind: 'text', text: values.markdownText, filename: `${values.documentName}.md` },
      assets,
      documentName: values.documentName,
      theme: values.theme as typeof theme,
    })
  })

  const clearLocal = () => {
    setMarkdownFile(null)
    setAssets(null)
    setFileError('')
    setNameCustomized(false)
    submission.reset()
    form.reset({ documentName: '', sourceMode: 'file', markdownText: '', theme, autoDownload, notifyOnComplete })
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
  const markdownText = form.watch('markdownText')
  const progress = getSubmissionProgress(submission.state)
  const message = fileError || globalDrop.error || (submission.state.status === 'failed' ? submission.state.message : '')
  const prepared = Boolean(submission.recovery) && !submission.busy

  return (
    <>
      {globalDrop.active && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-foreground/45 p-6 backdrop-blur-sm" role="status" aria-live="polite">
          <div className="rounded-2xl border border-background/50 bg-card p-8 text-center shadow-2xl sm:p-10">
            <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-accent text-primary"><UploadCloud className="size-7" /></span>
            <strong className="mt-4 block text-lg">松开后立即上传</strong>
            <p className="mt-1 text-sm text-muted-foreground">支持一个 Markdown 和一个可选 ZIP；不会自动开始构建</p>
          </div>
        </div>
      )}

      <Card className="overflow-hidden">
        <CardHeader className="border-b bg-muted/20">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle>创建 PDF</CardTitle>
              <CardDescription className="mt-1">先自动上传私有源文件，确认后再点击按钮启动构建。</CardDescription>
            </div>
            <Button type="button" variant="outline" onClick={() => void pasteClipboard()} disabled={sourceLocked}>
              <ClipboardPaste />粘贴剪切板并上传
            </Button>
          </div>
        </CardHeader>

        <CardContent className="pt-5 sm:pt-6">
          <form className="space-y-7" onSubmit={submit} noValidate>
            {submission.recovery && (
              <Alert>
                <CheckCircle2 className="size-4" />
                <AlertTitle>源文件已经准备好</AlertTitle>
                <AlertDescription>文件已保存在私有存储中，尚未开始构建。点击“生成 PDF”后才会进入 GitHub Actions 队列。</AlertDescription>
              </Alert>
            )}

            <div className="grid gap-5 lg:grid-cols-2">
              <Field>
                <FieldLabel>文档资源 <span className="font-normal text-muted-foreground">可选</span></FieldLabel>
                <div className="flex min-h-28 items-stretch rounded-xl border border-dashed bg-muted/20 transition-colors focus-within:border-primary focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 hover:border-primary/40 hover:bg-accent/40">
                  <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-4 p-4">
                    <input className="sr-only" type="file" accept=".zip,application/zip" disabled={sourceLocked} aria-describedby="assets-file-help" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; if (file) acceptAssets(file) }} />
                    <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-secondary"><Archive className="size-5" /></span>
                    <span className="min-w-0"><strong className="block break-all">{assets?.name || '选择 ZIP 资源包'}</strong><small id="assets-file-help" className="text-muted-foreground">{assets ? formatFileSize(assets.size) : '请在选择 Markdown 前添加，最大 50 MiB'}</small></span>
                  </label>
                  {assets && !sourceLocked && <Button type="button" variant="ghost" size="icon" className="mr-2 self-center" onClick={() => setAssets(null)} aria-label="移除 ZIP 资源包"><X /></Button>}
                </div>
              </Field>

              <Field>
                <FieldLabel htmlFor="pdf-theme">PDF 主题</FieldLabel>
                <Select id="pdf-theme" disabled={sourceLocked} {...form.register('theme')}>{PDF_THEMES.map((item) => <option key={item.id} value={item.id}>{item.name} — {item.description}</option>)}</Select>
                <FieldDescription>主题会在源文件上传时固定；需要更改时先清空当前待启动任务。</FieldDescription>
              </Field>
            </div>

            <Field data-invalid={Boolean(form.formState.errors.documentName)}>
              <FieldLabel htmlFor="document-name">输出名称</FieldLabel>
              <Input
                id="document-name"
                placeholder="自动使用 Markdown 文件名或首个最高级标题"
                autoComplete="off"
                disabled={sourceLocked}
                aria-invalid={Boolean(form.formState.errors.documentName)}
                aria-describedby="document-name-description document-name-error"
                {...documentNameField}
                onChange={(event) => {
                  setNameCustomized(true)
                  void documentNameField.onChange(event)
                }}
              />
              <FieldDescription id="document-name-description">留空时自动命名；也可以在选择内容前自定义。</FieldDescription>
              <FieldError id="document-name-error">{form.formState.errors.documentName?.message}</FieldError>
            </Field>

            <Controller control={form.control} name="sourceMode" render={({ field }) => (
              <Tabs value={field.value} onValueChange={(value) => field.onChange(value as BuilderFormValues['sourceMode'])}>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                  <div><h3 className="text-sm font-semibold">文档内容</h3><p className="mt-1 text-sm text-muted-foreground">选择或粘贴后立即上传，但不会自动构建。</p></div>
                  <TabsList className="grid w-full grid-cols-2 sm:w-80">
                    <TabsTrigger value="file" disabled={sourceLocked}>上传文件</TabsTrigger>
                    <TabsTrigger value="text" disabled={sourceLocked}>粘贴文本</TabsTrigger>
                  </TabsList>
                </div>

                <TabsContent value="file">
                  <label className="group flex min-h-48 cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed bg-muted/20 p-6 text-center transition-colors hover:border-primary/50 hover:bg-accent/50 focus-within:border-primary focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
                    <input className="sr-only" type="file" accept=".md,text/markdown,text/plain" disabled={sourceLocked} aria-describedby="markdown-file-help" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void prepareMarkdownFile(file) }} />
                    <span className="flex size-12 items-center justify-center rounded-xl bg-accent text-primary transition-transform group-hover:-translate-y-0.5"><FileText className="size-6" /></span>
                    <strong className="mt-4 max-w-full break-all">{markdownFile ? markdownFile.name : prepared ? submission.recovery?.sourceFilename || 'Markdown 已上传' : '选择或拖入 Markdown 文件'}</strong>
                    <span id="markdown-file-help" className="mt-1 text-sm text-muted-foreground">{markdownFile ? formatFileSize(markdownFile.size) : prepared ? '已安全上传，等待生成' : '仅支持 .md，最大 10 MiB'}</span>
                  </label>
                </TabsContent>

                <TabsContent value="text">
                  <Field data-invalid={Boolean(form.formState.errors.markdownText)}>
                    <FieldLabel className="sr-only" htmlFor="markdown-text">Markdown 内容</FieldLabel>
                    <Textarea
                      id="markdown-text"
                      placeholder="# 标题\n\n直接粘贴后会自动上传……"
                      className="min-h-72 resize-y font-mono text-sm leading-6"
                      disabled={sourceLocked}
                      aria-invalid={Boolean(form.formState.errors.markdownText)}
                      aria-describedby="markdown-text-error"
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
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <FieldError id="markdown-text-error">{form.formState.errors.markdownText?.message}</FieldError>
                      <span className="text-xs text-muted-foreground">键盘粘贴、剪切板按钮或输入完成后移开焦点都会自动上传。</span>
                    </div>
                  </Field>
                </TabsContent>
              </Tabs>
            )} />

            <fieldset className="grid gap-3 rounded-xl border bg-muted/20 p-4 sm:grid-cols-2">
              <legend className="px-1 text-sm font-semibold">完成后的操作</legend>
              <label className="flex cursor-pointer items-start gap-3 rounded-lg p-2 hover:bg-card"><Checkbox {...form.register('autoDownload')} /><span><strong className="block text-sm">自动下载</strong><small className="text-muted-foreground">此设备首次交付时下载 PDF</small></span></label>
              <label className="flex cursor-pointer items-start gap-3 rounded-lg p-2 hover:bg-card"><Checkbox {...form.register('notifyOnComplete')} /><Bell className="mt-0.5 size-4 shrink-0 text-muted-foreground" /><span><strong className="block text-sm">浏览器通知</strong><small className="text-muted-foreground">任务完成时发出本地提醒</small></span></label>
            </fieldset>

            {message && <Alert variant="destructive"><AlertDescription>{message}</AlertDescription></Alert>}
            {(submission.state.status !== 'idle' || submission.recovery) && (
              <div className="space-y-3 rounded-xl border bg-muted/20 p-4" aria-live="polite">
                <div className="flex items-center justify-between gap-4 text-sm"><span>{submission.recovery && submission.state.status === 'idle' ? '文件已上传，等待生成 PDF' : getSubmissionLabel(submission.state)}</span><strong className="tabular-nums">{submission.recovery && submission.state.status === 'idle' ? 100 : progress}%</strong></div>
                <Progress value={submission.recovery && submission.state.status === 'idle' ? 100 : progress} aria-label="源文件准备进度" />
              </div>
            )}

            <div className="flex flex-col-reverse gap-3 border-t pt-6 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" disabled={submission.busy} onClick={() => void clearTask()}><RotateCcw />{submission.recovery ? '清除已上传文件' : '清空'}</Button>
              <Button type="submit" size="lg" disabled={submission.busy || (!submission.recovery && !markdownFile && !markdownText.trim())}>
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
