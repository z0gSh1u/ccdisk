# Disk (盘片) Feature Design

Date: 2026-02-23

## Overview

Disk is a self-contained "working environment profile" that defines the AI assistant's complete capability set for a specific scenario. Each Disk bundles a curated set of Skills, MCP Servers, Commands, a System Prompt, and a Model Preference. Users can switch Disks to instantly reconfigure the assistant for different tasks (coding, data analysis, writing, etc.), solving the "context pollution" problem where too many loaded tools overwhelm the model.

## Core Concepts

### What is a Disk?

A Disk defines:

- **Skills** — references to skills in the global skill pool
- **MCP Servers** — references to MCP server configs in the global MCP pool
- **Commands** — references to commands in the global command pool
- **System Prompt** — behavioral instructions for the AI (role, style, constraints)
- **Model Preference** — preferred model identifier (e.g., `claude-sonnet-4-20250514`)

### Key Design Decisions

1. **Complete Replacement** — switching Disk fully replaces the active Skills/MCP/Commands; no layering or merging
2. **Global Switch** — Disk is a global setting affecting all new sessions; not per-session
3. **Session belongs to Disk, but globally visible** — sessions are tagged with the Disk they were created under, but all sessions are visible in the sidebar with grouping/labels
4. **Pool + Reference model** — Skills, Commands, and MCP configs live in central pools; Disks only reference them by ID, avoiding duplication
5. **Default Disk is special** — it transparently reads from existing global paths (`~/.claude/skills/`, `~/.claude/commands/`, `~/.claude.json`), ensuring zero migration cost
6. **Pre-installed Disks use community resources** — bundled Disks reference well-known community and official skills (Anthropic, Vercel, Microsoft, Supabase, etc.)

## Architecture

### Directory Structure

```
~/.ccdisk/
├── skills/                      # Global Skill Pool
│   ├── frontend-design/         # from Anthropic
│   │   ├── SKILL.md
│   │   ├── scripts/
│   │   └── templates/
│   ├── react-best-practices/    # from Vercel
│   │   └── SKILL.md
│   ├── csv-data-summarizer/     # from community
│   │   └── SKILL.md
│   ├── docx/                    # from Anthropic
│   │   ├── SKILL.md
│   │   └── scripts/
│   └── ...
│
├── commands/                    # Global Command Pool
│   ├── test.md
│   ├── lint.md
│   ├── analyze.md
│   └── ...
│
├── mcp-servers.json             # Global MCP Server Pool
│
└── disks/                       # Disk Definitions (reference only)
    ├── default/
    │   └── disk.json
    ├── coding/
    │   └── disk.json
    ├── data/
    │   └── disk.json
    ├── writing/
    │   └── disk.json
    └── my-custom-disk/          # user-created
        └── disk.json
```

### disk.json Schema

```typescript
interface DiskDefinition {
  name: string; // Display name
  description: string; // Brief description
  icon: string; // Icon identifier (lucide icon name)
  builtIn: boolean; // Whether this is a pre-installed disk
  isDefault?: boolean; // Only true for the default disk
  systemPrompt: string | null; // System prompt injected into sessions
  model: string | null; // Preferred model identifier
  skills: string[]; // Skill IDs referencing ~/.ccdisk/skills/{id}/
  commands: string[]; // Command IDs referencing ~/.ccdisk/commands/{id}
  mcpServers: string[]; // MCP server IDs referencing keys in mcp-servers.json
}
```

### mcp-servers.json Schema

```json
{
  "filesystem": {
    "type": "stdio",
    "command": "npx",
    "args": ["-y", "@anthropic-ai/mcp-filesystem"]
  },
  "github": {
    "type": "stdio",
    "command": "npx",
    "args": ["-y", "@anthropic-ai/mcp-github"]
  },
  "postgres": {
    "type": "stdio",
    "command": "npx",
    "args": ["-y", "@anthropic-ai/mcp-postgres"]
  }
}
```

