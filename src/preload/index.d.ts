import { ElectronAPI } from '@electron-toolkit/preload'
import type {
  Session,
  Message,
  Provider,
  FileNode,
  Skill,
  Command,
  MCPConfig,
  MCPServerStatus,
  SlashCommand,
  PermissionMode,
  StreamEvent,
  IPCResponse,
  FileAttachment,
  FileContentResponse
} from '../shared/types'

interface API {
  chat: {
    sendMessage: (
      sessionId: string,
      message: string,
      files?: FileAttachment[]
    ) => Promise<IPCResponse<void>>
    onStream: (callback: (sessionId: string, event: StreamEvent) => void) => () => void
    respondPermission: (
      requestId: string,
      approved: boolean,
      input?: Record<string, unknown>
    ) => Promise<IPCResponse<void>>
    setPermissionMode: (mode: PermissionMode) => Promise<IPCResponse<void>>
    abort: (sessionId: string) => Promise<IPCResponse<void>>
  }
  sessions: {
    create: (name: string) => Promise<IPCResponse<Session>>
    list: () => Promise<IPCResponse<Session[]>>
    get: (sessionId: string) => Promise<IPCResponse<Session>>
    update: (sessionId: string, data: Partial<Session>) => Promise<IPCResponse<void>>
    delete: (sessionId: string) => Promise<IPCResponse<void>>
    getMessages: (sessionId: string) => Promise<IPCResponse<Message[]>>
  }
  workspace: {
    getCurrent: () => Promise<IPCResponse<string>>
    openInExplorer: () => Promise<IPCResponse<void>>
    getFileTree: () => Promise<IPCResponse<FileNode[]>>
    getFileContent: (path: string) => Promise<IPCResponse<FileContentResponse>>
    onFileChange: (callback: (event: { path: string; type: string }) => void) => () => void
  }
  settings: {
    getProviders: () => Promise<IPCResponse<Provider[]>>
    createProvider: (
      provider: Omit<Provider, 'id' | 'createdAt' | 'updatedAt'>
    ) => Promise<IPCResponse<Provider>>
    updateProvider: (id: string, provider: Partial<Provider>) => Promise<IPCResponse<void>>
    deleteProvider: (id: string) => Promise<IPCResponse<void>>
    activateProvider: (id: string) => Promise<IPCResponse<void>>
    getActiveProvider: () => Promise<IPCResponse<Provider>>
    syncToFile: (providerId: string) => Promise<IPCResponse<void>>
    getClaudeEnv: () => Promise<IPCResponse<Record<string, string>>>
    updateClaudeEnv: (envUpdates: Record<string, string>) => Promise<IPCResponse<void>>
  }
  skills: {
    list: () => Promise<IPCResponse<Skill[]>>
    get: (name: string, scope: 'global' | 'workspace') => Promise<IPCResponse<Skill>>
    create: (
      name: string,
      content: string,
      scope: 'global' | 'workspace'
    ) => Promise<IPCResponse<void>>
    update: (
      name: string,
      content: string,
      scope: 'global' | 'workspace'
    ) => Promise<IPCResponse<void>>
    delete: (name: string, scope: 'global' | 'workspace') => Promise<IPCResponse<void>>
    onSkillsChange: (callback: () => void) => () => void
  }
  commands: {
    list: () => Promise<IPCResponse<Command[]>>
    get: (
      name: string,
      scope: 'global' | 'workspace'
    ) => Promise<IPCResponse<{ command: Command; content: string }>>
    create: (
      name: string,
      content: string,
      scope: 'global' | 'workspace'
    ) => Promise<IPCResponse<void>>
    delete: (name: string, scope: 'global' | 'workspace') => Promise<IPCResponse<void>>
    onCommandsChange: (callback: () => void) => () => void
  }
  mcp: {
    getConfig: () => Promise<IPCResponse<MCPConfig>>
    getConfigByScope: (scope: 'global' | 'workspace') => Promise<IPCResponse<MCPConfig>>
    updateConfig: (config: MCPConfig, scope: 'global' | 'workspace') => Promise<IPCResponse<void>>
  }
  sdk: {
    getMcpStatus: (sessionId: string) => Promise<IPCResponse<MCPServerStatus[] | null>>
    reconnectMcpServer: (sessionId: string, serverName: string) => Promise<IPCResponse<boolean>>
    toggleMcpServer: (
      sessionId: string,
      serverName: string,
      enabled: boolean
    ) => Promise<IPCResponse<boolean>>
    getCommands: (sessionId: string) => Promise<IPCResponse<SlashCommand[] | null>>
  }
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: API
  }
}
