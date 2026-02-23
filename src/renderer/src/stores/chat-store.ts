/**
 * Chat Store - Manages chat sessions, messages, and streaming
 * Uses Zustand for state management and calls window.api for IPC
 */

import { create } from 'zustand';
import type { StreamEvent, Message, Session, PermissionRequest } from '../../../shared/types';

import { useDiskStore } from './disk-store';

export type ChatContentBlock =
  | { type: 'text'; text: string }
  | {
      type: 'tool_call';
      toolUseId?: string;
      toolName: string;
      toolInput: Record<string, unknown>;
      permissionStatus?: 'requested' | 'allowed' | 'denied';
      result?: { content: string; is_error?: boolean };
    };

// Extended message type with local UI state
export interface ChatMessage extends Omit<Message, 'content'> {
  content: string | ChatContentBlock[];
  isStreaming?: boolean;
  streamingBlocks?: ChatContentBlock[];
}

export interface ChatSession extends Session {
  messages: ChatMessage[];
  isLoading?: boolean;
}

interface ChatStore {
  // State
  sessions: ChatSession[];
  currentSessionId: string | null;
  pendingPermissionRequest: PermissionRequest | null;
  pendingPermissionSessionId: string | null;

  // Actions - Session management
  loadSessions: () => Promise<void>;
  createSession: (name?: string) => Promise<string>;
  renameSession: (sessionId: string, name: string) => Promise<void>;
  selectSession: (sessionId: string) => void;
  deleteSession: (sessionId: string) => Promise<void>;

  // Actions - Chat
  sendMessage: (message: string) => Promise<void>;
  handleStreamEvent: (sessionId: string, event: StreamEvent) => void;
  abortSession: (sessionId: string) => Promise<void>;

  // Actions - Permissions
  respondToPermission: (permissionRequestId: string, approved: boolean) => Promise<void>;

  // Helpers
  addMessageToSession: (sessionId: string, message: ChatMessage) => void;
  updateStreamingMessage: (sessionId: string, text: string) => void;
  upsertToolCall: (sessionId: string, update: ToolCallUpdate) => void;
  finalizeStreamingMessage: (sessionId: string) => void;
}

interface ToolCallUpdate {
  toolUseId?: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  permissionStatus?: 'requested' | 'allowed' | 'denied';
  result?: { content: string; is_error?: boolean };
}

