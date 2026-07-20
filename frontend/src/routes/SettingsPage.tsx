import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { Bell, Download, Palette, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import { useShallow } from 'zustand/react/shallow'
import { PageContainer } from '@/components/layout/PageContainer'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Select } from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'
import { PDF_THEMES } from '@/features/pdf-builder/types'
import { settingsSchema, type SettingsFormValues } from '@/features/pdf-builder/schemas/settingsSchema'
import { useWorkspaceStore } from '@/stores/workspaceStore'

const defaultSettings: SettingsFormValues = {
  theme: 'chatgpt-light',
  autoDownload: false,
  notifyOnComplete: false,
}

export function SettingsPage() {
  const settings = useWorkspaceStore(
    useShallow((state) => ({
      theme: state.theme,
      autoDownload: state.autoDownload,
      notifyOnComplete: state.notifyOnComplete,
      setTheme: state.setTheme,
      setAutoDownload: state.setAutoDownload,
      setNotifyOnComplete: state.setNotifyOnComplete,
      resetPreferences: state.resetPreferences,
    })),
  )
  const form = useForm<SettingsFormValues>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      theme: settings.theme,
      autoDownload: settings.autoDownload,
      notifyOnComplete: settings.notifyOnComplete,
    },
  })

  const submit = form.handleSubmit(async (values) => {
    let notifications = values.notifyOnComplete
    if (notifications && 'Notification' in window) {
      if (Notification.permission === 'default') {
        await Notification.requestPermission()
      }
      notifications = Notification.permission === 'granted'
      if (!notifications) toast.warning('浏览器通知未获授权。')
    }

    if (notifications && !('Notification' in window)) {
      notifications = false
      toast.warning('当前浏览器不支持通知。')
    }

    settings.setTheme(values.theme as typeof settings.theme)
    settings.setAutoDownload(values.autoDownload)
    settings.setNotifyOnComplete(notifications)
    form.setValue('notifyOnComplete', notifications)
    toast.success('设置已保存。')
  })

  const reset = () => {
    settings.resetPreferences()
    form.reset(defaultSettings)
    toast.success('已恢复默认设置。')
  }

  return (
    <PageContainer data-ui-capture="settings-page" className="flex max-w-4xl flex-col gap-6">
      <header>
        <span className="section-kicker">偏好设置</span>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">设置</h1>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">这些选项仅保存到当前浏览器，不会改变已经创建的任务。</p>
      </header>

      <Card className="shadow-panel">
        <CardHeader className="border-b bg-muted/20">
          <div className="flex items-start gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Palette className="size-4" /></span>
            <div>
              <CardTitle>默认构建选项</CardTitle>
              <CardDescription>创建新任务时自动带入，提交前仍可单独修改。</CardDescription>
            </div>
          </div>
        </CardHeader>
        <form onSubmit={submit}>
          <CardContent className="pt-5">
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="settings-theme">默认 PDF 主题</FieldLabel>
                <Select id="settings-theme" {...form.register('theme')}>
                  {PDF_THEMES.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}
                </Select>
              </Field>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="group flex cursor-pointer items-start gap-3 rounded-xl border bg-background p-4 transition-colors hover:bg-accent/45">
                  <Checkbox id="settings-auto-download" className="mt-0.5" {...form.register('autoDownload')} />
                  <Download className="mt-0.5 size-4 shrink-0 text-muted-foreground group-hover:text-accent-foreground" />
                  <span>
                    <strong className="block text-sm font-medium">完成后自动下载 PDF</strong>
                    <span className="mt-1 block text-xs leading-5 text-muted-foreground">任务首次完成时自动保存生成文件。</span>
                  </span>
                </label>
                <label className="group flex cursor-pointer items-start gap-3 rounded-xl border bg-background p-4 transition-colors hover:bg-accent/45">
                  <Checkbox id="settings-notify" className="mt-0.5" {...form.register('notifyOnComplete')} />
                  <Bell className="mt-0.5 size-4 shrink-0 text-muted-foreground group-hover:text-accent-foreground" />
                  <span>
                    <strong className="block text-sm font-medium">完成后浏览器通知</strong>
                    <span className="mt-1 block text-xs leading-5 text-muted-foreground">需要浏览器授权，任务完成后发送系统通知。</span>
                  </span>
                </label>
              </div>
            </FieldGroup>
          </CardContent>
          <CardFooter className="justify-between border-t bg-muted/10 pt-5">
            <Button type="button" variant="ghost" onClick={reset}><RotateCcw />恢复默认</Button>
            <Button type="submit" disabled={form.formState.isSubmitting} aria-busy={form.formState.isSubmitting}>
              {form.formState.isSubmitting && <Spinner data-icon="inline-start" />}
              保存设置
            </Button>
          </CardFooter>
        </form>
      </Card>
    </PageContainer>
  )
}
