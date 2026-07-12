export const FALLBACK_POLL_INTERVAL_MS = 3_000
export const HEALTHY_REALTIME_POLL_INTERVAL_MS = 5_000

export function getPdfJobPollInterval(realtimeStatus: string): number {
  return realtimeStatus === 'SUBSCRIBED'
    ? HEALTHY_REALTIME_POLL_INTERVAL_MS
    : FALLBACK_POLL_INTERVAL_MS
}
