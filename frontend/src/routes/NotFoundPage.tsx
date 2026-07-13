import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
export function NotFoundPage() { return <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center"><h1 className="text-4xl font-semibold">404</h1><p className="text-muted-foreground">页面不存在或地址已经变更。</p><Button asChild><Link to="/workspace">返回工作台</Link></Button></div> }
