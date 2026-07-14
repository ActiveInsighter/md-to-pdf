export type SubmissionState =
  | { status: 'idle' }
  | { status: 'creating'; progress: number }
  | { status: 'uploading-markdown'; jobId: string; progress: number }
  | { status: 'uploading-assets'; jobId: string; progress: number }
  | { status: 'confirming-upload'; jobId: string; progress: number }
  | { status: 'prepared'; jobId: string; progress: number }
  | { status: 'starting'; jobId: string; progress: number }
  | { status: 'submitted'; jobId: string }
  | { status: 'failed'; jobId?: string; message: string; recoverable: boolean }
  | { status: 'cancelling'; jobId: string }

export type SubmissionAction =
  | { type: 'RESET' }
  | { type: 'CREATING'; progress?: number }
  | { type: 'UPLOADING_MARKDOWN'; jobId: string; progress?: number }
  | { type: 'UPLOADING_ASSETS'; jobId: string; progress?: number }
  | { type: 'CONFIRMING_UPLOAD'; jobId: string; progress?: number }
  | { type: 'PREPARED'; jobId: string; progress?: number }
  | { type: 'STARTING'; jobId: string; progress?: number }
  | { type: 'SUBMITTED'; jobId: string }
  | { type: 'FAILED'; jobId?: string; message: string; recoverable: boolean }
  | { type: 'CANCELLING'; jobId: string }

export const initialSubmissionState: SubmissionState = { status: 'idle' }

export function submissionReducer(_: SubmissionState, action: SubmissionAction): SubmissionState {
  switch (action.type) {
    case 'RESET': return { status: 'idle' }
    case 'CREATING': return { status: 'creating', progress: action.progress ?? 8 }
    case 'UPLOADING_MARKDOWN': return { status: 'uploading-markdown', jobId: action.jobId, progress: action.progress ?? 35 }
    case 'UPLOADING_ASSETS': return { status: 'uploading-assets', jobId: action.jobId, progress: action.progress ?? 70 }
    case 'CONFIRMING_UPLOAD': return { status: 'confirming-upload', jobId: action.jobId, progress: action.progress ?? 90 }
    case 'PREPARED': return { status: 'prepared', jobId: action.jobId, progress: action.progress ?? 100 }
    case 'STARTING': return { status: 'starting', jobId: action.jobId, progress: action.progress ?? 100 }
    case 'SUBMITTED': return { status: 'submitted', jobId: action.jobId }
    case 'FAILED': return { status: 'failed', jobId: action.jobId, message: action.message, recoverable: action.recoverable }
    case 'CANCELLING': return { status: 'cancelling', jobId: action.jobId }
  }
}

export function getSubmissionProgress(state: SubmissionState): number {
  if (state.status === 'idle' || state.status === 'failed' || state.status === 'cancelling') return 0
  if (state.status === 'prepared' || state.status === 'submitted' || state.status === 'starting') return 100
  return state.progress
}

export function getSubmissionLabel(state: SubmissionState): string {
  const labels: Record<SubmissionState['status'], string> = {
    idle: '等待选择内容',
    creating: '正在创建私有任务',
    'uploading-markdown': '正在上传 Markdown',
    'uploading-assets': '正在上传资源包',
    'confirming-upload': '正在确认源文件',
    prepared: '文件已上传，等待生成 PDF',
    starting: '正在启动 PDF 构建',
    submitted: '构建任务已提交',
    failed: '操作中断',
    cancelling: '正在清理待启动任务',
  }
  return labels[state.status]
}
