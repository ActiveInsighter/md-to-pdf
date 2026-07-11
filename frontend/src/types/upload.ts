export type UploadPhase =
  | 'idle'
  | 'creating'
  | 'uploading-markdown'
  | 'uploading-assets'
  | 'starting'
  | 'submitted'

export const uploadPhaseLabels: Record<UploadPhase, string> = {
  idle: '准备就绪',
  creating: '正在创建任务',
  'uploading-markdown': '正在上传 Markdown',
  'uploading-assets': '正在上传资源包',
  starting: '正在启动构建',
  submitted: '任务已提交',
}
