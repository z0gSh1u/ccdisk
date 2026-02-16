/**
 * MainLayout Component - Application shell with sidebar navigation
 */

import { type ReactNode, useState } from 'react';
import { cn } from '../lib/utils';
import { Menu } from 'lucide-react';
import { PseudoTitleBar, noDragStyle } from './PseudoTitleBar';

interface MainLayoutProps {
  children: ReactNode;
  sidebar?: ReactNode;
  toolbar?: ReactNode;
  preview?: ReactNode;
}

export function MainLayout({ children, sidebar, toolbar, preview }: MainLayoutProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const isMacOS = window.platform === 'darwin';

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-bg-primary">
      {/* Sidebar with draggable top bar */}
      {sidebar && (
        <aside
          className={cn(
            'flex flex-col border-r border-border-subtle bg-bg-secondary transition-all duration-300 ease-in-out',
            isSidebarOpen ? 'w-[260px]' : 'w-0 border-r-0'
          )}
        >
          {/* Draggable area on top of sidebar */}
          <div
            className="h-12 shrink-0 select-none"
            style={
              {
                WebkitAppRegion: 'drag'
              } as React.CSSProperties
            }
          />

          <div className={cn('flex-1 overflow-hidden w-[260px] -mt-12', isSidebarOpen ? 'opacity-100' : 'opacity-0')}>
            {sidebar}
          </div>
        </aside>
      )}

      {/* Main content area */}
      <main className="flex flex-1 flex-col overflow-hidden relative">
        {/* PseudoTitleBar with draggable region */}
        <PseudoTitleBar className="h-12 px-4">
          {/* Sidebar toggle button - macOS traffic lights on left, so add padding */}
          <div className={cn('flex items-center h-full', isMacOS && 'pl-16')}>
            <button
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="rounded-lg p-2 text-text-tertiary hover:bg-bg-accent hover:text-text-secondary transition-colors"
              aria-label="Toggle sidebar"
              title={isSidebarOpen ? 'Close Sidebar' : 'Open Sidebar'}
              style={noDragStyle}
            >
              <Menu className="h-5 w-5" />
            </button>
          </div>

          {/* Toolbar content */}
          {toolbar && <div className="flex-1 flex items-center justify-between ml-4 h-full">{toolbar}</div>}
        </PseudoTitleBar>

        {/* Content */}
        <div className="flex-1 overflow-hidden flex">
          <div className={cn('overflow-hidden', preview ? 'w-1/2' : 'flex-1')}>{children}</div>
          {preview && <div className="w-1/2 overflow-hidden">{preview}</div>}
        </div>
      </main>
    </div>
  );
}