### Default Disk — Transparent Pass-through

The Default Disk is special. It does NOT read from `~/.ccdisk/skills/` or `~/.ccdisk/commands/`. Instead, it uses the existing global paths:

| Resource | Default Disk Source                    | Other Disks Source                                                    |
| -------- | -------------------------------------- | --------------------------------------------------------------------- |
| Skills   | `~/.claude/skills/` (existing logic)   | `~/.ccdisk/skills/{id}/` (pool, filtered by disk.json references)     |
| Commands | `~/.claude/commands/` (existing logic) | `~/.ccdisk/commands/{id}` (pool, filtered by disk.json references)    |
| MCP      | `~/.claude.json` (existing logic)      | `~/.ccdisk/mcp-servers.json` (pool, filtered by disk.json references) |

```json
{
  "name": "Default",
  "description": "General purpose mode using your global configuration",
  "icon": "disc",
  "builtIn": true,
  "isDefault": true,
  "systemPrompt": null,
  "model": null,
  "skills": [],
  "commands": [],
  "mcpServers": []
}
```

## Database Changes

### sessions table

Add `diskId` column:

```typescript
// src/main/db/schema.ts
export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  sdkSessionId: text('sdk_session_id'),
  model: text('model'),
  diskId: text('disk_id').default('default'), // NEW
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull()
});
```

### settings table

Store `currentDiskId` as a key-value setting:

```
key: 'currentDiskId'
value: 'coding'
```

## Service Layer

### New: DiskService (`src/main/services/disk-service.ts`)

```typescript
export class DiskService {
  private disksDir: string; // ~/.ccdisk/disks/
  private skillsPoolDir: string; // ~/.ccdisk/skills/
  private commandsPoolDir: string; // ~/.ccdisk/commands/
  private mcpPoolPath: string; // ~/.ccdisk/mcp-servers.json

  // Core operations
  listDisks(): Promise<DiskDefinition[]>;
  getDisk(diskId: string): Promise<DiskDefinition>;
  getCurrentDisk(): Promise<DiskDefinition>;
  switchDisk(diskId: string): Promise<void>;

  // CRUD for custom disks
  createDisk(disk: Omit<DiskDefinition, 'builtIn'>): Promise<DiskDefinition>;
  updateDisk(diskId: string, updates: Partial<DiskDefinition>): Promise<void>;
  deleteDisk(diskId: string): Promise<void>; // fails for builtIn disks
  duplicateDisk(diskId: string, newName: string): Promise<DiskDefinition>;

  // Pool queries (filtered by current disk)
  getActiveSkills(): Promise<SkillInfo[]>;
  getActiveCommands(): Promise<CommandInfo[]>;
  getActiveMCPServers(): Promise<MCPServerConfig>;

  // Pool management
  listPoolSkills(): Promise<SkillInfo[]>;
  listPoolCommands(): Promise<CommandInfo[]>;
  listPoolMCPServers(): Promise<Record<string, MCPServerConfig>>;

  // Initialization
  initialize(): Promise<void>; // creates dirs, writes built-in disks on first run
}
```

### Impact on Existing Services

Existing services (SkillsService, CommandsService, MCPService) **do not need rewriting**. The change is in the IPC/handler layer — when resolving paths, the handler checks the current Disk:

- If `isDefault` → use existing paths (backward compatible)
- Otherwise → use pool paths filtered by Disk references

### New: disk-handler (`src/main/ipc/disk-handler.ts`)

IPC channels to add in `src/shared/ipc-channels.ts`:

```typescript
DISK_LIST: 'disk:list',
DISK_GET: 'disk:get',
DISK_GET_CURRENT: 'disk:get-current',
DISK_SWITCH: 'disk:switch',
DISK_CREATE: 'disk:create',
DISK_UPDATE: 'disk:update',
DISK_DELETE: 'disk:delete',
DISK_DUPLICATE: 'disk:duplicate',
DISK_SWITCHED: 'disk:switched',        // event: notifies renderer of switch
DISK_LIST_POOL_SKILLS: 'disk:list-pool-skills',
DISK_LIST_POOL_COMMANDS: 'disk:list-pool-commands',
DISK_LIST_POOL_MCP: 'disk:list-pool-mcp',
```

