/**
 * Sidebar Component - Navigation sidebar with sessions and workspace
 */

import { useState, useRef, useEffect } from 'react'
import { useChatStore } from '../stores/chat-store'
import { useWorkspaceStore } from '../stores/workspace-store'
import { Button, Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui'
import {
  Plus,
  Folder,
  MessageSquare,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  Trash2,
  Terminal,
  Puzzle,
  Activity
} from 'lucide-react'
import { FileTree } from './workspace/FileTree'
import type { PanelType } from './SidePanel'

interface SidebarProps {
  activePanelType: PanelType | null
  onPanelTypeChange: (type: PanelType | null) => void
}

export function Sidebar({ activePanelType, onPanelTypeChange }: SidebarProps) {
  const { sessions, currentSessionId, selectSession, createSession, deleteSession, renameSession } =
    useChatStore()
  const { currentWorkspace, openWorkspaceInExplorer } = useWorkspaceStore()
  const [isFileTreeExpanded, setIsFileTreeExpanded] = useState(false)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)

  // Inline rename state
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const renameInputRef = useRef<HTMLInputElement>(null)

  // Focus and select input text when editing starts
  useEffect(() => {
    if (editingSessionId && renameInputRef.current) {
      renameInputRef.current.focus()
      renameInputRef.current.select()
    }
  }, [editingSessionId])

  const handleNewSession = async () => {
    try {
      await createSession()
    } catch (error) {
      console.error('Failed to create session:', error)
    }
  }

  const handleOpenWorkspace = async () => {
    try {
      await openWorkspaceInExplorer()
    } catch (error) {
      console.error('Failed to open workspace:', error)
    }
  }

  const handleStartRename = (sessionId: string, currentName: string) => {
    setEditingSessionId(sessionId)
    setEditingName(currentName)
  }

  const handleSaveRename = async () => {
    if (editingSessionId && editingName.trim()) {
      await renameSession(editingSessionId, editingName)
    }
    setEditingSessionId(null)
    setEditingName('')
  }

  const handleCancelRename = () => {
    setEditingSessionId(null)
    setEditingName('')
  }

  const handleDeleteSession = async () => {
    if (!deleteConfirmId) return
    try {
      await deleteSession(deleteConfirmId)
    } catch (error) {
      console.error('Failed to delete session:', error)
    }
    setDeleteConfirmId(null)
  }

  return (
    <>
      <div className="flex flex-col h-full bg-bg-secondary border-r border-border-subtle">
        {/* Header / Brand */}
        <div className="shrink-0 p-4 flex items-center gap-2">
          <div className="h-6 w-6 rounded bg-accent flex items-center justify-center text-white font-serif font-bold text-xs">
            C
          </div>
          <div className="font-semibold text-text-primary">CCDisk</div>
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
              className="flex items-center gap-1 rounded px-1.5 py-0.5 text-text-tertiary hover:bg-bg-accent hover:text-text-primary transition-colors text-xs"
              title="New Chat"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>New Chat</span>
            </button>
          </div>

          <div className="space-y-0.5">
            {sessions.map((session) => (
              <div
                key={session.id}
                className={`group flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-all ${
                  currentSessionId === session.id
                    ? 'bg-bg-accent text-text-primary font-medium shadow-sm'
                    : 'text-text-secondary hover:bg-bg-accent hover:text-text-primary'
                }`}
              >
                <button
                  onClick={() => selectSession(session.id)}
                  className="flex items-center gap-2 flex-1 min-w-0"
                >
                  <MessageSquare
                    className={`h-4 w-4 shrink-0 ${currentSessionId === session.id ? 'text-accent' : 'text-text-tertiary group-hover:text-text-secondary'}`}
                  />
                  {editingSessionId === session.id ? (
                    <input
                      ref={renameInputRef}
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          handleSaveRename()
                        } else if (e.key === 'Escape') {
                          handleCancelRename()
                        }
                      }}
                      onBlur={handleSaveRename}
                      onClick={(e) => e.stopPropagation()}
                      className="flex-1 min-w-0 bg-white border border-border-subtle rounded px-1.5 py-0.5 text-sm outline-none focus:border-accent"
                    />
                  ) : (
                    <div
                      className="truncate flex-1"
                      onDoubleClick={(e) => {
                        e.stopPropagation()
                        handleStartRename(session.id, session.name)
                      }}
                    >
                      {session.name}
                    </div>
                  )}
                </button>
                {editingSessionId !== session.id && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      setDeleteConfirmId(session.id)
                    }}
                    className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-100 hover:text-red-600 transition-all shrink-0"
                    title="Delete session"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))}

            {sessions.length === 0 && (
              <div className="px-4 py-8 text-center text-sm text-text-tertiary italic">
                No active sessions
              </div>
            )}
          </div>
        </div>

        {/* Footer - Settings Panels */}
        <div className="shrink-0 p-2 border-t border-border-subtle space-y-1">
          <button
            onClick={() => onPanelTypeChange(activePanelType === 'skills' ? null : 'skills')}
            className={`
              flex items-center gap-3 w-full px-3 py-2 rounded-lg transition-colors
              ${
                activePanelType === 'skills'
                  ? 'bg-bg-accent text-text-primary border-l-2 border-accent'
                  : 'text-text-secondary hover:bg-bg-accent'
              }
            `}
            title="Skills & Commands"
          >
            <Terminal className="h-5 w-5 text-text-tertiary" />
            <div className="text-sm font-medium">Skills & Commands</div>
          </button>

          <button
            onClick={() => onPanelTypeChange(activePanelType === 'mcp' ? null : 'mcp')}
            className={`
              flex items-center gap-3 w-full px-3 py-2 rounded-lg transition-colors
              ${
                activePanelType === 'mcp'
                  ? 'bg-bg-accent text-text-primary border-l-2 border-accent'
                  : 'text-text-secondary hover:bg-bg-accent'
              }
            `}
            title="MCP Servers"
          >
            <Puzzle className="h-5 w-5 text-text-tertiary" />
            <div className="text-sm font-medium">MCP Servers</div>
          </button>

          <button
            onClick={() => onPanelTypeChange(activePanelType === 'claude' ? null : 'claude')}
            className={`
              flex items-center gap-3 w-full px-3 py-2 rounded-lg transition-colors
              ${
                activePanelType === 'claude'
                  ? 'bg-bg-accent text-text-primary border-l-2 border-accent'
                  : 'text-text-secondary hover:bg-bg-accent'
              }
            `}
            title="Claude Configuration"
          >
            <Activity className="h-5 w-5 text-text-tertiary" />
            <div className="text-sm font-medium">Claude Config</div>
          </button>
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteConfirmId} onOpenChange={(open) => !open && setDeleteConfirmId(null)}>
        <DialogContent className="bg-white">
          <DialogHeader>
            <DialogTitle className="font-serif text-xl">Delete Chat</DialogTitle>
          </DialogHeader>
          <div className="py-4 text-sm text-text-secondary">
            Are you sure you want to delete this chat? This action cannot be undone.
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteConfirmId(null)}>
              Cancel
            </Button>
            <Button
              className="bg-red-600 text-white hover:bg-red-700"
              onClick={handleDeleteSession}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
