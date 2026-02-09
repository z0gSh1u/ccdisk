/**
 * Sidebar Component - Navigation sidebar with sessions and workspace
 */

import { useState } from 'react'
import { useChatStore } from '../stores/chat-store'
import { useWorkspaceStore } from '../stores/workspace-store'
import { Button, Input, Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui'
import { Plus, Folder, MessageSquare } from 'lucide-react'

export function Sidebar() {
  const { sessions, currentSessionId, selectSession, createSession } = useChatStore()
  const { currentWorkspace, selectWorkspace } = useWorkspaceStore()
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [sessionName, setSessionName] = useState('')

  const handleNewSession = async () => {
    if (!currentWorkspace) {
      alert('Please select a workspace first')
      return
    }
    setIsDialogOpen(true)
  }

  const handleCreateSession = async () => {
    if (!sessionName.trim()) {
      return
    }
    try {
      await createSession(sessionName.trim(), currentWorkspace!)
      setIsDialogOpen(false)
      setSessionName('')
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
    <>
      <div className="flex h-full flex-col bg-[var(--bg-secondary)] border-r border-[var(--border-subtle)]">
        {/* Header / Brand */}
        <div className="p-4 flex items-center gap-2">
          <div className="h-6 w-6 rounded bg-[var(--accent-color)] flex items-center justify-center text-white font-serif font-bold text-xs">
            C
          </div>
          <div className="font-semibold text-[var(--text-primary)]">Claude Code</div>
        </div>

        {/* Workspace section */}
        <div className="px-4 py-2">
          <div className="mb-2 text-xs font-medium uppercase tracking-wider text-[var(--text-tertiary)]">
            Workspace
          </div>
          {currentWorkspace ? (
            <div
              className="flex items-center gap-2 rounded-md bg-white px-3 py-2 text-sm shadow-sm border border-[var(--border-subtle)] text-[var(--text-secondary)]"
              title={currentWorkspace}
            >
              <Folder className="h-4 w-4 text-[var(--text-tertiary)]" />
              <div className="truncate font-medium">{currentWorkspace.split('/').pop()}</div>
            </div>
          ) : (
            <Button
              size="sm"
              variant="secondary"
              onClick={handleSelectWorkspace}
              className="w-full justify-start gap-2"
            >
              <Folder className="h-4 w-4" />
              Select Workspace
            </Button>
          )}
        </div>

        {/* Sessions section */}
        <div className="flex-1 overflow-y-auto px-2 py-4">
          <div className="mb-2 px-2 flex items-center justify-between group">
            <div className="text-xs font-medium uppercase tracking-wider text-[var(--text-tertiary)]">
              Recents
            </div>
            <button
              onClick={handleNewSession}
              className="rounded p-1 text-[var(--text-tertiary)] hover:bg-[var(--bg-accent)] hover:text-[var(--text-primary)] transition-colors"
              title="New Chat"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>

          <div className="space-y-0.5">
            {sessions.map((session) => (
              <button
                key={session.id}
                onClick={() => selectSession(session.id)}
                className={`group flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-all ${
                  currentSessionId === session.id
                    ? 'bg-[var(--bg-accent)] text-[var(--text-primary)] font-medium shadow-sm'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--bg-accent)] hover:text-[var(--text-primary)]'
                }`}
              >
                <MessageSquare
                  className={`h-4 w-4 shrink-0 ${currentSessionId === session.id ? 'text-[var(--accent-color)]' : 'text-[var(--text-tertiary)] group-hover:text-[var(--text-secondary)]'}`}
                />
                <div className="truncate flex-1">{session.name}</div>
              </button>
            ))}

            {sessions.length === 0 && (
              <div className="px-4 py-8 text-center text-sm text-[var(--text-tertiary)] italic">
                No active sessions
              </div>
            )}
          </div>
        </div>

        {/* Footer profile/settings area could go here */}
        <div className="p-4 border-t border-[var(--border-subtle)]">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-full bg-gradient-to-br from-gray-200 to-gray-300"></div>
            <div className="text-sm font-medium text-[var(--text-secondary)]">User</div>
          </div>
        </div>
      </div>

      {/* New Session Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="bg-white">
          <DialogHeader>
            <DialogTitle className="font-serif text-xl">New Chat</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Input
              placeholder="Name your session..."
              value={sessionName}
              onChange={(e) => setSessionName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleCreateSession()
                }
              }}
              autoFocus
              className="text-lg py-6"
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              className="bg-[var(--accent-color)] text-white hover:bg-[var(--accent-hover)]"
              onClick={handleCreateSession}
              disabled={!sessionName.trim()}
            >
              Start Chat
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
