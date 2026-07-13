import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { Bell, Download, Palette } from 'lucide-react'
import { toast } from 'sonner'
import { PageContainer } from '@/components/layout/PageContainer'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Select } from '@/components/ui/select'
import { PDF_THEMES } from '@/features/pdf-builder/types'
import { settingsSchema, type SettingsFormValues } from '@/features/pdf-builder/schemas/settingsSchema'
import { useWorkspaceStore } from '@/stores/workspaceStore'

export function SettingsPage() {
  const store = useWorkspaceStore()
  const form = useForm<SettingsFormValues>({ resolver: zodResolver(settingsSchema), defaultValues: { theme: store.theme, autoDownload: store.autoDownload, notifyOnComplete: store.notifyOnComplete } })
  const submit = form.handleSubmit(async (values) => {
    let notifications = values.notifyOnComplete
    if (notifications && 'Notification' in window && Notification.permission === 'default') {
      notifications = (await Notification.requestPermission()) === 'granted'
      if (!notifications) toast.warning('浏览器通知未获授权，已保留手动查看与下载功能。')
    }
    if (notifications && !('Notification' in window)) {
      notifications = false
      toast.warning('当前浏览器不支持通知。')
    }
    store.setTheme(values.theme as typeof store.theme)
    store.setAutoDownload(values.autoDownload)
    store.setNotifyOnComplete(notifications)
    form.setValue('notifyOnComplete', notifications)
    toast.success('设置已保存。')
  })

  return <PageContainer className="max-w-4xl space-y-6"><div><h1 className="text-2xl font-semibold tracking-tight">设置</h1><p className="mt-1 text-sm text-muted-foreground">这些偏好通过 Zustand persist 保存，不会序列化 Markdown 或 ZIP 文件。</p></div><Card><CardHeader><CardTitle>构建与交付偏好</CardTitle><CardDescription>新任务默认使用这些设置，单次任务仍可在工作台中调整。</CardDescription></CardHeader><CardContent><form className="space-y-6" onSubmit={submit}><div className="grid gap-2"><label className="flex items-center gap-2 text-sm font-medium" htmlFor="settings-theme"><Palette className="h-4 w-4" />默认 PDF 主题</label><Select id="settings-theme" {...form.register('theme')}>{PDF_THEMES.map((theme) => <option value={theme.id} key={theme.id}>{theme.name} — {theme.description}</option>)}</Select></div><div className="grid gap-4 rounded-lg border p-4"><label className="flex items-start gap-3"><Checkbox {...form.register('autoDownload')} /><span><strong className="flex items-center gap-2 text-sm"><Download className="h-4 w-4" />自动下载</strong><small className="mt-1 block text-muted-foreground">任务完成后尝试自动下载；失败时仍保留手动按钮。</small></span></label><label className="flex items-start gap-3"><Checkbox {...form.register('notifyOnComplete')} /><span><strong className="flex items-center gap-2 text-sm"><Bell className="h-4 w-4" />浏览器通知</strong><small className="mt-1 block text-muted-foreground">仅在浏览器授权后发送完成通知。</small></span></label></div><Alert><AlertDescription>页面刷新后可从服务端恢复任务 ID、任务详情和构建状态，但无法恢复用户尚未完成上传的本地 File 对象。</AlertDescription></Alert><Button type="submit">保存设置</Button></form></CardContent></Card></PageContainer>
}
