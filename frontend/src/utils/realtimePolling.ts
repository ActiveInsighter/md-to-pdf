export const FALLBACK_POLL_INTERVAL_MS = 10_000
export const HEALTHY_REALTIME_POLL_INTERVAL_MS = 60_000

export function getPdfJobPollInterval(realtimeStatus: string): number {
  return realtimeStatus === 'SUBSCRIBED'
    ? HEALTHY_REALTIME_POLL_INTERVAL_MS
    : FALLBACK_POLL_INTERVAL_MS
}
