/**
 * MainLayout Component - Application shell with sidebar navigation
 */

import { type ReactNode, useState } from 'react'
import { cn } from '../lib/utils'

interface MainLayoutProps {
  children: ReactNode
  sidebar?: ReactNode
  toolbar?: ReactNode
}

export function MainLayout({ children, sidebar, toolbar }: MainLayoutProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true)

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-gray-50 dark:bg-gray-900">
      {/* Sidebar */}
      {sidebar && (
        <aside
          className={cn(
            'flex flex-col border-r border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 transition-all duration-200',
            isSidebarOpen ? 'w-64' : 'w-0'
          )}
        >
          <div className={cn('flex-1 overflow-hidden', isSidebarOpen ? 'opacity-100' : 'opacity-0')}>
            {sidebar}
          </div>
        </aside>
      )}

      {/* Main content area */}
      <main className="flex flex-1 flex-col overflow-hidden">
        {/* Toolbar */}
        {toolbar && (
          <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 px-4 py-2">
            {/* Toggle sidebar button */}
            <button
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="rounded-md p-2 hover:bg-gray-100 dark:hover:bg-gray-800"
              aria-label="Toggle sidebar"
            >
              <svg
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 6h16M4 12h16M4 18h16"
                />
              </svg>
            </button>
            {toolbar}
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-hidden">{children}</div>
      </main>
    </div>
  )
}
