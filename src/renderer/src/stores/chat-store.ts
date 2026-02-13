/**
 * Chat Store - Manages chat sessions, messages, and streaming
 * Uses Zustand for state management and calls window.api for IPC
 */

import { create } from 'zustand'
import type {
  StreamEvent,
  Message,
  Session,
  PermissionMode,
  PermissionRequest
} from '../../../shared/types'

// Extended message type with local UI state
export interface ChatMessage extends Message {
  isStreaming?: boolean
  streamingText?: string
}

export interface ChatSession extends Session {
  messages: ChatMessage[]
  isLoading?: boolean
}

interface ChatStore {
  // State
  sessions: ChatSession[]
  currentSessionId: string | null
  permissionMode: PermissionMode
  pendingPermissionRequest: PermissionRequest | null

  // Actions - Session management
  loadSessions: () => Promise<void>
  createSession: (name?: string) => Promise<string>
  renameSession: (sessionId: string, name: string) => Promise<void>
  selectSession: (sessionId: string) => void
  deleteSession: (sessionId: string) => Promise<void>

  // Actions - Chat
  sendMessage: (message: string) => Promise<void>
  handleStreamEvent: (sessionId: string, event: StreamEvent) => void
  abortSession: (sessionId: string) => Promise<void>

  // Actions - Permissions
  setPermissionMode: (mode: PermissionMode) => Promise<void>
  respondToPermission: (permissionRequestId: string, approved: boolean) => Promise<void>

  // Helpers
  addMessageToSession: (sessionId: string, message: ChatMessage) => void
  updateStreamingMessage: (sessionId: string, text: string) => void
  finalizeStreamingMessage: (sessionId: string) => void
}

