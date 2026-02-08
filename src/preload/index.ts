import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import { IPC_CHANNELS } from '../shared/ipc-channels'
import type {
  Session,
  Message,
  Provider,
  FileNode,
  Skill,
  Command,
  MCPConfig,
  PermissionMode,
  StreamEvent,
  IPCResponse,
  FileAttachment
} from '../shared/types'

// Custom APIs for renderer
const api = {
  // Chat operations
  chat: {
    sendMessage: (sessionId: string, message: string, files?: FileAttachment[]) =>
      ipcRenderer.invoke(IPC_CHANNELS.CHAT_SEND, sessionId, message, files),
    onStream: (callback: (event: StreamEvent) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: StreamEvent) => callback(data)
      ipcRenderer.on(IPC_CHANNELS.CHAT_STREAM, handler)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.CHAT_STREAM, handler)
    },
    respondPermission: (requestId: string, approved: boolean, input?: Record<string, unknown>) =>
      ipcRenderer.invoke(IPC_CHANNELS.CHAT_PERMISSION_RESPONSE, requestId, approved, input),
    setPermissionMode: (mode: PermissionMode) =>
      ipcRenderer.invoke(IPC_CHANNELS.CHAT_SET_PERMISSION_MODE, mode),
    abort: (sessionId: string) => ipcRenderer.invoke(IPC_CHANNELS.CHAT_ABORT, sessionId)
  },

  // Session management
  sessions: {
    create: (workspacePath: string, name: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.SESSIONS_CREATE, workspacePath, name),
    list: (): Promise<IPCResponse<Session[]>> => ipcRenderer.invoke(IPC_CHANNELS.SESSIONS_LIST),
    get: (sessionId: string): Promise<IPCResponse<Session>> =>
      ipcRenderer.invoke(IPC_CHANNELS.SESSIONS_GET, sessionId),
    update: (sessionId: string, data: Partial<Session>) =>
      ipcRenderer.invoke(IPC_CHANNELS.SESSIONS_UPDATE, sessionId, data),
    delete: (sessionId: string) => ipcRenderer.invoke(IPC_CHANNELS.SESSIONS_DELETE, sessionId),
    getMessages: (sessionId: string): Promise<IPCResponse<Message[]>> =>
      ipcRenderer.invoke(IPC_CHANNELS.SESSIONS_GET_MESSAGES, sessionId)
  },

  // Workspace operations
  workspace: {
    select: (path: string): Promise<IPCResponse<void>> =>
      ipcRenderer.invoke(IPC_CHANNELS.WORKSPACE_SELECT, path),
    getCurrent: (): Promise<IPCResponse<string>> =>
      ipcRenderer.invoke(IPC_CHANNELS.WORKSPACE_GET_CURRENT),
    getFileTree: (): Promise<IPCResponse<FileNode[]>> =>
      ipcRenderer.invoke(IPC_CHANNELS.WORKSPACE_GET_FILE_TREE),
    getFileContent: (
      path: string
    ): Promise<IPCResponse<{ content: string; size: number; type: string }>> =>
      ipcRenderer.invoke(IPC_CHANNELS.WORKSPACE_GET_FILE_CONTENT, path),
    onFileChange: (callback: (event: { path: string; type: string }) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: { path: string; type: string }) =>
        callback(data)
      ipcRenderer.on(IPC_CHANNELS.WORKSPACE_FILE_CHANGED, handler)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.WORKSPACE_FILE_CHANGED, handler)
    }
  },

  // Settings & Providers
  settings: {
    getProviders: (): Promise<IPCResponse<Provider[]>> =>
      ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_PROVIDERS_LIST),
    createProvider: (provider: Omit<Provider, 'id' | 'createdAt' | 'updatedAt'>) =>
      ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_PROVIDERS_CREATE, provider),
    updateProvider: (id: string, provider: Partial<Provider>) =>
      ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_PROVIDERS_UPDATE, id, provider),
    deleteProvider: (id: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_PROVIDERS_DELETE, id),
    activateProvider: (id: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_PROVIDERS_ACTIVATE, id),
    getActiveProvider: (): Promise<IPCResponse<Provider>> =>
      ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_PROVIDERS_GET_ACTIVE),
    syncToFile: (providerId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_SYNC_TO_FILE, providerId)
  },

  // Skills management
  skills: {
    list: (scope: 'global' | 'workspace'): Promise<IPCResponse<Skill[]>> =>
      ipcRenderer.invoke(IPC_CHANNELS.SKILLS_LIST, scope),
    get: (name: string, scope: 'global' | 'workspace'): Promise<IPCResponse<Skill>> =>
      ipcRenderer.invoke(IPC_CHANNELS.SKILLS_GET, name, scope),
    create: (name: string, content: string, scope: 'global' | 'workspace') =>
      ipcRenderer.invoke(IPC_CHANNELS.SKILLS_CREATE, name, content, scope),
    update: (name: string, content: string, scope: 'global' | 'workspace') =>
      ipcRenderer.invoke(IPC_CHANNELS.SKILLS_UPDATE, name, content, scope),
    delete: (name: string, scope: 'global' | 'workspace') =>
      ipcRenderer.invoke(IPC_CHANNELS.SKILLS_DELETE, name, scope),
    onSkillsChange: (callback: () => void) => {
      const handler = () => callback()
      ipcRenderer.on(IPC_CHANNELS.SKILLS_CHANGED, handler)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.SKILLS_CHANGED, handler)
    }
  },

  // Commands management
  commands: {
    list: (scope: 'global' | 'workspace'): Promise<IPCResponse<Command[]>> =>
      ipcRenderer.invoke(IPC_CHANNELS.COMMANDS_LIST, scope),
    get: (name: string, scope: 'global' | 'workspace'): Promise<IPCResponse<Command>> =>
      ipcRenderer.invoke(IPC_CHANNELS.COMMANDS_GET, name, scope),
    create: (name: string, content: string, scope: 'global' | 'workspace') =>
      ipcRenderer.invoke(IPC_CHANNELS.COMMANDS_CREATE, name, content, scope),
    delete: (name: string, scope: 'global' | 'workspace') =>
      ipcRenderer.invoke(IPC_CHANNELS.COMMANDS_DELETE, name, scope),
    onCommandsChange: (callback: () => void) => {
      const handler = () => callback()
      ipcRenderer.on(IPC_CHANNELS.COMMANDS_CHANGED, handler)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.COMMANDS_CHANGED, handler)
    }
  },

  // MCP servers
  mcp: {
    getConfig: (scope: 'global' | 'workspace'): Promise<IPCResponse<MCPConfig>> =>
      ipcRenderer.invoke(IPC_CHANNELS.MCP_GET_CONFIG, scope),
    updateConfig: (config: MCPConfig, scope: 'global' | 'workspace') =>
      ipcRenderer.invoke(IPC_CHANNELS.MCP_UPDATE_CONFIG, config, scope)
  },

  // Utility
  selectDirectory: (): Promise<string | null> => ipcRenderer.invoke(IPC_CHANNELS.SELECT_DIRECTORY)
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
