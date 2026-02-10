/**
 * MainLayout Component - Application shell with sidebar navigation
 */

import { type ReactNode, useState } from 'react'
import { cn } from '../lib/utils'
import { Menu } from 'lucide-react'

interface MainLayoutProps {
  children: ReactNode
  sidebar?: ReactNode
  toolbar?: ReactNode
}

export function MainLayout({ children, sidebar, toolbar }: MainLayoutProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true)

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-bg-primary">
      {/* Sidebar */}
      {sidebar && (
        <aside
          className={cn(
            'flex flex-col border-r border-border-subtle bg-bg-secondary transition-all duration-300 ease-in-out',
            isSidebarOpen ? 'w-[260px]' : 'w-0 border-r-0'
          )}
        >
          <div
            className={cn(
              'flex-1 overflow-hidden w-[260px]',
              isSidebarOpen ? 'opacity-100' : 'opacity-0'
            )}
          >
            {sidebar}
          </div>
        </aside>
      )}

      {/* Main content area */}
      <main className="flex flex-1 flex-col overflow-hidden relative">
        {/* Toolbar / Header Area */}
        <div className="absolute top-4 left-4 z-50">
          <button
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="rounded-lg p-2 text-text-tertiary hover:bg-bg-accent hover:text-text-secondary transition-colors"
            aria-label="Toggle sidebar"
            title={isSidebarOpen ? 'Close Sidebar' : 'Open Sidebar'}
          >
            <Menu className="h-5 w-5" />
          </button>
        </div>

        {toolbar && (
          <div className="flex items-center justify-between border-b border-border-subtle bg-bg-primary px-4 py-2 pl-16">
            {toolbar}
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-hidden">{children}</div>
      </main>
    </div>
  )
}
