/**
 * App Component - Main application entry point
 */

import { useEffect } from 'react'
import { MainLayout } from './components/MainLayout'
import { Sidebar } from './components/Sidebar'
import { ChatInterface } from './components/ChatInterface'
import { useChatStore, setupChatStreamListener } from './stores/chat-store'
import { useWorkspaceStore } from './stores/workspace-store'
import { useSettingsStore } from './stores/settings-store'

function App() {
  const { loadSessions } = useChatStore()
  const { setupFileWatcher } = useWorkspaceStore()
  const { loadProviders } = useSettingsStore()

  // Initialize app on mount
  useEffect(() => {
    // Setup stream listener for real-time chat updates
    setupChatStreamListener()

    // Load initial data
    loadSessions()
    loadProviders()

    // Setup file watcher
    const unwatchFiles = setupFileWatcher()

    // Cleanup on unmount
    return () => {
      unwatchFiles()
    }
  }, [loadSessions, loadProviders, setupFileWatcher])

  return (
    <MainLayout sidebar={<Sidebar />} toolbar={<Toolbar />}>
      <ChatInterface />
    </MainLayout>
  )
}

// Toolbar component
function Toolbar() {
  return (
    <div className="flex items-center gap-2">
      <div className="text-sm font-semibold text-gray-700 dark:text-gray-300">CCDisk</div>
      <div className="text-xs text-gray-500 dark:text-gray-400">
        Claude Code Desktop Interface
      </div>
    </div>
  )
}

export default App
