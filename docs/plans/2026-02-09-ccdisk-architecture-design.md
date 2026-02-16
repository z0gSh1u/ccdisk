# CCDisk Architecture Design

**Date:** 2026-02-09  
**Project:** CCDisk - Claude Code Desktop GUI  
**Tech Stack:** Electron + electron-vite + React 18 + Claude Agent SDK

---

## Overview

CCDisk is a native desktop application for macOS that provides a complete GUI for Claude Code CLI. It maps all CLI capabilities to a visual interface using Electron with pure IPC communication (no HTTP server).

### Core Principles

- **Workspace-first**: User selects a workspace directory on launch; all operations are scoped to that workspace
- **Pure Electron IPC**: No embedded HTTP server; all communication via IPC channels
- **File-based configuration**: Skills, Commands, and settings follow Claude Code's file structure
- **Provider abstraction**: GUI manages multiple API providers, syncs active provider to `~/.claude/settings.json`
- **Full CLI compatibility**: Supports all Claude Code features via Agent SDK

---

## Project Structure (electron-vite convention)

```
ccdisk/
├── src/
│   ├── shared/                    # Shared between main and renderer
│   │   ├── ipc-channels.ts       # IPC channel constants
│   │   └── types.ts              # Shared TypeScript types
│   │
│   ├── main/                      # Main process
│   │   ├── index.ts              # Entry point, window creation
│   │   ├── db/
│   │   │   └── schema.ts         # Drizzle ORM schema
│   │   ├── ipc/                  # IPC handlers
│   │   │   ├── chat-handler.ts
│   │   │   ├── workspace-handler.ts
│   │   │   ├── settings-handler.ts
│   │   │   ├── skills-handler.ts
│   │   │   └── commands-handler.ts
│   │   ├── services/
│   │   │   ├── claude-service.ts     # Claude SDK wrapper
│   │   │   ├── db-service.ts         # Drizzle ORM operations
│   │   │   ├── file-watcher.ts       # Chokidar file watching
│   │   │   ├── config-service.ts     # settings.json management
│   │   │   ├── skills-service.ts     # Skills file operations
│   │   │   ├── commands-service.ts   # Commands file operations
│   │   │   └── mcp-service.ts        # MCP config management
│   │   └── types.ts                  # Main process types
│   │
│   ├── preload/
│   │   └── index.ts              # Context bridge API
│   │
│   └── renderer/
│       ├── src/
│       │   ├── App.tsx           # Root component
│       │   ├── components/
│       │   │   ├── chat/         # Chat UI components
│       │   │   ├── workspace/    # File tree, preview
│       │   │   ├── settings/     # Settings, providers
│       │   │   ├── extensions/   # Skills, Commands, MCP
│       │   │   └── ui/           # Radix UI primitives
│       │   ├── stores/           # Zustand stores
│       │   │   ├── chat.ts
│       │   │   ├── workspace.ts
│       │   │   └── settings.ts
│       │   └── types/            # Renderer types
│       └── index.html            # HTML entry
│
├── resources/
│   └── claude-code/
│       └── claude.js             # Bundled Claude Code CLI (Node.js script)
│
├── electron.vite.config.ts       # Vite config
├── package.json
└── tsconfig.json
```

---

## Tech Stack

### Core Dependencies

```json
{
  "dependencies": {
    "@anthropic-ai/claude-agent-sdk": "^0.2.33",
    "better-sqlite3": "^12.x",
    "drizzle-orm": "^0.36.x",
    "chokidar": "^3.x",
    "zustand": "^4.x",
    "react": "^18.x",
    "react-dom": "^18.x",
    "@radix-ui/react-*": "latest",
    "tailwindcss": "^4.x",
    "shiki": "^3.x"
  },
  "devDependencies": {
    "electron": "^40.x",
    "electron-vite": "^2.x",
    "typescript": "^5.x",
    "drizzle-kit": "^0.31.x",
    "@types/better-sqlite3": "^7.x"
  }
}
```

### Framework Choices

- **electron-vite**: Build tool with HMR for Electron
- **React 18**: UI framework
- **TypeScript**: Type safety (minimize `any` usage)
- **Tailwind CSS**: Styling
- **Radix UI**: Accessible component primitives
- **Zustand**: Client-side state management
- **Drizzle ORM**: Type-safe SQLite operations
- **Chokidar**: File system watching
- **Shiki**: Syntax highlighting

