import { Check, LoaderCircle, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { formatDateTime } from '@/lib/utils'
import { getJobProgress, getJobStageDescription, isTerminalJob } from '../status'
import { formatElapsedClock, getJobFlowSteps, getJobTimingSummary, type JobFlowStep, type JobFlowStepState } from '../timing'
import type { PdfJob } from '../types'

function nodeClass(state: JobFlowStepState): string {
  if (state === 'complete') return 'border-primary bg-primary text-primary-foreground'
  if (state === 'active') return 'border-primary bg-background text-primary'
  if (state === 'error') return 'border-destructive bg-destructive text-destructive-foreground'
  return 'border-border bg-background text-muted-foreground'
}

function StepMark({ step, index }: { step: JobFlowStep; index: number }) {
  return (
    <span className={cn('relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold shadow-sm', nodeClass(step.state))}>
      {step.state === 'complete' && <Check className="size-4" />}
      {step.state === 'active' && <LoaderCircle className="size-4 animate-spin" />}
      {step.state === 'error' && <X className="size-4" />}
      {step.state === 'pending' && index + 1}
    </span>
  )
}

function DetailedFlow({ steps }: { steps: JobFlowStep[] }) {
  return (
    <>
      <ol className="space-y-0 lg:hidden" aria-label="PDF 构建流程">
        {steps.map((step, index) => (
          <li key={step.key} className="relative flex gap-3 pb-5 last:pb-0">
            {index < steps.length - 1 && (
              <span className={cn('absolute bottom-0 left-[15px] top-8 w-0.5', step.state === 'complete' ? 'bg-primary' : 'bg-border')} aria-hidden="true" />
            )}
            <StepMark step={step} index={index} />
            <div className="min-w-0 pt-0.5">
              <strong className={cn('block text-sm', step.state === 'pending' && 'text-muted-foreground')}>{step.label}</strong>
              <span className="mt-1 block font-mono text-xs tabular-nums text-muted-foreground">{formatElapsedClock(step.elapsedMilliseconds)}</span>
            </div>
          </li>
        ))}
      </ol>

      <ol className="hidden lg:flex" aria-label="PDF 构建流程">
        {steps.map((step, index) => {
          const previousReached = index === 0 || step.state !== 'pending'
          const nextReached = index === steps.length - 1 || steps[index + 1]?.state !== 'pending'
          return (
            <li key={step.key} className="flex min-w-0 flex-1 flex-col items-center text-center">
              <div className="flex w-full items-center">
                <span className={cn('h-0.5 flex-1', index === 0 ? 'bg-transparent' : previousReached ? 'bg-primary' : 'bg-border')} aria-hidden="true" />
                <StepMark step={step} index={index} />
                <span className={cn('h-0.5 flex-1', index === steps.length - 1 ? 'bg-transparent' : step.state === 'complete' && nextReached ? 'bg-primary' : 'bg-border')} aria-hidden="true" />
              </div>
              <strong className={cn('mt-3 block max-w-28 text-xs font-semibold', step.state === 'pending' && 'text-muted-foreground')}>{step.label}</strong>
              <span className="mt-1 block font-mono text-[11px] tabular-nums text-muted-foreground">{formatElapsedClock(step.elapsedMilliseconds)}</span>
            </li>
          )
        })}
      </ol>
    </>
  )
}

function aggregateState(steps: JobFlowStep[]): JobFlowStepState {
  if (steps.some((step) => step.state === 'error')) return 'error'
  if (steps.some((step) => step.state === 'active')) return 'active'
  if (steps.every((step) => step.state === 'complete')) return 'complete'
  if (steps.some((step) => step.state === 'complete')) return 'complete'
  return 'pending'
}

function CompactFlow({ job, steps }: { job: PdfJob; steps: JobFlowStep[] }) {
  const finalLabel = job.status === 'failed'
    ? '失败'
    : job.status === 'cancelled'
      ? '取消'
      : job.status === 'expired'
        ? '过期'
        : '完成'
  const groups = [
    { label: '准备', state: aggregateState(steps.slice(0, 2)) },
    { label: '排队', state: aggregateState(steps.slice(2, 3)) },
    { label: '构建', state: aggregateState(steps.slice(3, 5)) },
    { label: '交付', state: aggregateState(steps.slice(5, 6)) },
    { label: finalLabel, state: aggregateState(steps.slice(-1)) },
  ]

  return (
    <ol className="flex items-start" aria-label="简要构建流程">
      {groups.map((group, index) => (
        <li key={group.label} className="flex min-w-0 flex-1 flex-col items-center text-center">
          <div className="flex w-full items-center">
            <span className={cn('h-px flex-1', index === 0 ? 'bg-transparent' : group.state !== 'pending' ? 'bg-primary' : 'bg-border')} aria-hidden="true" />
            <span className={cn('relative z-10 flex size-3.5 shrink-0 rounded-full border-2 bg-background', group.state === 'complete' && 'border-primary bg-primary', group.state === 'active' && 'border-primary ring-4 ring-primary/10', group.state === 'error' && 'border-destructive bg-destructive', group.state === 'pending' && 'border-border')} />
            <span className={cn('h-px flex-1', index === groups.length - 1 ? 'bg-transparent' : group.state === 'complete' ? 'bg-primary' : 'bg-border')} aria-hidden="true" />
          </div>
          <span className={cn('mt-1.5 text-[10px] font-medium', group.state === 'pending' ? 'text-muted-foreground' : 'text-foreground')}>{group.label}</span>
        </li>
      ))}
    </ol>
  )
}

export function JobProgress({ job, compact = false }: { job: PdfJob; compact?: boolean }) {
  const progress = getJobProgress(job)
  const terminal = isTerminalJob(job)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    setNow(Date.now())
    if (terminal) return
    const timer = window.setInterval(() => setNow(Date.now()), 1_000)
    return () => window.clearInterval(timer)
  }, [job.id, terminal])

  const timing = getJobTimingSummary(job, now)
  const steps = getJobFlowSteps(job, now)

  if (compact) {
    return (
      <div className="min-w-[22rem] space-y-2.5">
        <div className="flex items-center justify-between gap-3 text-xs">
          <span className="truncate font-medium text-foreground">{getJobStageDescription(job)}</span>
          <strong className="shrink-0 tabular-nums text-foreground">{progress}%</strong>
        </div>
        <CompactFlow job={job} steps={steps} />
        <div className="flex items-center justify-between gap-3 text-[11px] text-muted-foreground">
          <span>{timing.label} {timing.value}</span>
          <span className="shrink-0">更新 {formatDateTime(job.updated_at)}</span>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">当前阶段</span>
          <strong className="mt-1 block break-words text-base">{getJobStageDescription(job)}</strong>
        </div>
        <div className="flex shrink-0 items-end gap-4 sm:text-right">
          <div><span className="block text-xs text-muted-foreground">进度</span><strong className="text-2xl tabular-nums">{progress}%</strong></div>
          <div><span className="block text-xs text-muted-foreground">{timing.label}</span><strong className="text-base tabular-nums">{timing.value}</strong></div>
        </div>
      </div>

      <DetailedFlow steps={steps} />

      <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-4 text-xs text-muted-foreground">
        <span>节点时间从任务创建开始计算，格式为分钟:秒</span>
        <span>最近更新：{formatDateTime(job.updated_at)}</span>
      </div>
    </div>
  )
}
