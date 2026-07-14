import { Check, LoaderCircle, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { cn, formatDateTime } from '@/lib/utils'
import { getJobProgress, getJobStageDescription, isTerminalJob } from '../status'
import { formatElapsedClock, getJobFlowSteps, getJobTimingSummary, type JobFlowStep, type JobFlowStepState } from '../timing'
import type { PdfJob } from '../types'

function aggregateState(steps: JobFlowStep[]): JobFlowStepState {
  if (steps.some((step) => step.state === 'error')) return 'error'
  if (steps.some((step) => step.state === 'active')) return 'active'
  if (steps.every((step) => step.state === 'complete')) return 'complete'
  if (steps.some((step) => step.state === 'complete')) return 'complete'
  return 'pending'
}

function phaseElapsed(steps: JobFlowStep[]): number | null {
  return [...steps].reverse().find((step) => step.elapsedMilliseconds !== null)?.elapsedMilliseconds ?? null
}

function nodeClass(state: JobFlowStepState): string {
  if (state === 'complete') return 'border-primary bg-primary text-primary-foreground'
  if (state === 'active') return 'border-primary bg-background text-primary ring-4 ring-primary/10'
  if (state === 'error') return 'border-destructive bg-destructive text-destructive-foreground'
  return 'border-border bg-background text-muted-foreground'
}

function PhaseMark({ state, index }: { state: JobFlowStepState; index: number }) {
  return (
    <span className={cn('relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full border-2 text-[11px] font-bold shadow-sm', nodeClass(state))}>
      {state === 'complete' && <Check className="size-4" />}
      {state === 'active' && <LoaderCircle className="size-4 animate-spin" />}
      {state === 'error' && <X className="size-4" />}
      {state === 'pending' && index + 1}
    </span>
  )
}

function ProgressPhases({ job, steps }: { job: PdfJob; steps: JobFlowStep[] }) {
  const finalLabel = job.status === 'failed'
    ? '失败'
    : job.status === 'cancelled'
      ? '取消'
      : job.status === 'expired'
        ? '过期'
        : '完成'
  const phases = [
    { label: '源文件', steps: steps.slice(0, 2) },
    { label: '排队', steps: steps.slice(2, 3) },
    { label: '构建', steps: steps.slice(3, 5) },
    { label: '保存', steps: steps.slice(5, 6) },
    { label: finalLabel, steps: steps.slice(-1) },
  ].map((phase) => ({ ...phase, state: aggregateState(phase.steps), elapsed: phaseElapsed(phase.steps) }))

  return (
    <ol className="flex min-w-[31rem] items-start" aria-label="PDF 构建流程">
      {phases.map((phase, index) => (
        <li key={phase.label} className="flex min-w-0 flex-1 flex-col items-center text-center">
          <div className="flex w-full items-center">
            <span className={cn('h-px flex-1', index === 0 ? 'bg-transparent' : phase.state !== 'pending' ? 'bg-primary' : 'bg-border')} aria-hidden="true" />
            <PhaseMark state={phase.state} index={index} />
            <span className={cn('h-px flex-1', index === phases.length - 1 ? 'bg-transparent' : phase.state === 'complete' ? 'bg-primary' : 'bg-border')} aria-hidden="true" />
          </div>
          <strong className={cn('mt-2 block text-xs font-semibold', phase.state === 'pending' && 'text-muted-foreground')}>{phase.label}</strong>
          <span className="mt-0.5 block font-mono text-[10px] tabular-nums text-muted-foreground">{formatElapsedClock(phase.elapsed)}</span>
        </li>
      ))}
    </ol>
  )
}

function DetailedMilestones({ steps }: { steps: JobFlowStep[] }) {
  return (
    <details className="rounded-lg border bg-muted/20 px-4 py-3 text-sm">
      <summary className="cursor-pointer select-none font-medium text-muted-foreground hover:text-foreground">查看详细节点</summary>
      <ol className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {steps.map((step) => (
          <li key={step.key} className="rounded-md border bg-background p-3">
            <div className="flex items-center justify-between gap-2">
              <strong className="text-xs font-semibold">{step.label}</strong>
              <span className={cn('size-2 rounded-full', step.state === 'complete' && 'bg-primary', step.state === 'active' && 'bg-primary ring-4 ring-primary/10', step.state === 'error' && 'bg-destructive', step.state === 'pending' && 'bg-border')} />
            </div>
            <span className="mt-1 block font-mono text-[11px] tabular-nums text-muted-foreground">{formatElapsedClock(step.elapsedMilliseconds)}</span>
            <span className="mt-1 block truncate text-[10px] text-muted-foreground" title={step.at || undefined}>{step.at ? formatDateTime(step.at) : '等待执行'}</span>
          </li>
        ))}
      </ol>
    </details>
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
      <div className="min-w-64 space-y-2">
        <div className="flex items-center justify-between gap-3 text-xs">
          <span className="truncate font-medium">{getJobStageDescription(job)}</span>
          <strong className="shrink-0 tabular-nums">{progress}%</strong>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${progress}%` }} /></div>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <div className="min-w-0">
          <span className="text-xs font-medium text-muted-foreground">当前阶段</span>
          <strong className="mt-1 block break-words text-base">{getJobStageDescription(job)}</strong>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label="任务进度" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}>
            <div className="h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${progress}%` }} />
          </div>
        </div>
        <div className="flex items-end gap-6 sm:text-right">
          <div><span className="block text-[11px] text-muted-foreground">进度</span><strong className="text-xl tabular-nums">{progress}%</strong></div>
          <div><span className="block text-[11px] text-muted-foreground">{timing.label}</span><strong className="text-sm tabular-nums">{timing.value}</strong></div>
        </div>
      </div>

      <div className="overflow-x-auto pb-1"><ProgressPhases job={job} steps={steps} /></div>
      <DetailedMilestones steps={steps} />

      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
        <span>所有耗时均从任务创建开始计算</span>
        <span>最近更新：{formatDateTime(job.updated_at)}</span>
      </div>
    </div>
  )
}
