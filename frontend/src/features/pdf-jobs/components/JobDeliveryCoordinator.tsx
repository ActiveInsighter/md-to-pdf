import { useJobDelivery } from '../hooks/useJobDelivery'
import { usePdfJobs } from '../hooks/usePdfJobs'
import type { PdfJob } from '../types'

function JobDeliveryWatcher({ job }: { job: PdfJob }) {
  useJobDelivery(job)
  return null
}

export function JobDeliveryCoordinator() {
  const jobs = usePdfJobs({ status: 'all', search: '' })
  return <>{jobs.data?.map((job) => <JobDeliveryWatcher key={job.id} job={job} />)}</>
}
