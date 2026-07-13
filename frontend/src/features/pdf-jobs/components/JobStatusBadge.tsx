import { Badge } from '@/components/ui/badge'
import { getJobStatusLabel, getJobStatusVariant } from '../status'
import type { PdfJob } from '../types'

export function JobStatusBadge({ job }: { job: Pick<PdfJob, 'status' | 'error_message'> }) {
  return <Badge variant={getJobStatusVariant(job)}>{getJobStatusLabel(job)}</Badge>
}