export const useChatStore = create<ChatStore>((set, get) => ({
  // Initial state
  sessions: [],
  currentSessionId: null,
  pendingPermissionRequest: null,
  pendingPermissionSessionId: null,

  // Load all sessions from database
  loadSessions: async () => {
    const response = await window.api.sessions.list();
    if (response.success && response.data) {
      const sessionsWithMessages = await Promise.all(
        response.data.map(async (session) => {
          const messagesResponse = await window.api.sessions.getMessages(session.id);
          const messages = messagesResponse.success && messagesResponse.data ? messagesResponse.data : [];
          return {
            ...session,
            messages: messages.map((m) => ({
              ...m,
              content: JSON.parse(m.content) // Deserialize content
            }))
          };
        })
      );
      set({ sessions: sessionsWithMessages });
    }
  },

  // Create new session with auto-incrementing name
  createSession: async (name?: string) => {
    const { sessions } = get();

    // Auto-generate name if not provided
    let sessionName = name || 'New Chat';
    if (!name) {
      const existingNewChats = sessions.filter((s) => /^New Chat(\s\(\d+\))?$/.test(s.name));
      if (existingNewChats.length > 0) {
        sessionName = `New Chat (${existingNewChats.length + 1})`;
      }
    }

    const response = await window.api.sessions.create(sessionName);
    if (response.success && response.data) {
      // Tag session with current disk
      const currentDisk = useDiskStore.getState().currentDisk;
      if (currentDisk) {
        await window.api.sessions.update(response.data.id, { diskId: currentDisk.id });
      }

      const newSession: ChatSession = {
        ...response.data,
        messages: []
      };
      set((state) => ({
        sessions: [newSession, ...state.sessions],
        currentSessionId: newSession.id
      }));
      return newSession.id;
    }
    throw new Error(response.error || 'Failed to create session');
  },

  // Rename session
  renameSession: async (sessionId: string, name: string) => {
    if (!name.trim()) return;
    const response = await window.api.sessions.update(sessionId, { name: name.trim() });
    if (response.success) {
      set((state) => ({
        sessions: state.sessions.map((s) => (s.id === sessionId ? { ...s, name: name.trim() } : s))
      }));
    }
  },

  // Select active session
  selectSession: (sessionId: string) => {
    const { currentSessionId } = get();
    if (currentSessionId && currentSessionId !== sessionId) {
      void window.api.chat.abort(currentSessionId);
    }
    set({ currentSessionId: sessionId });
  },

  // Delete session
  deleteSession: async (sessionId: string) => {
    const response = await window.api.sessions.delete(sessionId);
    if (response.success) {
      set((state) => ({
        sessions: state.sessions.filter((s) => s.id !== sessionId),
        currentSessionId: state.currentSessionId === sessionId ? null : state.currentSessionId
      }));
    }
  },

  // Send message to Claude
  sendMessage: async (message: string) => {
    const { currentSessionId, sessions } = get();
    const currentSession = sessions.find((session) => session.id === currentSessionId) || null;
    if (!currentSessionId || !currentSession) {
      throw new Error('No active session');
    }

    if (currentSession.messages.some((msg) => msg.isStreaming)) {
      throw new Error('Session is already responding');
    }

    // Add user message to UI immediately
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      sessionId: currentSessionId,
      role: 'user',
      content: [{ type: 'text', text: message }],
      tokenUsage: null,
      createdAt: new Date()
    };

    get().addMessageToSession(currentSessionId, userMessage);

    // Add placeholder streaming message for assistant
    const streamingMessage: ChatMessage = {
      id: crypto.randomUUID(),
      sessionId: currentSessionId,
      role: 'assistant',
      content: [],
      tokenUsage: null,
      isStreaming: true,
      streamingBlocks: [],
      createdAt: new Date()
    };

    get().addMessageToSession(currentSessionId, streamingMessage);

    // Send to backend (returns immediately, streams via events)
    const response = await window.api.chat.sendMessage(
      currentSessionId,
      message,
      undefined,
      currentSession.sdkSessionId || undefined
    );

    if (!response.success) {
      throw new Error(response.error || 'Failed to send message');
    }
  },

  // Handle stream events from IPC
  handleStreamEvent: (sessionId: string, event: StreamEvent) => {
    const { sessions } = get();
    const session = sessions.find((s) => s.id === sessionId);
    if (!session) return;

    switch (event.type) {
      case 'text':
        // Append text to streaming message
        get().updateStreamingMessage(sessionId, event.data as string);
        break;

      case 'tool_use':
        // Add tool use block to streaming message
        const toolUseData = event.data as { name: string; input: Record<string, unknown> };
        get().upsertToolCall(sessionId, {
          toolUseId: (event.data as { id?: string }).id,
          toolName: toolUseData.name,
          toolInput: toolUseData.input
        });
        break;

      case 'tool_result':
        // Add tool result block to streaming message
        const toolResultData = event.data as { tool_use_id?: string; content: string; is_error?: boolean };
        get().upsertToolCall(sessionId, {
          toolUseId: toolResultData.tool_use_id,
          toolName: 'tool',
          toolInput: {},
          result: { content: toolResultData.content, is_error: toolResultData.is_error }
        });
        break;

      case 'permission_request':
        // Show permission request UI
        set({
          pendingPermissionRequest: event.data as PermissionRequest,
          pendingPermissionSessionId: sessionId
        });
        const permissionData = event.data as PermissionRequest;
        get().upsertToolCall(sessionId, {
          toolUseId: permissionData.toolUseId,
          toolName: permissionData.toolName,
          toolInput: permissionData.toolInput,
          permissionStatus: 'requested'
        });
        break;

      case 'status':
        // Update SDK session ID if provided
        const statusData = event.data as { session_id?: string };
        if (statusData.session_id) {
          set((state) => ({
            sessions: state.sessions.map((s) =>
              s.id === sessionId ? { ...s, sdkSessionId: statusData.session_id || null } : s
            )
          }));
        }
        break;

      case 'result':
        // Wait for done event to finalize to avoid early close
        break;

      case 'done':
        // Finalize streaming message
        get().finalizeStreamingMessage(sessionId);
        break;

      case 'error':
        // Show error
        console.error('Stream error:', event.data);
        get().finalizeStreamingMessage(sessionId);
        break;
    }
  },

  // Abort active session
  abortSession: async (sessionId: string) => {
    const response = await window.api.chat.abort(sessionId);
    if (response.success) {
      get().finalizeStreamingMessage(sessionId);
    }
  },

  // Respond to permission request
  respondToPermission: async (permissionRequestId: string, approved: boolean) => {
    const pending = get().pendingPermissionRequest;
    const pendingSessionId = get().pendingPermissionSessionId;
    const response = await window.api.chat.respondPermission(permissionRequestId, approved);
    if (response.success) {
      set({ pendingPermissionRequest: null, pendingPermissionSessionId: null });
      if (pending && pendingSessionId) {
        get().upsertToolCall(pendingSessionId, {
          toolUseId: pending.toolUseId,
          toolName: pending.toolName,
          toolInput: pending.toolInput,
          permissionStatus: approved ? 'allowed' : 'denied'
        });
      }
    }
  },

  // Helper: Add message to session
  addMessageToSession: (sessionId: string, message: ChatMessage) => {
    set((state) => ({
      sessions: state.sessions.map((s) => (s.id === sessionId ? { ...s, messages: [...s.messages, message] } : s))
    }));
  },

  // Helper: Update streaming message text
  updateStreamingMessage: (sessionId: string, text: string) => {
    set((state) => ({
      sessions: state.sessions.map((s) => {
        if (s.id !== sessionId) return s;
        const messages = [...s.messages];
        const lastMessage = messages[messages.length - 1];
        if (lastMessage && lastMessage.isStreaming) {
          const blocks = normalizeBlocks(lastMessage.streamingBlocks || lastMessage.content);
          const lastBlock = blocks[blocks.length - 1];
          if (lastBlock && lastBlock.type === 'text') {
            lastBlock.text += text;
          } else {
            blocks.push({ type: 'text', text });
          }
          lastMessage.streamingBlocks = blocks;
          lastMessage.content = blocks;
        }
        return { ...s, messages };
      })
    }));
  },

  upsertToolCall: (sessionId: string, update: ToolCallUpdate) => {
    set((state) => ({
      sessions: state.sessions.map((s) => {
        if (s.id !== sessionId) return s;
        const messages = [...s.messages];
        const lastMessage = messages[messages.length - 1];
        if (lastMessage && lastMessage.isStreaming) {
          const blocks = normalizeBlocks(lastMessage.streamingBlocks || lastMessage.content);
          const matchIndex = blocks.findIndex((block) =>
            block.type === 'tool_call' && update.toolUseId
              ? block.toolUseId === update.toolUseId
              : block.type === 'tool_call' &&
                block.toolName === update.toolName &&
                JSON.stringify(block.toolInput) === JSON.stringify(update.toolInput)
          );

          if (matchIndex >= 0) {
            const existing = blocks[matchIndex] as Extract<ChatContentBlock, { type: 'tool_call' }>;
            blocks[matchIndex] = {
              ...existing,
              toolUseId: update.toolUseId || existing.toolUseId,
              toolName: existing.toolName || update.toolName,
              toolInput: Object.keys(existing.toolInput || {}).length ? existing.toolInput : update.toolInput,
              permissionStatus: update.permissionStatus || existing.permissionStatus,
              result: update.result || existing.result
            };
          } else {
            blocks.push({
              type: 'tool_call',
              toolUseId: update.toolUseId,
              toolName: update.toolName,
              toolInput: update.toolInput,
              permissionStatus: update.permissionStatus,
              result: update.result
            });
          }

          lastMessage.streamingBlocks = blocks;
          lastMessage.content = blocks;
        }
        return { ...s, messages };
      })
    }));
  },

  // Helper: Finalize streaming message
  finalizeStreamingMessage: (sessionId: string) => {
    set((state) => ({
      sessions: state.sessions.map((s) => {
        if (s.id !== sessionId) return s;
        const messages = [...s.messages];
        const lastMessage = messages[messages.length - 1];
        if (lastMessage && lastMessage.isStreaming) {
          lastMessage.isStreaming = false;
          const blocks = normalizeBlocks(lastMessage.streamingBlocks || lastMessage.content);
          lastMessage.content = blocks;
          delete lastMessage.streamingBlocks;
        }
        return { ...s, messages };
      })
    }));
  }
}));

function normalizeBlocks(content: string | ChatContentBlock[] | undefined): ChatContentBlock[] {
  if (!content) return [];
  if (Array.isArray(content)) return [...content];
  try {
    const parsed = JSON.parse(content) as unknown;
    if (Array.isArray(parsed)) {
      return parsed as ChatContentBlock[];
    }
    if (typeof parsed === 'string') {
      return [{ type: 'text', text: parsed }];
    }
  } catch {
    return [{ type: 'text', text: content }];
  }
  return [{ type: 'text', text: content }];
}

// Setup stream event listener (call once on app init)
export function setupChatStreamListener() {
  const teardownStream = window.api.chat.onStream((sessionId, event) => {
    useChatStore.getState().handleStreamEvent(sessionId, event);
  });

  const teardownTitle = window.api.chat.onTitleUpdated((sessionId, newTitle) => {
    useChatStore.setState((state) => ({
      sessions: state.sessions.map((s) => (s.id === sessionId ? { ...s, name: newTitle } : s))
    }));
  });

  return () => {
    teardownStream();
    teardownTitle();
  };
}