---

## Architecture Pattern: Pure Electron IPC

### Communication Flow

```
┌─────────────┐         IPC          ┌─────────────┐      SDK       ┌──────────────┐
│  Renderer   │◄──────────────────►  │  Main       │◄──────────────►│ Claude SDK   │
│  (React UI) │    invoke/on        │  Process    │   query()      │  (Node.js)   │
└─────────────┘                      └─────────────┘                └──────────────┘
      │                                     │
      │                                     │
      ▼                                     ▼
 Zustand Stores                    ┌──────────────────┐
                                   │  Services Layer  │
                                   ├──────────────────┤
                                   │ • Claude         │
                                   │ • Database       │
                                   │ • File Watcher   │
                                   │ • Config         │
                                   │ • Skills/Commands│
                                   └──────────────────┘
                                           │
                                           ▼
                                   ┌──────────────────┐
                                   │ SQLite (Drizzle) │
                                   │ File System      │
                                   └──────────────────┘
```

### IPC Channel Constants

All IPC channels defined in `src/shared/ipc-channels.ts`:

```typescript
export const IPC_CHANNELS = {
  // Chat operations
  CHAT_SEND: 'chat:send',
  CHAT_STREAM: 'chat:stream',
  CHAT_PERMISSION_RESPONSE: 'chat:permission-response',
  CHAT_SET_PERMISSION_MODE: 'chat:set-permission-mode',

  // Session management
  SESSIONS_CREATE: 'sessions:create',
  SESSIONS_LIST: 'sessions:list',
  SESSIONS_GET: 'sessions:get',
  SESSIONS_DELETE: 'sessions:delete',
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
  COMMANDS_CREATE: 'commands:create',
  COMMANDS_DELETE: 'commands:delete',

  // MCP servers
  MCP_GET_CONFIG: 'mcp:get-config',
  MCP_UPDATE_CONFIG: 'mcp:update-config'
} as const;
```

---

## Data Layer: Drizzle ORM + SQLite

### Database Location

- **Path**: `~/.ccdisk/sessions.db`
- **Mode**: WAL (Write-Ahead Logging) for concurrent reads

### Schema (`src/main/db/schema.ts`)

```typescript
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  workspacePath: text('workspace_path').notNull(),
  name: text('name').notNull(),
  sdkSessionId: text('sdk_session_id'),
  model: text('model'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull()
});

export const messages = sqliteTable('messages', {
  id: text('id').primaryKey(),
  sessionId: text('session_id')
    .notNull()
    .references(() => sessions.id, { onDelete: 'cascade' }),
  role: text('role', { enum: ['user', 'assistant', 'system'] }).notNull(),
  content: text('content').notNull(), // JSON serialized
  tokenUsage: text('token_usage'), // JSON serialized
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull()
});

export const providers = sqliteTable('providers', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  apiKey: text('api_key').notNull(),
  baseUrl: text('base_url'),
  extraEnv: text('extra_env'), // JSON object
  isActive: integer('is_active', { mode: 'boolean' }).default(false),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull()
});

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull()
});
```

### Database Service

```typescript
class DatabaseService {
  private db: ReturnType<typeof drizzle>

  // Sessions CRUD
  async createSession(session: typeof schema.sessions.$inferInsert)
  async getSession(id: string)
  async listSessions()
  async updateSession(id: string, data: Partial<...>)
  async deleteSession(id: string)

  // Messages CRUD
  async createMessage(message: typeof schema.messages.$inferInsert)
  async getMessages(sessionId: string)

  // Providers CRUD
  async createProvider(provider: typeof schema.providers.$inferInsert)
  async listProviders()
  async getActiveProvider()
  async activateProvider(id: string)
  async updateProvider(id: string, data: Partial<...>)
  async deleteProvider(id: string)

  // Settings CRUD
  async getSetting(key: string)
  async setSetting(key: string, value: string)
}
```

---

## Claude SDK Integration

### Service Architecture

**Claude Service** (`src/main/services/claude-service.ts`):

