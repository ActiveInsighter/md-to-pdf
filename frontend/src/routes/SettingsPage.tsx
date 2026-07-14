import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { Bell, Download } from 'lucide-react'
import { toast } from 'sonner'
import { PageContainer } from '@/components/layout/PageContainer'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
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
      if (!notifications) toast.warning('浏览器通知未获授权。')
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
    <PageContainer data-ui-capture="settings-page" className="flex max-w-3xl flex-col gap-5">
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">设置</h1>
      <Card>
        <CardHeader><CardTitle>默认选项</CardTitle></CardHeader>
        <form onSubmit={submit}>
          <CardContent>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="settings-theme">默认 PDF 主题</FieldLabel>
                <Select id="settings-theme" {...form.register('theme')}>{PDF_THEMES.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</Select>
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="flex cursor-pointer items-center gap-3 rounded-lg border p-4">
                  <Checkbox id="settings-auto-download" {...form.register('autoDownload')} />
                  <Download className="size-4 text-muted-foreground" />
                  <span className="text-sm font-medium">完成后自动下载 PDF</span>
                </label>
                <label className="flex cursor-pointer items-center gap-3 rounded-lg border p-4">
                  <Checkbox id="settings-notify" {...form.register('notifyOnComplete')} />
                  <Bell className="size-4 text-muted-foreground" />
                  <span className="text-sm font-medium">完成后浏览器通知</span>
                </label>
              </div>
            </FieldGroup>
          </CardContent>
          <CardFooter className="justify-end"><Button type="submit" disabled={form.formState.isSubmitting} aria-busy={form.formState.isSubmitting}>{form.formState.isSubmitting && <Spinner data-icon="inline-start" />}保存</Button></CardFooter>
        </form>
      </Card>
    </PageContainer>
  )
}
