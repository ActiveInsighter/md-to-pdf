import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { Bell, Download, Palette } from 'lucide-react'
import { toast } from 'sonner'
import { PageContainer } from '@/components/layout/PageContainer'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field'
import { Select } from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'
import { PDF_THEMES } from '@/features/pdf-builder/types'
import { settingsSchema, type SettingsFormValues } from '@/features/pdf-builder/schemas/settingsSchema'
import { useWorkspaceStore } from '@/stores/workspaceStore'

export function SettingsPage() {
  const theme = useWorkspaceStore((state) => state.theme)
  const autoDownload = useWorkspaceStore((state) => state.autoDownload)
  const notifyOnComplete = useWorkspaceStore((state) => state.notifyOnComplete)
  const setTheme = useWorkspaceStore((state) => state.setTheme)
  const setAutoDownload = useWorkspaceStore((state) => state.setAutoDownload)
  const setNotifyOnComplete = useWorkspaceStore((state) => state.setNotifyOnComplete)
  const form = useForm<SettingsFormValues>({ resolver: zodResolver(settingsSchema), defaultValues: { theme, autoDownload, notifyOnComplete } })

  const submit = form.handleSubmit(async (values) => {
    let notifications = values.notifyOnComplete
    if (notifications && 'Notification' in window && Notification.permission === 'default') {
      notifications = (await Notification.requestPermission()) === 'granted'
      if (!notifications) toast.warning('浏览器通知未获授权，手动查看与下载仍然可用。')
    }
    if (notifications && !('Notification' in window)) {
      notifications = false
      toast.warning('当前浏览器不支持通知。')
    }
    setTheme(values.theme as typeof theme)
    setAutoDownload(values.autoDownload)
    setNotifyOnComplete(notifications)
    form.setValue('notifyOnComplete', notifications)
    toast.success('设置已保存。')
  })

  return (
    <PageContainer className="flex max-w-5xl flex-col gap-6">
      <div className="max-w-3xl"><span className="text-xs font-bold uppercase tracking-[0.2em] text-primary">个人偏好</span><h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">让交付方式符合你的习惯</h1><p className="mt-2 text-sm leading-6 text-muted-foreground sm:text-base">这些选项只保存界面与交付偏好，不会保存尚未上传的本地文档或资源包。</p></div>

      <Card>
        <CardHeader><CardTitle>构建与交付</CardTitle><CardDescription>新任务默认采用这些设置，创建时仍可单独调整。</CardDescription></CardHeader>
        <form onSubmit={submit}>
          <CardContent>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="settings-theme"><Palette aria-hidden="true" className="size-4 text-primary" />默认 PDF 主题</FieldLabel>
                <Select id="settings-theme" {...form.register('theme')}>{PDF_THEMES.map((item) => <option value={item.id} key={item.id}>{item.name} — {item.description}</option>)}</Select>
                <FieldDescription>决定新任务首次打开时选中的排版风格。</FieldDescription>
              </Field>

              <FieldSet className="rounded-xl border bg-muted/20 p-4 sm:p-5">
                <FieldLegend>完成后的动作</FieldLegend>
                <FieldDescription>自动动作失败只会提示你手动处理，不会改变已完成状态。</FieldDescription>
                <div className="mt-2 grid gap-3 sm:grid-cols-2">
                  <Field className="min-h-24 flex-row items-start rounded-lg border bg-card/80 p-4">
                    <Checkbox id="settings-auto-download" {...form.register('autoDownload')} />
                    <div className="min-w-0"><FieldLabel htmlFor="settings-auto-download"><Download aria-hidden="true" className="size-4" />自动下载</FieldLabel><FieldDescription>任务完成后尝试下载 PDF，失败时保留手动按钮。</FieldDescription></div>
                  </Field>
                  <Field className="min-h-24 flex-row items-start rounded-lg border bg-card/80 p-4">
                    <Checkbox id="settings-notify" {...form.register('notifyOnComplete')} />
                    <div className="min-w-0"><FieldLabel htmlFor="settings-notify"><Bell aria-hidden="true" className="size-4" />浏览器通知</FieldLabel><FieldDescription>仅在浏览器授权后发送完成提醒。</FieldDescription></div>
                  </Field>
                </div>
              </FieldSet>

              <Alert><AlertDescription>刷新页面后可以恢复服务端任务与构建状态；出于浏览器安全限制，尚未完成上传的本地文件需要重新选择。</AlertDescription></Alert>
            </FieldGroup>
          </CardContent>
          <CardFooter className="justify-end"><Button type="submit" disabled={form.formState.isSubmitting} aria-busy={form.formState.isSubmitting}>{form.formState.isSubmitting && <Spinner data-icon="inline-start" />}保存设置</Button></CardFooter>
        </form>
      </Card>
    </PageContainer>
  )
}