### chat-handler Changes

In the message sending flow, before creating/resuming a Claude SDK session:

```typescript
const disk = await diskService.getCurrentDisk();

// 1. System Prompt injection
const session = await claudeService.createSession({
  ...existingParams,
  instructions: disk.systemPrompt || undefined,
  model: disk.model || existingModelConfig
});

// 2. Mention resolution ([/skill:name], [/command:name])
//    reads from disk-aware paths instead of hardcoded global paths
```

### Model Priority (highest to lowest)

1. Disk's `model` field (if set)
2. User's global model config (ClaudeConfigEditor / ANTHROPIC_MODEL env)
3. SDK default

## Disk Switch Flow

```
User clicks new Disk in switcher
  → renderer calls window.api.disk.switch(diskId)
  → DiskService.switchDisk(diskId)
    → 1. Update settings table: currentDiskId = diskId
    → 2. Read new Disk's disk.json
    → 3. Emit DISK_SWITCHED event via webContents.send
  → Renderer receives DISK_SWITCHED
    → 1. disk-store updates currentDisk
    → 2. skills-store reloads (reads disk-aware skills)
    → 3. commands-store reloads (reads disk-aware commands)
    → 4. mcp-store reloads (reads disk-aware MCP config)
    → 5. UI updates (switcher shows new Disk name)
```

Switching does NOT close or clear the current session. Subsequent messages in the session will use the new Disk's toolset.

## UI Design

### Sidebar Top — Disk Switcher

Located at the top of the Sidebar (below the app title area). Compact dropdown showing current Disk icon and name:

```
┌─────────────────────────┐
│  [icon] Coding        ▾ │  ← Current Disk, click to expand
├─────────────────────────┤
│  ○ Default              │  ← Dropdown list
│  ● Coding               │
│  ○ Data                 │
│  ○ Writing              │
│  ───────────────────── │
│  + New Disk             │
│  ⚙ Manage Disks        │  ← Opens SidePanel
└─────────────────────────┘
```

### Session List Grouping

Sessions are tagged with their Disk. In the sidebar session list:

- Sessions belonging to the current Disk display normally
- Sessions from other Disks show with a subtle Disk icon/label and slightly muted style

```
┌─────────────────────────┐
│  [icon] Coding        ▾ │
├─────────────────────────┤
│  + New Session          │
├─────────────────────────┤
│ Today                   │
│  📝 Fix auth bug        │  ← current Disk, normal
│  📝 Refactor API        │
│ Yesterday               │
│  📝 Setup CI/CD         │
│  📝 理财规划      [💿]  │  ← other Disk, muted + label
└─────────────────────────┘
```

### SidePanel — Disk Management

Reuses the existing SidePanel slide-in pattern. New panel type: `disks`.

**Left column**: List of all Disks (built-in + custom)
**Right column**: Disk detail editor

- Name, description, icon selector
- System Prompt textarea
- Model preference selector
- Skills tab: checkboxes of pool skills, checked = referenced by this Disk
- Commands tab: checkboxes of pool commands
- MCP tab: checkboxes of pool MCP servers
- Built-in Disks show "Duplicate as Custom" button (cannot delete built-in)

## Renderer State

### New: disk-store (`src/renderer/src/stores/disk-store.ts`)