```typescript
class ClaudeService {
  // Send message and stream responses via IPC
  async sendMessage(sessionId: string, message: string, files?: File[]);

  // Resume existing SDK session
  async resumeSession(sdkSessionId: string, message: string);

  // Handle permission requests (canUseTool hook)
  async requestPermission(toolName: string, input: any, suggestions: string[]);

  // Abort ongoing operation
  abortSession(sessionId: string);
}
```

### Stream Event Flow

```
Renderer                Main Process              Claude SDK
   │                         │                        │
   │──sendMessage()─────────►│                        │
   │                         │──query()──────────────►│
   │                         │                        │
   │                         │◄─stream_event─────────│
   │◄─CHAT_STREAM────────────│   (text delta)         │
   │  (type: 'text')         │                        │
   │                         │                        │
   │                         │◄─assistant─────────────│
   │◄─CHAT_STREAM────────────│   (tool_use)           │
   │  (type: 'tool_use')     │                        │
   │                         │                        │
   │                         │◄─user──────────────────│
   │◄─CHAT_STREAM────────────│   (tool_result)        │
   │  (type: 'tool_result')  │                        │
   │                         │                        │
   │                         │◄─result────────────────│
   │◄─CHAT_STREAM────────────│   (done, tokens)       │
   │  (type: 'result')       │                        │
```

### Stream Event Types

```typescript
export type StreamEvent =
  | { type: 'text'; data: string }
  | { type: 'tool_use'; data: { id: string; name: string; input: any } }
  | { type: 'tool_result'; data: { tool_use_id: string; content: string; is_error: boolean } }
  | { type: 'tool_output'; data: string } // stderr from Claude Code subprocess
  | { type: 'permission_request'; data: PermissionRequest }
  | { type: 'result'; data: { usage: TokenUsage; session_id: string } }
  | { type: 'error'; data: string }
  | { type: 'status'; data: { session_id?: string; model?: string } };
```

### Permission Handling

**Flow:**

1. Claude SDK calls `canUseTool` hook
2. Main process generates `permissionRequestId`
3. Sends `permission_request` stream event to renderer
4. Creates Promise stored in Map
5. Returns Promise (blocks SDK)
6. Renderer shows permission bubble with Approve/Deny
7. User responds via `CHAT_PERMISSION_RESPONSE` IPC
8. Promise resolves with decision
9. SDK continues execution

**Permission Modes:**

- `prompt`: Ask for every tool use
- `acceptEdits`: Auto-approve most tools, prompt for destructive ones
- `bypassPermissions`: Skip all prompts (dangerous)

---

## File Management & Configuration

### Directory Structure

**Global Configuration** (`~/.claude/`):

```
~/.claude/
├── settings.json           # Synced by active provider
├── skills/                 # Global skills (*.md files)
│   ├── skill-1.md
│   └── skill-2.md
├── commands/               # Global commands (executables)
│   ├── command-1.sh
│   └── command-2.js
└── mcp.json               # Global MCP servers config
```

**Workspace Configuration** (`<workspace>/`):

```
<workspace>/
├── .claude/
│   ├── skills/            # Workspace-specific skills
│   ├── commands/          # Workspace-specific commands
│   └── mcp.json          # Workspace MCP servers
└── .codepilot-uploads/   # Temporary file uploads (auto-created)
```

**App Data** (`~/.ccdisk/`):

```
~/.ccdisk/
└── sessions.db           # SQLite database
```

### Skills Management

**Files:** Markdown files with frontmatter in `~/.claude/skills/` or `<workspace>/.claude/skills/`

**Operations:**

- List: Read both directories, merge results
- Get: Read specific `.md` file
- Create: Write new `.md` file
- Update: Overwrite existing `.md` file
- Delete: Remove `.md` file
- Watch: Chokidar monitors both directories

### Commands Management

**Files:** Executable scripts in `~/.claude/commands/` or `<workspace>/.claude/commands/`

**Operations:**

- List: Read executable files from both scopes
- Create: Write file with executable permissions (`chmod +x`)
- Delete: Remove file
- Validate: Check file is executable

### MCP Servers Management

**Files:** JSON config in `~/.claude/mcp.json` or `<workspace>/.claude/mcp.json`

**Operations:**

- Get config: Parse JSON from both files
- Update config: Validate and write JSON
- Merge: Workspace config overrides global
- Pass to SDK: Via `mcpServers` option in `query()`

**Config Format:**

