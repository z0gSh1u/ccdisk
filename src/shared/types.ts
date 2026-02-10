/**
 * Shared types between main and renderer processes
 */

// Permission modes
export type PermissionMode = 'prompt' | 'acceptEdits' | 'bypassPermissions'

// Stream events from Claude SDK
export type StreamEvent =
  | { type: 'text'; data: string }
  | { type: 'tool_use'; data: ToolUseData }
  | { type: 'tool_result'; data: ToolResultData }
  | { type: 'tool_output'; data: string }
  | { type: 'permission_request'; data: PermissionRequest }
  | { type: 'result'; data: ResultData }
  | { type: 'error'; data: string }
  | { type: 'status'; data: StatusData }
  | { type: 'done'; data: string }

export interface ToolUseData {
  id: string
  name: string
  input: Record<string, unknown>
}

export interface ToolResultData {
  tool_use_id: string
  content: string
  is_error: boolean
}

export interface PermissionRequest {
  permissionRequestId: string
  toolName: string
  toolInput: Record<string, unknown>
  suggestions?: Array<{ label: string; input: Record<string, unknown> }>
  decisionReason?: string
  blockedPath?: string
  toolUseId?: string
  description?: string
}

export interface TokenUsage {
  input_tokens: number
  output_tokens: number
  cache_read_input_tokens?: number
  cache_creation_input_tokens?: number
  cost_usd?: number
}

export interface ResultData {
  subtype?: string
  is_error?: boolean
  num_turns?: number
  duration_ms?: number
  usage?: TokenUsage
  session_id?: string
}

export interface StatusData {
  session_id?: string
  model?: string
  tools?: Array<{ name: string }>
  notification?: boolean
  title?: string
  message?: string
}

// Session types
export interface Session {
  id: string
  name: string
  sdkSessionId: string | null
  model: string | null
  createdAt: Date
  updatedAt: Date
}

export interface Message {
  id: string
  sessionId: string
  role: 'user' | 'assistant' | 'system'
  content: string // JSON serialized content blocks
  tokenUsage: string | null // JSON serialized TokenUsage
  createdAt: Date
}

// Provider types
export interface Provider {
  id: string
  name: string
  apiKey: string
  baseUrl: string | null
  extraEnv: string | null // JSON object
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

// File tree types
export interface FileNode {
  name: string
  path: string
  type: 'file' | 'directory'
  children?: FileNode[]
}

// MCP server types
export type MCPServerType = 'stdio' | 'sse' | 'http'

export interface MCPStdioConfig {
  type: 'stdio'
  command: string
  args?: string[]
  env?: Record<string, string>
}

export interface MCPSSEConfig {
  type: 'sse'
  url: string
  headers?: Record<string, string>
}

export interface MCPHttpConfig {
  type: 'http'
  url: string
  headers?: Record<string, string>
}

export type MCPServerConfig = MCPStdioConfig | MCPSSEConfig | MCPHttpConfig

export interface MCPConfig {
  mcpServers: Record<string, MCPServerConfig>
}

// Skills types
export interface Skill {
  name: string
  content: string
  scope: 'global' | 'workspace'
  path: string
}

// Commands types
export interface Command {
  name: string
  path: string
  scope: 'global' | 'workspace'
  isExecutable: boolean
}

// File attachment types
export interface FileAttachment {
  name: string
  type: string
  size: number
  data: string // base64 encoded
}

// IPC Response wrapper
export interface IPCResponse<T = unknown> {
  success: boolean
  data?: T
  error?: string
}
