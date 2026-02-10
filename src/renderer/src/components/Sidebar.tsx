/**
 * Sidebar Component - Navigation sidebar with sessions and workspace
 */

import { useState } from 'react'
import { useChatStore } from '../stores/chat-store'
import { useWorkspaceStore } from '../stores/workspace-store'
import { Button, Input, Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui'
import {
  Plus,
  Folder,
  MessageSquare,
  ExternalLink,
  Settings,
  ChevronDown,
  ChevronRight
} from 'lucide-react'
import { SettingsDialog } from './settings/SettingsDialog'
import { FileTree } from './workspace/FileTree'

export function Sidebar() {
  const { sessions, currentSessionId, selectSession, createSession } = useChatStore()
  const { currentWorkspace, openWorkspaceInExplorer } = useWorkspaceStore()
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [sessionName, setSessionName] = useState('')
  const [isFileTreeExpanded, setIsFileTreeExpanded] = useState(false)

  const handleNewSession = async () => {
    setIsDialogOpen(true)
  }

  const handleCreateSession = async () => {
    if (!sessionName.trim()) {
      return
    }
    try {
      await createSession(sessionName.trim())
      setIsDialogOpen(false)
      setSessionName('')
    } catch (error) {
      console.error('Failed to create session:', error)
      alert('Failed to create session')
    }
  }

  const handleOpenWorkspace = async () => {
    try {
      await openWorkspaceInExplorer()
    } catch (error) {
      console.error('Failed to open workspace:', error)
    }
  }

  return (
    <>
      <div className="flex h-full flex-col bg-bg-secondary border-r border-border-subtle">
        {/* Header / Brand */}
        <div className="p-4 flex items-center gap-2">
          <div className="h-6 w-6 rounded bg-accent flex items-center justify-center text-white font-serif font-bold text-xs">
            C
          </div>
          <div className="font-semibold text-text-primary">Claude Code</div>
        </div>

        {/* Workspace section */}
        <div className="px-4 py-2">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-xs font-medium uppercase tracking-wider text-text-tertiary">
              Workspace
            </div>
            <button
              onClick={() => setIsFileTreeExpanded(!isFileTreeExpanded)}
              className="p-1 rounded hover:bg-bg-accent transition-colors"
              title={isFileTreeExpanded ? 'Hide Files' : 'Show Files'}
            >
              {isFileTreeExpanded ? (
                <ChevronDown className="h-4 w-4 text-text-tertiary" />
              ) : (
                <ChevronRight className="h-4 w-4 text-text-tertiary" />
              )}
            </button>
          </div>
          <button
            onClick={handleOpenWorkspace}
            className="flex items-center gap-2 rounded-md bg-white px-3 py-2 text-sm shadow-sm border border-border-subtle text-text-secondary hover:bg-bg-accent transition-colors w-full mb-2"
            title={currentWorkspace || '~/.ccdisk'}
          >
            <Folder className="h-4 w-4 text-text-tertiary" />
            <div className="truncate font-medium flex-1 text-left">
              {currentWorkspace ? currentWorkspace.split('/').pop() : '.ccdisk'}
            </div>
            <ExternalLink className="h-3 w-3 text-text-tertiary" />
          </button>

          {/* File Tree */}
          {isFileTreeExpanded && (
            <div
              className="bg-white rounded-md border border-border-subtle overflow-hidden"
              style={{ height: '300px' }}
            >
              <FileTree />
            </div>
          )}
        </div>

        {/* Sessions section */}
        <div className="flex-1 overflow-y-auto px-2 py-4">
          <div className="mb-2 px-2 flex items-center justify-between group">
            <div className="text-xs font-medium uppercase tracking-wider text-text-tertiary">
              Recents
            </div>
            <button
              onClick={handleNewSession}
              className="rounded p-1 text-text-tertiary hover:bg-bg-accent hover:text-text-primary transition-colors"
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
                    ? 'bg-bg-accent text-text-primary font-medium shadow-sm'
                    : 'text-text-secondary hover:bg-bg-accent hover:text-text-primary'
                }`}
              >
                <MessageSquare
                  className={`h-4 w-4 shrink-0 ${currentSessionId === session.id ? 'text-accent' : 'text-text-tertiary group-hover:text-text-secondary'}`}
                />
                <div className="truncate flex-1">{session.name}</div>
              </button>
            ))}

            {sessions.length === 0 && (
              <div className="px-4 py-8 text-center text-sm text-text-tertiary italic">
                No active sessions
              </div>
            )}
          </div>
        </div>

        {/* Footer profile/settings area could go here */}
        <div className="p-4 border-t border-border-subtle">
          <button
            onClick={() => setIsSettingsOpen(true)}
            className="flex items-center gap-3 w-full px-3 py-2 rounded-lg hover:bg-bg-accent transition-colors"
          >
            <Settings className="h-5 w-5 text-text-tertiary" />
            <div className="text-sm font-medium text-text-secondary">Settings</div>
          </button>
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
              className="bg-accent text-white hover:bg-accent-hover"
              onClick={handleCreateSession}
              disabled={!sessionName.trim()}
            >
              Start Chat
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Settings Dialog */}
      <SettingsDialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen} />
    </>
  )
}