```typescript
interface DiskStore {
  // State
  disks: DiskDefinition[];
  currentDisk: DiskDefinition | null;
  isLoading: boolean;

  // Pool state
  poolSkills: SkillInfo[];
  poolCommands: CommandInfo[];
  poolMCPServers: Record<string, MCPServerConfig>;

  // Actions
  loadDisks: () => Promise<void>;
  loadCurrentDisk: () => Promise<void>;
  switchDisk: (diskId: string) => Promise<void>;
  createDisk: (disk: CreateDiskInput) => Promise<void>;
  updateDisk: (diskId: string, updates: Partial<DiskDefinition>) => Promise<void>;
  deleteDisk: (diskId: string) => Promise<void>;
  duplicateDisk: (diskId: string, newName: string) => Promise<void>;
  loadPoolResources: () => Promise<void>;
}
```

### Preload API Addition

```typescript
// src/preload/index.ts — add to api object
disk: {
  list: () => ipcRenderer.invoke(IPC.DISK_LIST),
  get: (id: string) => ipcRenderer.invoke(IPC.DISK_GET, id),
  getCurrent: () => ipcRenderer.invoke(IPC.DISK_GET_CURRENT),
  switch: (id: string) => ipcRenderer.invoke(IPC.DISK_SWITCH, id),
  create: (disk) => ipcRenderer.invoke(IPC.DISK_CREATE, disk),
  update: (id, updates) => ipcRenderer.invoke(IPC.DISK_UPDATE, id, updates),
  delete: (id: string) => ipcRenderer.invoke(IPC.DISK_DELETE, id),
  duplicate: (id, name) => ipcRenderer.invoke(IPC.DISK_DUPLICATE, id, name),
  listPoolSkills: () => ipcRenderer.invoke(IPC.DISK_LIST_POOL_SKILLS),
  listPoolCommands: () => ipcRenderer.invoke(IPC.DISK_LIST_POOL_COMMANDS),
  listPoolMCP: () => ipcRenderer.invoke(IPC.DISK_LIST_POOL_MCP),
  onSwitched: (callback) => ipcRenderer.on(IPC.DISK_SWITCHED, callback)
}
```

## Pre-installed Disks

### Default

- **Purpose**: Zero-migration backward compatibility
- **Behavior**: Transparent pass-through to existing global config
- **Skills/Commands/MCP**: Empty (reads from `~/.claude/*`)

### Coding

- **Purpose**: Software development and debugging
- **Skills**: `frontend-design` (Anthropic), `react-best-practices` (Vercel), `mcp-builder` (Anthropic), `playwright` (Microsoft)
- **MCP**: `filesystem`, `github`
- **System Prompt**: Expert software engineer persona
- **Model**: `claude-sonnet-4-20250514`

### Data

- **Purpose**: Data processing and analysis
- **Skills**: `csv-data-summarizer` (community), `xlsx` (Anthropic), `postgres-best-practices` (Supabase)
- **MCP**: `filesystem`, `postgres`
- **System Prompt**: Data analyst persona
- **Model**: null (use global default)

### Writing

- **Purpose**: Professional document creation and editing
- **Skills**: `docx` (Anthropic), `pdf` (Anthropic), `pptx` (Anthropic), `markdown-to-epub` (community)
- **MCP**: `filesystem`
- **System Prompt**: Professional writer and editor persona
- **Model**: null (use global default)

## Implementation Scope

### V1 — Core Feature

1. DiskService + disk-handler (IPC)
2. disk-store (Zustand)
3. Database migration: add `diskId` to sessions table
4. Sidebar Disk switcher component
5. SidePanel Disk management panel
6. chat-handler adaptation (path switching + system prompt injection)
7. skills-store / commands-store / mcp-store adaptation for disk-aware loading
8. 4 pre-installed Disks with community-sourced skills
9. Preload API additions

### Future Considerations

- **Disk import/export** — package as `.zip` for sharing
- **Disk marketplace** — community-shared Disk configurations
- **Skill enable/disable toggle** — temporarily disable a skill within a Disk without removing the reference
- **Keyboard shortcut** — quick Disk switching via hotkey
- **Skill search & install** — integrate `skills-lc-cli` or skills.lc API for in-app skill discovery and installation to pool
