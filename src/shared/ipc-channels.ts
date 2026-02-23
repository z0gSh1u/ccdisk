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
  CHAT_TITLE_UPDATED: 'chat:title-updated',

  // Session management
  SESSIONS_CREATE: 'sessions:create',
  SESSIONS_LIST: 'sessions:list',
  SESSIONS_GET: 'sessions:get',
  SESSIONS_DELETE: 'sessions:delete',
  SESSIONS_UPDATE: 'sessions:update',
  SESSIONS_GET_MESSAGES: 'sessions:messages',

  // Workspace operations
  WORKSPACE_GET_CURRENT: 'workspace:get-current',
  WORKSPACE_OPEN_IN_EXPLORER: 'workspace:open-in-explorer',
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
  MCP_GET_CONFIG_BY_SCOPE: 'mcp:get-config-by-scope',
  MCP_UPDATE_CONFIG: 'mcp:update-config',

  // Claude env config (replaces provider system)
  SETTINGS_GET_CLAUDE_ENV: 'settings:get-claude-env',
  SETTINGS_UPDATE_CLAUDE_ENV: 'settings:update-claude-env',

  // Generic settings key/value
  SETTINGS_GET: 'settings:get',
  SETTINGS_SET: 'settings:set',

  // Open external URL
  UTIL_OPEN_EXTERNAL: 'util:open-external',

  // SDK commands (requires active session)
  SDK_GET_COMMANDS: 'sdk:get-commands',

  // Disk management
  DISK_LIST: 'disk:list',
  DISK_GET: 'disk:get',
  DISK_GET_CURRENT: 'disk:get-current',
  DISK_SWITCH: 'disk:switch',
  DISK_CREATE: 'disk:create',
  DISK_UPDATE: 'disk:update',
  DISK_DELETE: 'disk:delete',
  DISK_DUPLICATE: 'disk:duplicate',
  DISK_SWITCHED: 'disk:switched',
  DISK_LIST_POOL_SKILLS: 'disk:list-pool-skills',
  DISK_LIST_POOL_COMMANDS: 'disk:list-pool-commands',
  DISK_LIST_POOL_MCP: 'disk:list-pool-mcp'
} as const;

export type IPCChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];