```json
{
  "mcpServers": {
    "filesystem": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path"]
    },
    "github": {
      "type": "sse",
      "url": "https://api.github.com/mcp",
      "headers": { "Authorization": "token ..." }
    }
  }
}
```

### Settings.json Management

**Provider Sync Flow:**

1. User creates/edits provider in GUI
2. Saves to SQLite database
3. User clicks "Activate" button
4. Config service reads active provider
5. Writes env vars to `~/.claude/settings.json`:
   ```json
   {
     "env": {
       "ANTHROPIC_AUTH_TOKEN": "...",
       "ANTHROPIC_BASE_URL": "...",
       "ANTHROPIC_MODEL": "..."
     }
   }
   ```
6. Preserves other settings when writing

**Environment Variables Mapped:**

- `ANTHROPIC_AUTH_TOKEN`
- `ANTHROPIC_BASE_URL`
- `ANTHROPIC_DEFAULT_HAIKU_MODEL`
- `ANTHROPIC_DEFAULT_OPUS_MODEL`
- `ANTHROPIC_DEFAULT_SONNET_MODEL`
- `ANTHROPIC_MODEL`

---

## UI Component Structure

### Main Layout

```
App.tsx
├── WorkspaceSelector (shown when no workspace)
└── MainLayout (after workspace selected)
    ├── LeftSidebar
    │   ├── NavRail (icons: Chat, Extensions, Settings)
    │   └── SessionList (chat sessions)
    ├── CenterPanel
    │   ├── ChatHeader (session name, model selector)
    │   ├── MessageList (scrollable messages)
    │   │   ├── UserMessage
    │   │   ├── AssistantMessage
    │   │   │   ├── TextBlock
    │   │   │   ├── ToolUseBlock
    │   │   │   └── ToolResultBlock
    │   │   └── PermissionRequestBubble (inline)
    │   └── MessageInput (textarea + file upload + send)
    └── RightPanel
        ├── PermissionModeSelector (dropdown)
        ├── PermissionHistory (session-scoped list)
        ├── FileTree (workspace files, read-only)
        └── FilePreview (syntax highlighted)
```

### Extensions Page

```
ExtensionsLayout
├── Tabs (Skills | Commands | MCP Servers)
├── SkillsManager
│   ├── ScopeSelector (Global / Workspace)
│   ├── SkillsList
│   └── SkillEditor (Markdown editor)
├── CommandsManager
│   ├── ScopeSelector
│   ├── CommandsList
│   └── CommandEditor (text editor)
└── MCPManager
    ├── ScopeSelector
    ├── ServerList
    └── ServerEditor (stdio/sse/http form)
```

### Settings Page

```
SettingsLayout
├── Tabs (Providers | App Settings)
├── ProvidersManager
│   ├── ProviderList (with active badge)
│   ├── CreateProviderDialog
│   └── EditProviderForm
│       ├── Name (text input)
│       ├── API Key (password input)
│       ├── Base URL (text input, optional)
│       ├── Extra Env (JSON editor)
│       └── Activate Button (syncs to settings.json)
└── AppSettings
    └── WorkspacePath (change workspace)
```

---

## State Management: Zustand

### Chat Store

```typescript
interface ChatStore {
  sessions: Session[];
  currentSessionId: string | null;
  messages: Record<string, Message[]>;
  isStreaming: boolean;
  permissionMode: PermissionMode;
  pendingPermissions: PermissionRequest[];

  // Actions
  loadSessions: () => Promise<void>;
  createSession: (name: string) => Promise<void>;
  selectSession: (id: string) => Promise<void>;
  deleteSession: (id: string) => Promise<void>;
  sendMessage: (message: string, files?: File[]) => Promise<void>;
  respondToPermission: (requestId: string, approved: boolean, input?: any) => Promise<void>;
  setPermissionMode: (mode: PermissionMode) => Promise<void>;
}
```

### Workspace Store

```typescript
interface WorkspaceStore {
  workspacePath: string | null;
  fileTree: FileNode[];
  selectedFile: string | null;
  fileContent: string | null;

  // Actions
  selectWorkspace: (path: string) => Promise<void>;
  refreshFileTree: () => Promise<void>;
  selectFile: (path: string) => Promise<void>;
}
```

### Settings Store

