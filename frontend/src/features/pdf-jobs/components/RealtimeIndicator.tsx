import { Cloud, CloudOff, LoaderCircle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { useWorkspaceStore } from '@/stores/workspaceStore'

export function RealtimeIndicator() {
  const status = useWorkspaceStore((state) => state.realtimeConnection)
  if (status === 'connected') return <Badge variant="success" className="gap-1.5"><Cloud className="h-3.5 w-3.5" />实时同步</Badge>
  if (status === 'connecting') return <Badge variant="warning" className="gap-1.5"><LoaderCircle className="h-3.5 w-3.5 animate-spin" />正在连接</Badge>
  return <Badge variant="destructive" className="gap-1.5"><CloudOff className="h-3.5 w-3.5" />轮询兜底</Badge>
}
