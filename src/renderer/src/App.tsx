/**
 * App Component - Main application entry point
 */

import { useEffect, useState } from 'react'
import { MainLayout } from './components/MainLayout'
import { Sidebar } from './components/Sidebar'
import { ChatInterface } from './components/ChatInterface'
import { FilePreview } from './components/workspace/FilePreview'
import { SidePanel, type PanelType } from './components/SidePanel'
import { useChatStore, setupChatStreamListener } from './stores/chat-store'
import { useWorkspaceStore } from './stores/workspace-store'
import { useSettingsStore } from './stores/settings-store'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from './components/ui/dropdown-menu'
import { ChevronDown } from 'lucide-react'
import type { PermissionMode } from '../../shared/types'

function App() {
  const { loadSessions } = useChatStore()
  const { loadWorkspace, setupFileWatcher } = useWorkspaceStore()
  const { loadProviders } = useSettingsStore()
  const selectedFile = useWorkspaceStore((s) => s.selectedFile)
  const [activePanelType, setActivePanelType] = useState<PanelType | null>(null)

  // Initialize app on mount
  useEffect(() => {
    // Setup stream listener for real-time chat updates
    const teardownStreamListener = setupChatStreamListener()

    // Load initial data
    loadWorkspace() // Load default workspace first
    loadSessions()
    loadProviders()

    // Setup file watcher
    const unwatchFiles = setupFileWatcher()

    // Cleanup on unmount
    return () => {
      teardownStreamListener()
      unwatchFiles()
    }
  }, [loadSessions, loadProviders, loadWorkspace, setupFileWatcher])

  return (
    <MainLayout
      sidebar={<Sidebar activePanelType={activePanelType} onPanelTypeChange={setActivePanelType} />}
      toolbar={<Toolbar />}
      preview={selectedFile ? <FilePreview /> : undefined}
    >
      <ChatInterface />
      <SidePanel
        isOpen={activePanelType !== null}
        panelType={activePanelType}
        onClose={() => setActivePanelType(null)}
      />
    </MainLayout>
  )
}

// Toolbar component
function Toolbar() {
  const { permissionMode, setPermissionMode } = useChatStore()

  const modes = [
    {
      value: 'prompt' as PermissionMode,
      label: 'Prompt',
      description: 'Ask for permission for every tool'
    },
    {
      value: 'acceptEdits' as PermissionMode,
      label: 'Accept Edits',
      description: 'Auto-approve most tools, ask for destructive ones'
    },
    {
      value: 'bypassPermissions' as PermissionMode,
      label: 'Bypass',
      description: 'Auto-approve all tools'
    }
  ]

  const currentMode = modes.find((m) => m.value === permissionMode) || modes[0]

  return (
    <div className="flex items-center justify-between w-full">
      <div className="flex items-center gap-2">
        <div className="text-sm font-semibold text-text-primary">CCDisk</div>
        <div className="h-4 w-[1px] bg-border-subtle"></div>
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger className="flex items-center gap-1 px-3 py-1.5 rounded-md border border-border-subtle bg-white hover:bg-bg-accent transition-colors text-sm">
          <span className="text-text-secondary">Mode:</span>
          <span className="font-medium text-text-primary">{currentMode.label}</span>
          <ChevronDown className="h-3 w-3 text-text-tertiary" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {modes.map((mode) => (
            <DropdownMenuItem
              key={mode.value}
              onClick={() => setPermissionMode(mode.value)}
              className={permissionMode === mode.value ? 'bg-bg-accent' : ''}
            >
              <div>
                <div className="font-medium">{mode.label}</div>
                <div className="text-xs text-text-tertiary">{mode.description}</div>
              </div>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

export default App
