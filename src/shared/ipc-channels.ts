/**
 * IPC channel constants
 * Shared between main and renderer processes
 */
export const IPC_CHANNELS = {
  // Chat operations
  CHAT_SEND: 'chat:send',
  CHAT_STREAM: 'chat:stream',
  CHAT_PERMISSION_RESPONSE: 'chat:permission-response',
  CHAT_SET_PERMISSION_MODE: 'chat:set-permission-mode',
  CHAT_ABORT: 'chat:abort',

  // Session management
  SESSIONS_CREATE: 'sessions:create',
  SESSIONS_LIST: 'sessions:list',
  SESSIONS_GET: 'sessions:get',
  SESSIONS_DELETE: 'sessions:delete',
  SESSIONS_UPDATE: 'sessions:update',
  SESSIONS_GET_MESSAGES: 'sessions:messages',

  // Workspace operations
  WORKSPACE_SELECT: 'workspace:select',
  WORKSPACE_GET_CURRENT: 'workspace:get-current',
  WORKSPACE_GET_FILE_TREE: 'workspace:file-tree',
  WORKSPACE_GET_FILE_CONTENT: 'workspace:file-content',
  WORKSPACE_FILE_CHANGED: 'workspace:file-changed',

  // Settings & Providers
  SETTINGS_PROVIDERS_LIST: 'settings:providers:list',
  SETTINGS_PROVIDERS_CREATE: 'settings:providers:create',
  SETTINGS_PROVIDERS_UPDATE: 'settings:providers:update',
  SETTINGS_PROVIDERS_DELETE: 'settings:providers:delete',
  SETTINGS_PROVIDERS_ACTIVATE: 'settings:providers:activate',
  SETTINGS_PROVIDERS_GET_ACTIVE: 'settings:providers:get-active',
  SETTINGS_SYNC_TO_FILE: 'settings:sync-to-file',

  // Skills management
  SKILLS_LIST: 'skills:list',
  SKILLS_GET: 'skills:get',
  SKILLS_CREATE: 'skills:create',
  SKILLS_UPDATE: 'skills:update',
  SKILLS_DELETE: 'skills:delete',
  SKILLS_CHANGED: 'skills:changed',

  // Commands management
  COMMANDS_LIST: 'commands:list',
  COMMANDS_GET: 'commands:get',
  COMMANDS_CREATE: 'commands:create',
  COMMANDS_DELETE: 'commands:delete',
  COMMANDS_CHANGED: 'commands:changed',

  // MCP servers
  MCP_GET_CONFIG: 'mcp:get-config',
  MCP_UPDATE_CONFIG: 'mcp:update-config',

  // Utility
  SELECT_DIRECTORY: 'dialog:select-directory',
} as const

export type IPCChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS]
