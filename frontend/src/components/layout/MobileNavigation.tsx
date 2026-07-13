import { Menu } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { AppSidebar } from './AppSidebar'
import { useWorkspaceStore } from '@/stores/workspaceStore'

export function MobileNavigation() {
  const open = useWorkspaceStore((state) => state.sidebarOpen)
  const setOpen = useWorkspaceStore((state) => state.setSidebarOpen)
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild><Button variant="ghost" size="icon" className="lg:hidden" aria-label="打开导航"><Menu className="h-5 w-5" /></Button></SheetTrigger>
      <SheetContent className="p-0"><SheetHeader className="sr-only"><SheetTitle>导航</SheetTitle></SheetHeader><AppSidebar onNavigate={() => setOpen(false)} /></SheetContent>
    </Sheet>
  )
}
