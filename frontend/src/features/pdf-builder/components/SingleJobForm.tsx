import { useCallback, useEffect, useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { Controller, useForm } from 'react-hook-form'
import { Archive, Bell, ClipboardPaste, FileText, LoaderCircle, RotateCcw, UploadCloud, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { Select } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { formatFileSize } from '@/lib/utils'
import { toUserMessage } from '@/lib/errors'
import type { SubmissionRecovery } from '../types'
import { PDF_THEMES } from '../types'
import { documentNameFromMarkdown, validateAssetsFile, validateMarkdownFile } from '../lib/files'
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

  const acceptMarkdown = useCallback((file: File) => {
    const error = validateMarkdownFile(file)
    if (error) return setFileError(error)
    setMarkdownFile(file)
    setFileError('')
    form.setValue('sourceMode', 'file')
    form.setValue('documentName', documentNameFromMarkdown(file.name), { shouldValidate: true })
  }, [form])

  const acceptAssets = useCallback((file: File) => {
    const error = validateAssetsFile(file)
    if (error) return setFileError(error)
    setAssets(file)
    setFileError('')
  }, [])

  const globalDrop = useGlobalUploadDrop({ disabled: submission.busy, onMarkdown: acceptMarkdown, onAssets: acceptAssets })
  const sourceMode = form.watch('sourceMode')

  const submit = form.handleSubmit(async (values) => {
    setFileError('')
    if (values.sourceMode === 'file' && !markdownFile && submission.recovery?.status !== 'uploaded') {
      setFileError('请选择 Markdown 文件。')
      return
    }
    setTheme(values.theme as typeof theme)
    setAutoDownload(values.autoDownload)
    setNotifyOnComplete(values.notifyOnComplete)
    await submission.submit({
      source: values.sourceMode === 'file'
        ? markdownFile ? { kind: 'file', file: markdownFile } : null
        : { kind: 'text', text: values.markdownText, filename: `${values.documentName}.md` },
      assets,
      documentName: values.documentName,
      theme: values.theme as typeof theme,
    })
  })

  const pasteClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText()
      if (!text.trim()) throw new Error('剪切板中没有可用文本。')
      form.setValue('sourceMode', 'text')
      form.setValue('markdownText', text, { shouldValidate: true })
      if (!form.getValues('documentName')) form.setValue('documentName', '粘贴的 Markdown')
    } catch (cause) {
      setFileError(toUserMessage(cause, '无法读取剪切板，请检查浏览器权限。'))
    }
  }

  const resetLocal = () => {
    setMarkdownFile(null)
    setAssets(null)
    setFileError('')
    submission.reset()
    form.reset({ documentName: '', sourceMode: 'file', markdownText: '', theme, autoDownload, notifyOnComplete })
  }

  const progress = getSubmissionProgress(submission.state)
  const message = fileError || globalDrop.error || (submission.state.status === 'failed' ? submission.state.message : '')

  return (
    <>
      {globalDrop.active && <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/45 p-6 backdrop-blur-sm"><div className="rounded-xl border border-white/40 bg-white p-8 text-center shadow-2xl"><UploadCloud className="mx-auto h-10 w-10 text-primary" /><strong className="mt-3 block text-lg">松开即可添加文件</strong><p className="mt-1 text-sm text-muted-foreground">支持一个 Markdown 和一个可选 ZIP 资源包</p></div></div>}
      <Card>
        <CardHeader><CardTitle>创建 PDF 任务</CardTitle><CardDescription>上传文件或粘贴文本，文件名、任务名和输出 PDF 名称保持一致。</CardDescription></CardHeader>
        <CardContent>
          <form className="space-y-6" onSubmit={submit}>
            {submission.recovery && <Alert variant="warning"><AlertTitle>发现未完成任务</AlertTitle><AlertDescription>{submission.recovery.status === 'uploaded' ? '源文件已经上传，可以直接继续启动构建。' : '页面刷新不会恢复本地 File 对象，请重新选择原 Markdown 和所需 ZIP 后继续。'}</AlertDescription></Alert>}
            <div className="space-y-2"><label className="text-sm font-medium" htmlFor="document-name">文档名称</label><Input id="document-name" placeholder="例如：操作系统第 5 章" disabled={submission.busy || Boolean(submission.recovery)} {...form.register('documentName')} />{form.formState.errors.documentName && <p className="text-sm text-red-600">{form.formState.errors.documentName.message}</p>}</div>

            <Controller control={form.control} name="sourceMode" render={({ field }) => <Tabs value={field.value} onValueChange={(value) => field.onChange(value as BuilderFormValues['sourceMode'])}>
              <TabsList className="grid w-full grid-cols-2 sm:w-80"><TabsTrigger value="file">上传文件</TabsTrigger><TabsTrigger value="text">粘贴文本</TabsTrigger></TabsList>
              <TabsContent value="file">
                <label className="flex min-h-40 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50/70 p-6 text-center transition hover:border-primary/50 hover:bg-primary/[0.03]">
                  <input className="sr-only" type="file" accept=".md,text/markdown,text/plain" disabled={submission.busy} onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; if (file) acceptMarkdown(file) }} />
                  <FileText className="h-8 w-8 text-primary" /><strong className="mt-3">{markdownFile ? markdownFile.name : '选择或拖入 Markdown 文件'}</strong><span className="mt-1 text-sm text-muted-foreground">{markdownFile ? formatFileSize(markdownFile.size) : '最大 10 MiB，仅支持 .md'}</span>
                </label>
              </TabsContent>
              <TabsContent value="text" className="space-y-3">
                <Textarea placeholder="# 标题\n\n在此粘贴 Markdown 内容……" className="min-h-64 font-mono text-sm" disabled={submission.busy} {...form.register('markdownText')} />
                <Button type="button" variant="outline" onClick={() => void pasteClipboard()} disabled={submission.busy}><ClipboardPaste className="h-4 w-4" />粘贴剪切板</Button>
                {form.formState.errors.markdownText && <p className="text-sm text-red-600">{form.formState.errors.markdownText.message}</p>}
              </TabsContent>
            </Tabs>}/>

            <div className="grid gap-4 lg:grid-cols-2">
              <label className="flex min-h-28 cursor-pointer items-center gap-4 rounded-lg border border-dashed p-4 hover:bg-muted/40">
                <input className="sr-only" type="file" accept=".zip,application/zip" disabled={submission.busy} onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; if (file) acceptAssets(file) }} />
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-secondary"><Archive className="h-5 w-5" /></span>
                <span className="min-w-0"><strong className="block break-all">{assets?.name || '上传 ZIP 资源包'}</strong><small className="text-muted-foreground">{assets ? formatFileSize(assets.size) : '可选，最大 50 MiB'}</small></span>
                {assets && <Button type="button" variant="ghost" size="icon" className="ml-auto shrink-0" onClick={(event) => { event.preventDefault(); setAssets(null) }}><X className="h-4 w-4" /></Button>}
              </label>
              <div className="space-y-2"><label className="text-sm font-medium" htmlFor="pdf-theme">PDF 主题</label><Select id="pdf-theme" disabled={submission.busy} {...form.register('theme')}>{PDF_THEMES.map((item) => <option key={item.id} value={item.id}>{item.name} — {item.description}</option>)}</Select></div>
            </div>

            <div className="grid gap-3 rounded-lg border bg-muted/25 p-4 sm:grid-cols-2">
              <label className="flex items-center gap-3 text-sm"><Checkbox {...form.register('autoDownload')} />构建完成后自动下载</label>
              <label className="flex items-center gap-3 text-sm"><Checkbox {...form.register('notifyOnComplete')} /><Bell className="h-4 w-4 text-muted-foreground" />浏览器通知</label>
            </div>

            {message && <Alert variant="destructive"><AlertDescription>{message}</AlertDescription></Alert>}
            {submission.state.status !== 'idle' && <div className="space-y-2 rounded-lg border p-4"><div className="flex items-center justify-between text-sm"><span>{getSubmissionLabel(submission.state)}</span><strong>{progress}%</strong></div><Progress value={progress} /></div>}

            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" disabled={submission.busy} onClick={() => submission.recovery ? void submission.cancelRecovery() : resetLocal()}><RotateCcw className="h-4 w-4" />{submission.recovery ? '取消恢复任务' : '清空'}</Button>
              <Button type="submit" size="lg" disabled={submission.busy}>{submission.busy && <LoaderCircle className="h-4 w-4 animate-spin" />}{submission.recovery?.status === 'uploaded' ? '继续启动构建' : '生成 PDF'}</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </>
  )
}