```typescript
interface SettingsStore {
  providers: Provider[];
  activeProviderId: string | null;

  // Actions
  loadProviders: () => Promise<void>;
  createProvider: (provider: Omit<Provider, 'id'>) => Promise<void>;
  updateProvider: (id: string, provider: Partial<Provider>) => Promise<void>;
  deleteProvider: (id: string) => Promise<void>;
  activateProvider: (id: string) => Promise<void>;
}
```

---

## File Tree & Preview

### File Tree Implementation

**Ignore Patterns:**

- `.git/`, `node_modules/`, `.ccdisk/`, `.codepilot-uploads/`
- Support `.gitignore` parsing (optional enhancement)
- Limit depth: 5 levels (configurable)

**File Watcher:**

- Watch workspace root with chokidar
- Debounce: 300ms
- Emit `WORKSPACE_FILE_CHANGED` IPC events
- Renderer refreshes tree on event

**Display:**

- Tree structure with expand/collapse
- Icons for file types
- Click to select file for preview
- Read-only (no edit/create/delete)

### File Preview

**Features:**

- Syntax highlighting with Shiki
- Support text files up to 1MB
- Image preview (encode as base64)
- Line numbers
- Copy content button

**Implementation:**

- Renderer calls `WORKSPACE_GET_FILE_CONTENT` IPC
- Main process reads file from disk
- Returns content + metadata (size, type)
- Renderer highlights with Shiki

---

## Key Features Summary

### ✅ Core Features

- **Chat with Claude**: Stream responses in real-time with full message history
- **Session Management**: Create, resume, delete chat sessions
- **Workspace-first**: All operations scoped to selected workspace
- **Permission Control**: Three modes (prompt/acceptEdits/bypassPermissions) with inline approval UI
- **Provider Management**: Multiple API providers with settings.json sync
- **Skills Management**: Create/edit/delete global and workspace skills
- **Commands Management**: Manage executable commands
- **MCP Servers**: Configure stdio/sse/http MCP servers
- **File Tree**: Read-only workspace file browser with preview
- **File Watching**: Real-time updates when workspace files change
- **Token Usage**: Display input/output tokens and cost per message
- **Model Selection**: Switch between Claude models mid-conversation

### 🔒 Security

- No direct file editing from GUI (prevents user/Claude conflicts)
- Permission requests with inline approval
- API keys stored in local SQLite (encrypted recommended)
- Session history stored locally (`~/.ccdisk/`)

### 🎯 Platform

- **Target**: macOS only
- **Distribution**: DMG installer
- **Claude Code**: Bundled as `resources/claude-code/claude.js`

---

## Implementation Considerations

### Type Safety

- Use TypeScript strict mode
- Minimize `any` usage
- Infer types from Drizzle schema: `typeof schema.sessions.$inferInsert`
- Share types between main/renderer via `src/shared/types.ts`

### Error Handling

- Try/catch in all IPC handlers
- Return structured errors: `{ success: false, error: string }`
- Display error toasts in renderer
- Log errors to console in development

### Performance

- Debounce file watcher events (300ms)
- Limit file tree depth (5 levels)
- Limit file preview size (1MB)
- Use WAL mode for SQLite (concurrent reads)
- Stream large responses (don't buffer entire response)

### Testing

- Unit tests for services
- Integration tests for IPC handlers
- E2E tests with Playwright (reference CodePilot's test suite)

---

## Next Steps

1. **Scaffold Project**: `pnpm create @quick-start/electron` (electron-vite)
2. **Install Dependencies**: Add all packages listed above
3. **Setup Database**: Create Drizzle schema, migrations, service
4. **Implement IPC Layer**: Define channels, handlers, preload bridge
5. **Build Services**: Claude, file watcher, config, skills, commands, MCP
6. **Create UI Components**: Layout, chat, workspace, settings, extensions
7. **Integrate SDK**: Implement streaming, permissions, session resumption
8. **Test & Polish**: E2E tests, error handling, UX refinements
9. **Package**: Build DMG for macOS distribution

---

## References

- **CodePilot**: Reference implementation (Next.js + Electron)
- **Claude Agent SDK**: `@anthropic-ai/claude-agent-sdk` v0.2.33
- **electron-vite**: https://electron-vite.org/
- **Drizzle ORM**: https://orm.drizzle.team/
- **Radix UI**: https://www.radix-ui.com/
