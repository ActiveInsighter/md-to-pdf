export type UploadPhase =
  | 'idle'
  | 'creating'
  | 'uploading-markdown'
  | 'uploading-assets'
  | 'starting'
  | 'submitted'
  | 'failed'
  | 'cancelling'

export type SubmissionRecovery = {
  jobId: string
  status: 'created' | 'uploaded'
  inputPath: string
  assetsPath: string | null
  hasAssets: boolean
  sourceFilename?: string
  documentName?: string
}

export const uploadPhaseLabels: Record<UploadPhase, string> = {
  idle: '准备就绪',
  creating: '正在创建任务',
  'uploading-markdown': '正在上传 Markdown',
  'uploading-assets': '正在上传资源包',
  starting: '正在启动构建',
  submitted: '任务已提交',
  failed: '提交中断',
  cancelling: '正在取消任务',
}
