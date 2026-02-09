/**
 * Sidebar Component - Navigation sidebar with sessions and workspace
 */

import { useChatStore } from '../stores/chat-store'
import { useWorkspaceStore } from '../stores/workspace-store'
import { Button } from './ui'

export function Sidebar() {
  const { sessions, currentSessionId, selectSession, createSession } = useChatStore()
  const { currentWorkspace, selectWorkspace } = useWorkspaceStore()

  const handleNewSession = async () => {
    if (!currentWorkspace) {
      alert('Please select a workspace first')
      return
    }
    try {
      const sessionName = prompt('Enter session name:')
      if (sessionName) {
        await createSession(sessionName, currentWorkspace)
      }
    } catch (error) {
      console.error('Failed to create session:', error)
      alert('Failed to create session')
    }
  }

  const handleSelectWorkspace = async () => {
    try {
      // This will open native directory picker
      const path = await window.api.selectDirectory()
      if (path) {
        await selectWorkspace(path)
      }
    } catch (error) {
      console.error('Failed to select workspace:', error)
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* Workspace section */}
      <div className="border-b border-gray-200 dark:border-gray-800 p-4">
        <div className="mb-2 text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">
          Workspace
        </div>
        {currentWorkspace ? (
          <div className="text-sm truncate" title={currentWorkspace}>
            {currentWorkspace.split('/').pop()}
          </div>
        ) : (
          <Button size="sm" variant="ghost" onClick={handleSelectWorkspace} className="w-full">
            Select Workspace
          </Button>
        )}
      </div>

      {/* Sessions section */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="mb-2 flex items-center justify-between">
          <div className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">
            Sessions
          </div>
          <Button size="sm" variant="ghost" onClick={handleNewSession}>
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </Button>
        </div>

        <div className="space-y-1">
          {sessions.map((session) => (
            <button
              key={session.id}
              onClick={() => selectSession(session.id)}
              className={`w-full rounded-md px-3 py-2 text-left text-sm transition-colors ${
                currentSessionId === session.id
                  ? 'bg-blue-100 text-blue-900 dark:bg-blue-900 dark:text-blue-100'
                  : 'hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
            >
              <div className="truncate font-medium">{session.name}</div>
              <div className="truncate text-xs text-gray-500 dark:text-gray-400">
                {session.messages.length} messages
              </div>
            </button>
          ))}

          {sessions.length === 0 && (
            <div className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
              No sessions yet
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