export const useChatStore = create<ChatStore>((set, get) => ({
  // Initial state
  sessions: [],
  currentSessionId: null,
  permissionMode: 'prompt',
  pendingPermissionRequest: null,

  // Load all sessions from database
  loadSessions: async () => {
    const response = await window.api.sessions.list()
    if (response.success && response.data) {
      const sessionsWithMessages = await Promise.all(
        response.data.map(async (session) => {
          const messagesResponse = await window.api.sessions.getMessages(session.id)
          const messages =
            messagesResponse.success && messagesResponse.data ? messagesResponse.data : []
          return {
            ...session,
            messages: messages.map((m) => ({
              ...m,
              content: JSON.parse(m.content) // Deserialize content
            }))
          }
        })
      )
      set({ sessions: sessionsWithMessages })
    }
  },

  // Create new session with auto-incrementing name
  createSession: async (name?: string) => {
    const { sessions } = get()

    // Auto-generate name if not provided
    let sessionName = name || 'New Chat'
    if (!name) {
      const existingNewChats = sessions.filter((s) => /^New Chat(\s\(\d+\))?$/.test(s.name))
      if (existingNewChats.length > 0) {
        sessionName = `New Chat (${existingNewChats.length + 1})`
      }
    }

    const response = await window.api.sessions.create(sessionName)
    if (response.success && response.data) {
      const newSession: ChatSession = {
        ...response.data,
        messages: []
      }
      set((state) => ({
        sessions: [...state.sessions, newSession],
        currentSessionId: newSession.id
      }))
      return newSession.id
    }
    throw new Error(response.error || 'Failed to create session')
  },

  // Rename session
  renameSession: async (sessionId: string, name: string) => {
    if (!name.trim()) return
    const response = await window.api.sessions.update(sessionId, { name: name.trim() })
    if (response.success) {
      set((state) => ({
        sessions: state.sessions.map((s) => (s.id === sessionId ? { ...s, name: name.trim() } : s))
      }))
    }
  },

  // Select active session
  selectSession: (sessionId: string) => {
    set({ currentSessionId: sessionId })
  },

  // Delete session
  deleteSession: async (sessionId: string) => {
    const response = await window.api.sessions.delete(sessionId)
    if (response.success) {
      set((state) => ({
        sessions: state.sessions.filter((s) => s.id !== sessionId),
        currentSessionId: state.currentSessionId === sessionId ? null : state.currentSessionId
      }))
    }
  },

  // Send message to Claude
  sendMessage: async (message: string) => {
    const { currentSessionId, sessions } = get()
    const currentSession = sessions.find((session) => session.id === currentSessionId) || null
    if (!currentSessionId || !currentSession) {
      throw new Error('No active session')
    }

    // Add user message to UI immediately
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      sessionId: currentSessionId,
      role: 'user',
      content: JSON.stringify([{ type: 'text', text: message }]),
      tokenUsage: null,
      createdAt: new Date()
    }

    get().addMessageToSession(currentSessionId, userMessage)

    // Add placeholder streaming message for assistant
    const streamingMessage: ChatMessage = {
      id: crypto.randomUUID(),
      sessionId: currentSessionId,
      role: 'assistant',
      content: JSON.stringify([]),
      tokenUsage: null,
      isStreaming: true,
      streamingText: '',
      createdAt: new Date()
    }

    get().addMessageToSession(currentSessionId, streamingMessage)

    // Send to backend (returns immediately, streams via events)
    const response = await window.api.chat.sendMessage(currentSessionId, message)

    if (!response.success) {
      throw new Error(response.error || 'Failed to send message')
    }
  },

  // Handle stream events from IPC
  handleStreamEvent: (sessionId: string, event: StreamEvent) => {
    const { sessions } = get()
    const session = sessions.find((s) => s.id === sessionId)
    if (!session) return

    switch (event.type) {
      case 'text':
        // Append text to streaming message
        get().updateStreamingMessage(sessionId, event.data as string)
        break

      case 'tool_use':
        // Log tool use (could add to message content)
        console.log('Tool use:', event.data)
        break

      case 'tool_result':
        // Log tool result
        console.log('Tool result:', event.data)
        break

      case 'permission_request':
        // Show permission request UI
        set({ pendingPermissionRequest: event.data as PermissionRequest })
        break

      case 'status':
        // Update SDK session ID if provided
        const statusData = event.data as { session_id?: string }
        if (statusData.session_id) {
          set((state) => ({
            sessions: state.sessions.map((s) =>
              s.id === sessionId ? { ...s, sdkSessionId: statusData.session_id || null } : s
            )
          }))
        }
        break

      case 'result':
        // Finalize streaming message
        get().finalizeStreamingMessage(sessionId)
        break

      case 'done':
        // Finalize streaming message
        get().finalizeStreamingMessage(sessionId)
        break

      case 'error':
        // Show error
        console.error('Stream error:', event.data)
        get().finalizeStreamingMessage(sessionId)
        break
    }
  },

  // Abort active session
  abortSession: async (sessionId: string) => {
    const response = await window.api.chat.abort(sessionId)
    if (response.success) {
      get().finalizeStreamingMessage(sessionId)
    }
  },

  // Set permission mode
  setPermissionMode: async (mode: PermissionMode) => {
    const response = await window.api.chat.setPermissionMode(mode)
    if (response.success) {
      set({ permissionMode: mode })
    }
  },

  // Respond to permission request
  respondToPermission: async (permissionRequestId: string, approved: boolean) => {
    const response = await window.api.chat.respondPermission(permissionRequestId, approved)
    if (response.success) {
      set({ pendingPermissionRequest: null })
    }
  },

  // Helper: Add message to session
  addMessageToSession: (sessionId: string, message: ChatMessage) => {
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === sessionId ? { ...s, messages: [...s.messages, message] } : s
      )
    }))
  },

  // Helper: Update streaming message text
  updateStreamingMessage: (sessionId: string, text: string) => {
    set((state) => ({
      sessions: state.sessions.map((s) => {
        if (s.id !== sessionId) return s
        const messages = [...s.messages]
        const lastMessage = messages[messages.length - 1]
        if (lastMessage && lastMessage.isStreaming) {
          lastMessage.streamingText = (lastMessage.streamingText || '') + text
        }
        return { ...s, messages }
      })
    }))
  },

  // Helper: Finalize streaming message
  finalizeStreamingMessage: (sessionId: string) => {
    set((state) => ({
      sessions: state.sessions.map((s) => {
        if (s.id !== sessionId) return s
        const messages = [...s.messages]
        const lastMessage = messages[messages.length - 1]
        if (lastMessage && lastMessage.isStreaming) {
          lastMessage.isStreaming = false
          lastMessage.content = JSON.stringify([
            { type: 'text', text: lastMessage.streamingText || '' }
          ])
          delete lastMessage.streamingText
        }
        return { ...s, messages }
      })
    }))
  }
}))

// Setup stream event listener (call once on app init)
export function setupChatStreamListener() {
  return window.api.chat.onStream((sessionId, event) => {
    useChatStore.getState().handleStreamEvent(sessionId, event)
  })
}
