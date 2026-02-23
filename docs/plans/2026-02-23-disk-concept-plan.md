# Disk (盘片) Feature Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add the Disk feature — self-contained working environment profiles that bundle Skills, MCP, Commands, System Prompt, and Model Preference, with a UI switcher and management panel.

**Architecture:** File-based Disk definitions stored in `~/.ccdisk/disks/`, with a central pool for Skills/Commands/MCP at `~/.ccdisk/skills/`, `~/.ccdisk/commands/`, and `~/.ccdisk/mcp-servers.json`. A new `DiskService` manages CRUD and switching. The Default Disk transparently passes through to existing `~/.claude/` paths. Sessions gain a `diskId` column. The renderer gets a new Zustand store, a sidebar Disk switcher dropdown, and a SidePanel management view.

**Tech Stack:** TypeScript, Electron IPC, Drizzle ORM (better-sqlite3), Zustand, React, Tailwind CSS, Lucide icons

**Design Doc:** `docs/plans/2026-02-23-disk-concept-design.md`

---

## Task 1: Add Shared Types

**Files:**

- Modify: `src/shared/types.ts` (append after line 205)

**Step 1: Add DiskDefinition and related types**

Add to the end of `src/shared/types.ts`:

```typescript
/**
 * Disk (盘片) - self-contained working environment profile
 */
export interface DiskDefinition {
  id: string;
  name: string;
  description: string;
  icon: string;
  builtIn: boolean;
  isDefault?: boolean;
  systemPrompt: string | null;
  model: string | null;
  skills: string[];
  commands: string[];
  mcpServers: string[];
}

export type DiskScope = 'pool' | 'global';
```

**Step 2: Add diskId to Session type**

In `src/shared/types.ts`, find the `Session` interface (lines 70-77) and add `diskId`:

```typescript
export interface Session {
  id: string;
  name: string;
  sdkSessionId: string | null;
  model: string | null;
  diskId: string | null; // NEW
  createdAt: Date;
  updatedAt: Date;
}
```

**Step 3: Verify**

Run: `pnpm typecheck`
Expected: May show errors in files that use Session — that's expected and will be fixed in subsequent tasks.

**Step 4: Commit**

```
git add src/shared/types.ts
git commit -m "feat(disk): add DiskDefinition type and diskId to Session"
```

---

## Task 2: Add IPC Channels

**Files:**

- Modify: `src/shared/ipc-channels.ts` (add after line 70, before the closing `} as const`)

**Step 1: Add Disk IPC channels**

Insert before the closing `} as const;` in `src/shared/ipc-channels.ts`:

```typescript
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
  DISK_LIST_POOL_MCP: 'disk:list-pool-mcp',
```

**Step 2: Verify**

Run: `pnpm typecheck`

**Step 3: Commit**

```
git add src/shared/ipc-channels.ts
git commit -m "feat(disk): add Disk IPC channel constants"
```

---

## Task 3: Database Migration — Add diskId to Sessions

**Files:**

- Modify: `src/main/db/schema.ts` (line 10, add diskId field)
- Modify: `src/main/services/db-service.ts` (migration logic around line 78-88)

**Step 1: Update Drizzle schema**

In `src/main/db/schema.ts`, add `diskId` to the sessions table definition (after line 10 `model`):

```typescript
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

**Step 2: Add migration in DatabaseService**

In `src/main/services/db-service.ts`, after the existing `CREATE TABLE IF NOT EXISTS sessions` block (around line 88), add a migration to add the `disk_id` column if it doesn't exist:

```typescript
// Add disk_id column if not exists (Disk feature migration)
const sessionColumns = this.sqlite.prepare("PRAGMA table_info('sessions')").all() as Array<{ name: string }>;
const hasDiskId = sessionColumns.some((col) => col.name === 'disk_id');
if (!hasDiskId) {
  console.log('Migrating sessions table: adding disk_id column...');
  this.sqlite.exec("ALTER TABLE sessions ADD COLUMN disk_id TEXT DEFAULT 'default'");
  console.log('disk_id migration completed');
}
```

Place this after line 123 (after the `CREATE INDEX` statements), right before the closing `}` of the `migrate()` method.

**Step 3: Verify**

Run: `pnpm typecheck`

**Step 4: Commit**

```
git add src/main/db/schema.ts src/main/services/db-service.ts
git commit -m "feat(disk): add diskId column to sessions table with migration"
```

---

## Task 4: Create DiskService

**Files:**

- Create: `src/main/services/disk-service.ts`

**Step 1: Implement DiskService**

Create `src/main/services/disk-service.ts` with the following implementation:

```typescript
/**
 * Disk Service - Manages Disk (盘片) definitions and switching
 *
 * Disks are stored as directories under ~/.ccdisk/disks/{diskId}/disk.json
 * Skills, Commands, and MCP servers live in central pools.
 * The Default Disk transparently passes through to ~/.claude/ paths.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, rmSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import type { DiskDefinition, Skill, Command, MCPConfig, MCPServerConfig } from '../../shared/types';
import { DatabaseService } from './db-service';
import { SkillsService } from './skills-service';
import { CommandsService } from './commands-service';

export class DiskService {
  private baseDir: string;
  private disksDir: string;
  private skillsPoolDir: string;
  private commandsPoolDir: string;
  private mcpPoolPath: string;
  private dbService: DatabaseService;

  constructor(dbService: DatabaseService) {
    this.baseDir = join(homedir(), '.ccdisk');
    this.disksDir = join(this.baseDir, 'disks');
    this.skillsPoolDir = join(this.baseDir, 'skills');
    this.commandsPoolDir = join(this.baseDir, 'commands');
    this.mcpPoolPath = join(this.baseDir, 'mcp-servers.json');
    this.dbService = dbService;
  }

  /**
   * Initialize disk directories and write built-in disks on first run
   */
  async initialize(): Promise<void> {
    // Ensure directories exist
    for (const dir of [this.disksDir, this.skillsPoolDir, this.commandsPoolDir]) {
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
    }

    // Create MCP pool file if not exists
    if (!existsSync(this.mcpPoolPath)) {
      writeFileSync(this.mcpPoolPath, JSON.stringify({}, null, 2), 'utf-8');
    }

    // Write built-in disks if they don't exist
    for (const disk of BUILTIN_DISKS) {
      const diskDir = join(this.disksDir, disk.id);
      if (!existsSync(diskDir)) {
        mkdirSync(diskDir, { recursive: true });
        writeFileSync(join(diskDir, 'disk.json'), JSON.stringify(disk, null, 2), 'utf-8');
      }
    }

    // Set default currentDiskId if not set
    const current = await this.dbService.getSetting('currentDiskId');
    if (!current) {
      await this.dbService.setSetting('currentDiskId', 'default');
    }
  }

  async listDisks(): Promise<DiskDefinition[]> {
    const disks: DiskDefinition[] = [];

    if (!existsSync(this.disksDir)) return disks;

    const entries = readdirSync(this.disksDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const diskJsonPath = join(this.disksDir, entry.name, 'disk.json');
      if (!existsSync(diskJsonPath)) continue;

      try {
        const raw = readFileSync(diskJsonPath, 'utf-8');
        const disk = JSON.parse(raw) as DiskDefinition;
        disk.id = entry.name;
        disks.push(disk);
      } catch (error) {
        console.error(`Failed to read disk ${entry.name}:`, error);
      }
    }

    // Sort: default first, then built-in, then custom
    return disks.sort((a, b) => {
      if (a.isDefault) return -1;
      if (b.isDefault) return 1;
      if (a.builtIn && !b.builtIn) return -1;
      if (!a.builtIn && b.builtIn) return 1;
      return a.name.localeCompare(b.name);
    });
  }

  async getDisk(diskId: string): Promise<DiskDefinition> {
    const diskJsonPath = join(this.disksDir, diskId, 'disk.json');
    if (!existsSync(diskJsonPath)) {
      throw new Error(`Disk not found: ${diskId}`);
    }
    const raw = readFileSync(diskJsonPath, 'utf-8');
    const disk = JSON.parse(raw) as DiskDefinition;
    disk.id = diskId;
    return disk;
  }

  async getCurrentDisk(): Promise<DiskDefinition> {
    const currentId = (await this.dbService.getSetting('currentDiskId')) || 'default';
    return this.getDisk(currentId);
  }

  async getCurrentDiskId(): Promise<string> {
    return (await this.dbService.getSetting('currentDiskId')) || 'default';
  }

  async switchDisk(diskId: string): Promise<DiskDefinition> {
    // Verify disk exists
    const disk = await this.getDisk(diskId);
    await this.dbService.setSetting('currentDiskId', diskId);
    return disk;
  }

  async createDisk(input: Omit<DiskDefinition, 'id' | 'builtIn'>): Promise<DiskDefinition> {
    const id = input.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

    if (!id) throw new Error('Invalid disk name');

    const diskDir = join(this.disksDir, id);
    if (existsSync(diskDir)) {
      throw new Error(`Disk already exists: ${id}`);
    }

    const disk: DiskDefinition = {
      ...input,
      id,
      builtIn: false
    };

    mkdirSync(diskDir, { recursive: true });
    writeFileSync(join(diskDir, 'disk.json'), JSON.stringify(disk, null, 2), 'utf-8');

    return disk;
  }

  async updateDisk(diskId: string, updates: Partial<DiskDefinition>): Promise<DiskDefinition> {
    const existing = await this.getDisk(diskId);

    // Don't allow changing id or builtIn status
    const updated: DiskDefinition = {
      ...existing,
      ...updates,
      id: diskId,
      builtIn: existing.builtIn
    };

    const diskJsonPath = join(this.disksDir, diskId, 'disk.json');
    writeFileSync(diskJsonPath, JSON.stringify(updated, null, 2), 'utf-8');

    return updated;
  }

  async deleteDisk(diskId: string): Promise<void> {
    const disk = await this.getDisk(diskId);
    if (disk.builtIn) {
      throw new Error('Cannot delete built-in disk');
    }

    // If this is the current disk, switch to default
    const currentId = await this.getCurrentDiskId();
    if (currentId === diskId) {
      await this.dbService.setSetting('currentDiskId', 'default');
    }

    const diskDir = join(this.disksDir, diskId);
    rmSync(diskDir, { recursive: true, force: true });
  }

  async duplicateDisk(diskId: string, newName: string): Promise<DiskDefinition> {
    const source = await this.getDisk(diskId);
    return this.createDisk({
      name: newName,
      description: source.description,
      icon: source.icon,
      systemPrompt: source.systemPrompt,
      model: source.model,
      skills: [...source.skills],
      commands: [...source.commands],
      mcpServers: [...source.mcpServers]
    });
  }

  // --- Pool queries ---

  /**
   * List all skills in the pool (~/.ccdisk/skills/)
   */
  async listPoolSkills(): Promise<Skill[]> {
    const poolService = new SkillsService();
    // SkillsService reads from global (~/.claude/skills/) by default
    // We need to read from our pool dir instead
    return this.readPoolSkills();
  }

  private readPoolSkills(): Skill[] {
    const skills: Skill[] = [];
    if (!existsSync(this.skillsPoolDir)) return skills;

    const entries = readdirSync(this.skillsPoolDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const skillMdPath = join(this.skillsPoolDir, entry.name, 'SKILL.md');
      if (!existsSync(skillMdPath)) continue;

      try {
        const content = readFileSync(skillMdPath, 'utf-8');
        skills.push({
          name: entry.name,
          content,
          scope: 'global',
          path: skillMdPath
        });
      } catch (error) {
        console.error(`Failed to read pool skill ${entry.name}:`, error);
      }
    }
    return skills;
  }

  /**
   * List all commands in the pool (~/.ccdisk/commands/)
   */
  async listPoolCommands(): Promise<Array<{ name: string; path: string }>> {
    const commands: Array<{ name: string; path: string }> = [];
    if (!existsSync(this.commandsPoolDir)) return commands;

    const entries = readdirSync(this.commandsPoolDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      if (entry.name.startsWith('.')) continue;
      commands.push({
        name: entry.name.replace(/\.md$/, ''),
        path: join(this.commandsPoolDir, entry.name)
      });
    }
    return commands;
  }

  /**
   * Read the MCP server pool (~/.ccdisk/mcp-servers.json)
   */
  async listPoolMCPServers(): Promise<Record<string, MCPServerConfig>> {
    if (!existsSync(this.mcpPoolPath)) return {};
    try {
      const raw = readFileSync(this.mcpPoolPath, 'utf-8');
      return JSON.parse(raw) as Record<string, MCPServerConfig>;
    } catch {
      return {};
    }
  }

  /**
   * Get the active Skills for the current disk.
   * Default disk: reads from ~/.claude/skills/ (existing behavior)
   * Other disks: reads from pool, filtered by disk's skills[] references
   */
  async getActiveSkillsForDisk(diskId: string): Promise<Skill[]> {
    const disk = await this.getDisk(diskId);

    if (disk.isDefault) {
      // Transparent pass-through — return empty, let existing SkillsService handle it
      return [];
    }

    const allPoolSkills = this.readPoolSkills();
    return allPoolSkills.filter((s) => disk.skills.includes(s.name));
  }

  /**
   * Get active MCP config for the current disk.
   * Default disk: returns empty (let existing MCPService handle it)
   * Other disks: returns filtered pool entries
   */
  async getActiveMCPForDisk(diskId: string): Promise<MCPConfig> {
    const disk = await this.getDisk(diskId);

    if (disk.isDefault) {
      return { mcpServers: {} };
    }

    const allServers = await this.listPoolMCPServers();
    const filtered: Record<string, MCPServerConfig> = {};
    for (const name of disk.mcpServers) {
      if (allServers[name]) {
        filtered[name] = allServers[name];
      }
    }
    return { mcpServers: filtered };
  }
}

// --- Built-in Disk Templates ---

const BUILTIN_DISKS: DiskDefinition[] = [
  {
    id: 'default',
    name: 'Default',
    description: 'General purpose mode using your global configuration',
    icon: 'disc',
    builtIn: true,
    isDefault: true,
    systemPrompt: null,
    model: null,
    skills: [],
    commands: [],
    mcpServers: []
  },
  {
    id: 'coding',
    name: 'Coding',
    description: 'Software development and debugging',
    icon: 'code',
    builtIn: true,
    systemPrompt:
      'You are an expert software engineer. Follow clean code principles, write tests first when possible, and explain your reasoning clearly. Prefer simple solutions over complex ones.',
    model: null,
    skills: ['frontend-design', 'react-best-practices', 'mcp-builder', 'playwright'],
    commands: [],
    mcpServers: ['filesystem', 'github']
  },
  {
    id: 'data',
    name: 'Data',
    description: 'Data processing and analysis',
    icon: 'database',
    builtIn: true,
    systemPrompt:
      'You are a data analyst and engineer. Focus on data quality, clear visualizations, and reproducible analysis. Explain statistical methods and assumptions.',
    model: null,
    skills: ['csv-data-summarizer', 'xlsx', 'postgres-best-practices'],
    commands: [],
    mcpServers: ['filesystem']
  },
  {
    id: 'writing',
    name: 'Writing',
    description: 'Professional document creation and editing',
    icon: 'pen-tool',
    builtIn: true,
    systemPrompt:
      'You are a professional writer and editor. Focus on clarity, structure, and precision. Use active voice. Eliminate unnecessary words. Adapt tone to the audience.',
    model: null,
    skills: ['docx', 'pdf', 'pptx', 'markdown-to-epub'],
    commands: [],
    mcpServers: ['filesystem']
  }
];
```

**Step 2: Verify**

Run: `pnpm typecheck`

**Step 3: Commit**

```
git add src/main/services/disk-service.ts
git commit -m "feat(disk): create DiskService with CRUD, switching, and pool queries"
```

---

## Task 5: Create Disk IPC Handler

**Files:**

- Create: `src/main/ipc/disk-handler.ts`

**Step 1: Implement disk-handler**

Create `src/main/ipc/disk-handler.ts`:

```typescript
/**
 * Disk IPC Handlers
 * Handles Disk CRUD, switching, and pool resource queries
 */
import { ipcMain, type BrowserWindow } from 'electron';
import { IPC_CHANNELS } from '../../shared/ipc-channels';
import type { IPCResponse, DiskDefinition } from '../../shared/types';
import { DiskService } from '../services/disk-service';

export function registerDiskHandlers(win: BrowserWindow, diskService: DiskService): void {
  // List all disks
  ipcMain.handle(IPC_CHANNELS.DISK_LIST, async (): Promise<IPCResponse<DiskDefinition[]>> => {
    try {
      const disks = await diskService.listDisks();
      return { success: true, data: disks };
    } catch (error) {
      console.error('DISK_LIST error:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  // Get a specific disk
  ipcMain.handle(IPC_CHANNELS.DISK_GET, async (_event, diskId: string): Promise<IPCResponse<DiskDefinition>> => {
    try {
      const disk = await diskService.getDisk(diskId);
      return { success: true, data: disk };
    } catch (error) {
      console.error('DISK_GET error:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  // Get current disk
  ipcMain.handle(IPC_CHANNELS.DISK_GET_CURRENT, async (): Promise<IPCResponse<DiskDefinition>> => {
    try {
      const disk = await diskService.getCurrentDisk();
      return { success: true, data: disk };
    } catch (error) {
      console.error('DISK_GET_CURRENT error:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  // Switch disk
  ipcMain.handle(IPC_CHANNELS.DISK_SWITCH, async (_event, diskId: string): Promise<IPCResponse<DiskDefinition>> => {
    try {
      const disk = await diskService.switchDisk(diskId);
      // Notify renderer of disk switch
      win.webContents.send(IPC_CHANNELS.DISK_SWITCHED, disk);
      return { success: true, data: disk };
    } catch (error) {
      console.error('DISK_SWITCH error:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  // Create custom disk
  ipcMain.handle(
    IPC_CHANNELS.DISK_CREATE,
    async (_event, input: Omit<DiskDefinition, 'id' | 'builtIn'>): Promise<IPCResponse<DiskDefinition>> => {
      try {
        const disk = await diskService.createDisk(input);
        return { success: true, data: disk };
      } catch (error) {
        console.error('DISK_CREATE error:', error);
        return { success: false, error: (error as Error).message };
      }
    }
  );

  // Update disk
  ipcMain.handle(
    IPC_CHANNELS.DISK_UPDATE,
    async (_event, diskId: string, updates: Partial<DiskDefinition>): Promise<IPCResponse<DiskDefinition>> => {
      try {
        const disk = await diskService.updateDisk(diskId, updates);
        return { success: true, data: disk };
      } catch (error) {
        console.error('DISK_UPDATE error:', error);
        return { success: false, error: (error as Error).message };
      }
    }
  );

  // Delete disk
  ipcMain.handle(IPC_CHANNELS.DISK_DELETE, async (_event, diskId: string): Promise<IPCResponse<void>> => {
    try {
      await diskService.deleteDisk(diskId);
      return { success: true };
    } catch (error) {
      console.error('DISK_DELETE error:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  // Duplicate disk
  ipcMain.handle(
    IPC_CHANNELS.DISK_DUPLICATE,
    async (_event, diskId: string, newName: string): Promise<IPCResponse<DiskDefinition>> => {
      try {
        const disk = await diskService.duplicateDisk(diskId, newName);
        return { success: true, data: disk };
      } catch (error) {
        console.error('DISK_DUPLICATE error:', error);
        return { success: false, error: (error as Error).message };
      }
    }
  );

  // Pool queries
  ipcMain.handle(IPC_CHANNELS.DISK_LIST_POOL_SKILLS, async () => {
    try {
      const skills = await diskService.listPoolSkills();
      return { success: true, data: skills };
    } catch (error) {
      console.error('DISK_LIST_POOL_SKILLS error:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle(IPC_CHANNELS.DISK_LIST_POOL_COMMANDS, async () => {
    try {
      const commands = await diskService.listPoolCommands();
      return { success: true, data: commands };
    } catch (error) {
      console.error('DISK_LIST_POOL_COMMANDS error:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle(IPC_CHANNELS.DISK_LIST_POOL_MCP, async () => {
    try {
      const servers = await diskService.listPoolMCPServers();
      return { success: true, data: servers };
    } catch (error) {
      console.error('DISK_LIST_POOL_MCP error:', error);
      return { success: false, error: (error as Error).message };
    }
  });
}
```

**Step 2: Verify**

Run: `pnpm typecheck`

**Step 3: Commit**

```
git add src/main/ipc/disk-handler.ts
git commit -m "feat(disk): create disk IPC handler with CRUD and pool queries"
```

---

## Task 6: Wire Up Main Process

**Files:**

- Modify: `src/main/index.ts`

**Step 1: Import DiskService and disk-handler**

Add import for DiskService (after line 14):

```typescript
import { DiskService } from './services/disk-service';
```

Add import for disk-handler (after line 24):

```typescript
import { registerDiskHandlers } from './ipc/disk-handler';
```

**Step 2: Add global variable**

After line 34 (`let claudeService: ClaudeService;`), add:

```typescript
let diskService: DiskService;
```

**Step 3: Instantiate and initialize DiskService**

In `createWindow()`, after `dbService = new DatabaseService()` (line 73) and before `configService = new ConfigService()` (line 74), add:

```typescript
diskService = new DiskService(dbService);
await diskService.initialize();
```

Note: this requires making `createWindow` async. Wrap the body if needed, or use `.then()` for the initialize call.

Actually, since `createWindow` is not async currently, add the initialization as a fire-and-forget right after creating the diskService:

```typescript
diskService = new DiskService(dbService);
diskService.initialize().catch((err) => console.error('DiskService init error:', err));
```

**Step 4: Register disk handler**

After line 114 (`registerSdkHandlers(claudeService);`), add:

```typescript
registerDiskHandlers(mainWindow, diskService);
```

**Step 5: Verify**

Run: `pnpm typecheck`

**Step 6: Commit**

```
git add src/main/index.ts
git commit -m "feat(disk): wire DiskService and disk-handler into main process"
```

---

## Task 7: Add Disk API to Preload Bridge

**Files:**

- Modify: `src/preload/index.ts` (add disk namespace)
- Modify: `src/preload/index.d.ts` (add type declarations)

**Step 1: Add DiskDefinition to preload imports**

In `src/preload/index.ts`, add `DiskDefinition` to the type imports (line 4-16):

```typescript
import type {
  Session,
  Message,
  Provider,
  FileNode,
  Skill,
  Command,
  MCPConfig,
  StreamEvent,
  IPCResponse,
  FileAttachment,
  FileContentResponse,
  DiskDefinition // NEW
} from '../shared/types';
```

**Step 2: Add disk namespace to api object**

In `src/preload/index.ts`, after the `sdk` object (line 133) and before `openExternal` (line 136), add:

```typescript
  // Disk management
  disk: {
    list: (): Promise<IPCResponse<DiskDefinition[]>> => ipcRenderer.invoke(IPC_CHANNELS.DISK_LIST),
    get: (diskId: string): Promise<IPCResponse<DiskDefinition>> =>
      ipcRenderer.invoke(IPC_CHANNELS.DISK_GET, diskId),
    getCurrent: (): Promise<IPCResponse<DiskDefinition>> =>
      ipcRenderer.invoke(IPC_CHANNELS.DISK_GET_CURRENT),
    switch: (diskId: string): Promise<IPCResponse<DiskDefinition>> =>
      ipcRenderer.invoke(IPC_CHANNELS.DISK_SWITCH, diskId),
    create: (input: Omit<DiskDefinition, 'id' | 'builtIn'>): Promise<IPCResponse<DiskDefinition>> =>
      ipcRenderer.invoke(IPC_CHANNELS.DISK_CREATE, input),
    update: (diskId: string, updates: Partial<DiskDefinition>): Promise<IPCResponse<DiskDefinition>> =>
      ipcRenderer.invoke(IPC_CHANNELS.DISK_UPDATE, diskId, updates),
    delete: (diskId: string): Promise<IPCResponse<void>> =>
      ipcRenderer.invoke(IPC_CHANNELS.DISK_DELETE, diskId),
    duplicate: (diskId: string, newName: string): Promise<IPCResponse<DiskDefinition>> =>
      ipcRenderer.invoke(IPC_CHANNELS.DISK_DUPLICATE, diskId, newName),
    listPoolSkills: () => ipcRenderer.invoke(IPC_CHANNELS.DISK_LIST_POOL_SKILLS),
    listPoolCommands: () => ipcRenderer.invoke(IPC_CHANNELS.DISK_LIST_POOL_COMMANDS),
    listPoolMCP: () => ipcRenderer.invoke(IPC_CHANNELS.DISK_LIST_POOL_MCP),
    onSwitched: (callback: (disk: DiskDefinition) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, disk: DiskDefinition) => callback(disk)
      ipcRenderer.on(IPC_CHANNELS.DISK_SWITCHED, handler)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.DISK_SWITCHED, handler)
    }
  },
```

**Step 3: Update type declarations**

In `src/preload/index.d.ts`, add `DiskDefinition` to imports (line 2-15) and add the disk interface to the `API` interface (after `sdk`, before the closing `}`):

```typescript
  disk: {
    list: () => Promise<IPCResponse<DiskDefinition[]>>
    get: (diskId: string) => Promise<IPCResponse<DiskDefinition>>
    getCurrent: () => Promise<IPCResponse<DiskDefinition>>
    switch: (diskId: string) => Promise<IPCResponse<DiskDefinition>>
    create: (input: Omit<DiskDefinition, 'id' | 'builtIn'>) => Promise<IPCResponse<DiskDefinition>>
    update: (diskId: string, updates: Partial<DiskDefinition>) => Promise<IPCResponse<DiskDefinition>>
    delete: (diskId: string) => Promise<IPCResponse<void>>
    duplicate: (diskId: string, newName: string) => Promise<IPCResponse<DiskDefinition>>
    listPoolSkills: () => Promise<IPCResponse<Skill[]>>
    listPoolCommands: () => Promise<IPCResponse<Array<{ name: string; path: string }>>>
    listPoolMCP: () => Promise<IPCResponse<Record<string, MCPServerConfig>>>
    onSwitched: (callback: (disk: DiskDefinition) => void) => () => void
  }
```

Also add `DiskDefinition` and `MCPServerConfig` to the imports.

**Step 4: Verify**

Run: `pnpm typecheck`

**Step 5: Commit**

```
git add src/preload/index.ts src/preload/index.d.ts
git commit -m "feat(disk): add disk API to preload bridge"
```

---

## Task 8: Create Disk Zustand Store

**Files:**

- Create: `src/renderer/src/stores/disk-store.ts`

**Step 1: Implement disk-store**

Create `src/renderer/src/stores/disk-store.ts`:

```typescript
/**
 * Disk Store - Manages Disk state in the renderer process
 */
import { create } from 'zustand';
import type { DiskDefinition, Skill, MCPServerConfig } from '../../../shared/types';

interface DiskStore {
  // State
  disks: DiskDefinition[];
  currentDisk: DiskDefinition | null;
  isLoading: boolean;

  // Pool state
  poolSkills: Skill[];
  poolCommands: Array<{ name: string; path: string }>;
  poolMCPServers: Record<string, MCPServerConfig>;

  // Actions
  loadDisks: () => Promise<void>;
  loadCurrentDisk: () => Promise<void>;
  switchDisk: (diskId: string) => Promise<void>;
  createDisk: (input: Omit<DiskDefinition, 'id' | 'builtIn'>) => Promise<void>;
  updateDisk: (diskId: string, updates: Partial<DiskDefinition>) => Promise<void>;
  deleteDisk: (diskId: string) => Promise<void>;
  duplicateDisk: (diskId: string, newName: string) => Promise<void>;
  loadPoolResources: () => Promise<void>;
}

export const useDiskStore = create<DiskStore>((set) => ({
  disks: [],
  currentDisk: null,
  isLoading: false,
  poolSkills: [],
  poolCommands: [],
  poolMCPServers: {},

  loadDisks: async () => {
    try {
      const result = await window.api.disk.list();
      if (result.success && result.data) {
        set({ disks: result.data });
      }
    } catch (error) {
      console.error('Failed to load disks:', error);
    }
  },

  loadCurrentDisk: async () => {
    try {
      const result = await window.api.disk.getCurrent();
      if (result.success && result.data) {
        set({ currentDisk: result.data });
      }
    } catch (error) {
      console.error('Failed to load current disk:', error);
    }
  },

  switchDisk: async (diskId: string) => {
    set({ isLoading: true });
    try {
      const result = await window.api.disk.switch(diskId);
      if (result.success && result.data) {
        set({ currentDisk: result.data });
      }
    } catch (error) {
      console.error('Failed to switch disk:', error);
    } finally {
      set({ isLoading: false });
    }
  },

  createDisk: async (input) => {
    try {
      const result = await window.api.disk.create(input);
      if (result.success) {
        // Reload disk list
        const listResult = await window.api.disk.list();
        if (listResult.success && listResult.data) {
          set({ disks: listResult.data });
        }
      }
    } catch (error) {
      console.error('Failed to create disk:', error);
    }
  },

  updateDisk: async (diskId, updates) => {
    try {
      const result = await window.api.disk.update(diskId, updates);
      if (result.success) {
        const listResult = await window.api.disk.list();
        if (listResult.success && listResult.data) {
          set({ disks: listResult.data });
        }
        // If updating the current disk, refresh it
        const currentResult = await window.api.disk.getCurrent();
        if (currentResult.success && currentResult.data) {
          set({ currentDisk: currentResult.data });
        }
      }
    } catch (error) {
      console.error('Failed to update disk:', error);
    }
  },

  deleteDisk: async (diskId) => {
    try {
      const result = await window.api.disk.delete(diskId);
      if (result.success) {
        const listResult = await window.api.disk.list();
        if (listResult.success && listResult.data) {
          set({ disks: listResult.data });
        }
        // Refresh current disk (may have switched to default)
        const currentResult = await window.api.disk.getCurrent();
        if (currentResult.success && currentResult.data) {
          set({ currentDisk: currentResult.data });
        }
      }
    } catch (error) {
      console.error('Failed to delete disk:', error);
    }
  },

  duplicateDisk: async (diskId, newName) => {
    try {
      const result = await window.api.disk.duplicate(diskId, newName);
      if (result.success) {
        const listResult = await window.api.disk.list();
        if (listResult.success && listResult.data) {
          set({ disks: listResult.data });
        }
      }
    } catch (error) {
      console.error('Failed to duplicate disk:', error);
    }
  },

  loadPoolResources: async () => {
    try {
      const [skillsResult, commandsResult, mcpResult] = await Promise.all([
        window.api.disk.listPoolSkills(),
        window.api.disk.listPoolCommands(),
        window.api.disk.listPoolMCP()
      ]);

      set({
        poolSkills: skillsResult.success ? skillsResult.data || [] : [],
        poolCommands: commandsResult.success ? commandsResult.data || [] : [],
        poolMCPServers: mcpResult.success ? mcpResult.data || {} : {}
      });
    } catch (error) {
      console.error('Failed to load pool resources:', error);
    }
  }
}));

/**
 * Setup listener for disk-switched events from main process
 */
export function setupDiskSwitchedListener(): () => void {
  return window.api.disk.onSwitched((disk) => {
    useDiskStore.setState({ currentDisk: disk });
  });
}
```

**Step 2: Verify**

Run: `pnpm typecheck`

**Step 3: Commit**

```
git add src/renderer/src/stores/disk-store.ts
git commit -m "feat(disk): create disk Zustand store with CRUD and pool state"
```

---

## Task 9: Adapt chat-handler for Disk-Aware Mention Resolution

**Files:**

- Modify: `src/main/ipc/chat-handler.ts`

**Step 1: Add DiskService parameter**

Update the `registerChatHandlers` function signature (line 131) to accept `DiskService`:

```typescript
import { DiskService } from '../services/disk-service'

export function registerChatHandlers(
  win: BrowserWindow,
  claudeService: ClaudeService,
  dbService: DatabaseService,
  skillsService: SkillsService,
  commandsService: CommandsService,
  fileWatcher: FileWatcherService,
  configService: ConfigService,
  diskService: DiskService            // NEW parameter
): void {
```

**Step 2: Make resolveMentions disk-aware**

Update the `resolveMentions` function signature (line 37) to accept `DiskService` and use disk-aware skill loading:

```typescript
async function resolveMentions(
  message: string,
  skillsService: SkillsService,
  commandsService: CommandsService,
  fileWatcher: FileWatcherService,
  diskService: DiskService           // NEW parameter
): Promise<string> {
```

Inside the function, replace the skills loading logic (lines 48-49):

```typescript
// Load skills based on current disk
const currentDiskId = await diskService.getCurrentDiskId();
const currentDisk = await diskService.getDisk(currentDiskId);

let skills: Skill[] = [];
if (hasSkillMentions) {
  if (currentDisk.isDefault) {
    // Default disk: use existing SkillsService (reads ~/.claude/skills/)
    skills = await skillsService.listSkills();
  } else {
    // Other disks: read from pool, filtered by disk references
    skills = await diskService.getActiveSkillsForDisk(currentDiskId);
  }
}
```

Add the `Skill` type import at the top of the file:

```typescript
import type { IPCResponse, StreamEvent, Skill } from '../../shared/types';
```

**Step 3: Update the CHAT_SEND handler call to pass diskService**

In the `CHAT_SEND` handler (line 152), update the call:

```typescript
const resolvedMessage = await resolveMentions(message, skillsService, commandsService, fileWatcher, diskService);
```

**Step 4: Add System Prompt injection to CHAT_SEND**

After resolving mentions and before `claudeService.sendMessage()` (around line 155), add system prompt retrieval:

```typescript
// Get current disk for system prompt injection
const currentDisk = await diskService.getCurrentDisk();

// Send resolved message to Claude service
// Note: systemPrompt and model override are passed via the ClaudeService
// The actual injection depends on ClaudeService.sendMessage supporting these params
await claudeService.sendMessage(sessionId, resolvedMessage, files, sdkSessionId);
```

Note: Full system prompt injection into the Claude SDK session requires changes to `ClaudeService.sendMessage()` which may be complex. For V1, store the system prompt and model in the disk but defer SDK injection to a follow-up task, OR prepend the system prompt to the resolved message as a simple approach:

```typescript
// Prepend disk system prompt if set
let finalMessage = resolvedMessage;
if (currentDisk.systemPrompt) {
  finalMessage = `[System Context]\n${currentDisk.systemPrompt}\n\n[User Message]\n${resolvedMessage}`;
}

await claudeService.sendMessage(sessionId, finalMessage, files, sdkSessionId);
```

**Step 5: Update caller in index.ts**

In `src/main/index.ts`, update the `registerChatHandlers` call (lines 105-113) to pass `diskService`:

```typescript
registerChatHandlers(
  mainWindow,
  claudeService,
  dbService,
  skillsService,
  commandsService,
  fileWatcher,
  configService,
  diskService // NEW
);
```

**Step 6: Verify**

Run: `pnpm typecheck`

**Step 7: Commit**

```
git add src/main/ipc/chat-handler.ts src/main/index.ts
git commit -m "feat(disk): make chat-handler disk-aware with mention resolution and system prompt"
```

---

## Task 10: Adapt chat-store — Pass diskId When Creating Sessions

**Files:**

- Modify: `src/renderer/src/stores/chat-store.ts`

**Step 1: Import useDiskStore**

At the top of `src/renderer/src/stores/chat-store.ts`, add:

```typescript
import { useDiskStore } from './disk-store';
```

**Step 2: Add diskId when creating sessions**

Find the `createSession` action in the store. When it calls `window.api.sessions.create(name)`, the session creation in the main process needs to include `diskId`.

Since the sessions-handler creates sessions with an ID and name, the simplest approach is: after creating the session, immediately update it with the current diskId:

In the `createSession` action, after the session is created successfully, add:

```typescript
// Tag session with current disk
const currentDisk = useDiskStore.getState().currentDisk;
if (currentDisk && result.data) {
  await window.api.sessions.update(result.data.id, { diskId: currentDisk.id });
}
```

**Step 3: Verify**

Run: `pnpm typecheck`

**Step 4: Commit**

```
git add src/renderer/src/stores/chat-store.ts
git commit -m "feat(disk): tag new sessions with current diskId"
```

---

## Task 11: Create DiskSwitcher Component

**Files:**

- Create: `src/renderer/src/components/DiskSwitcher.tsx`

**Step 1: Implement DiskSwitcher**

Create `src/renderer/src/components/DiskSwitcher.tsx`:

```typescript
/**
 * DiskSwitcher - Dropdown selector for switching between Disks
 * Placed at the top of the Sidebar
 */
import { useState, useRef, useEffect } from 'react'
import { useDiskStore } from '../stores/disk-store'
import {
  Disc,
  Code,
  Database,
  PenTool,
  ChevronDown,
  Plus,
  Settings,
  type LucideIcon
} from 'lucide-react'
import type { PanelType } from './SidePanel'

const ICON_MAP: Record<string, LucideIcon> = {
  disc: Disc,
  code: Code,
  database: Database,
  'pen-tool': PenTool
}

interface DiskSwitcherProps {
  onManageDisks: () => void
}

export function DiskSwitcher({ onManageDisks }: DiskSwitcherProps) {
  const { disks, currentDisk, switchDisk, isLoading } = useDiskStore()
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Close dropdown on outside click
  useEffect(() => {
    if (!isOpen) return
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [isOpen])

  // Close on ESC
  useEffect(() => {
    if (!isOpen) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false)
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [isOpen])

  const handleSwitch = async (diskId: string) => {
    if (diskId === currentDisk?.id) {
      setIsOpen(false)
      return
    }
    await switchDisk(diskId)
    setIsOpen(false)
  }

  const CurrentIcon = currentDisk?.icon ? ICON_MAP[currentDisk.icon] || Disc : Disc

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Current Disk Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={isLoading}
        className="flex items-center gap-2 w-full px-3 py-2 rounded-lg hover:bg-bg-accent transition-colors text-left"
      >
        <div className="h-6 w-6 rounded bg-accent/10 flex items-center justify-center">
          <CurrentIcon className="h-3.5 w-3.5 text-accent" />
        </div>
        <span className="flex-1 text-sm font-medium text-text-primary truncate">
          {currentDisk?.name || 'Default'}
        </span>
        <ChevronDown
          className={`h-4 w-4 text-text-tertiary transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute left-0 right-0 top-full mt-1 bg-white rounded-lg border border-border-subtle shadow-lg z-50 py-1">
          {disks.map((disk) => {
            const Icon = ICON_MAP[disk.icon] || Disc
            const isActive = disk.id === currentDisk?.id

            return (
              <button
                key={disk.id}
                onClick={() => handleSwitch(disk.id)}
                className={`flex items-center gap-2 w-full px-3 py-2 text-left text-sm transition-colors ${
                  isActive
                    ? 'bg-accent/5 text-accent font-medium'
                    : 'text-text-secondary hover:bg-bg-accent'
                }`}
              >
                <Icon className={`h-4 w-4 ${isActive ? 'text-accent' : 'text-text-tertiary'}`} />
                <span className="flex-1 truncate">{disk.name}</span>
                {isActive && (
                  <div className="h-1.5 w-1.5 rounded-full bg-accent" />
                )}
              </button>
            )
          })}

          <div className="border-t border-border-subtle my-1" />

          <button
            onClick={() => {
              setIsOpen(false)
              onManageDisks()
            }}
            className="flex items-center gap-2 w-full px-3 py-2 text-left text-sm text-text-secondary hover:bg-bg-accent transition-colors"
          >
            <Settings className="h-4 w-4 text-text-tertiary" />
            <span>Manage Disks</span>
          </button>
        </div>
      )}
    </div>
  )
}
```

**Step 2: Verify**

Run: `pnpm typecheck`

**Step 3: Commit**

```
git add src/renderer/src/components/DiskSwitcher.tsx
git commit -m "feat(disk): create DiskSwitcher dropdown component"
```

---

## Task 12: Integrate DiskSwitcher into Sidebar

**Files:**

- Modify: `src/renderer/src/components/Sidebar.tsx`

**Step 1: Import DiskSwitcher**

Add import at top of `src/renderer/src/components/Sidebar.tsx`:

```typescript
import { DiskSwitcher } from './DiskSwitcher';
```

**Step 2: Add onManageDisks to SidebarProps**

The Sidebar needs to be able to open the Disks management panel. Update `SidebarProps`:

```typescript
interface SidebarProps {
  activePanelType: PanelType | null;
  onPanelTypeChange: (type: PanelType | null) => void;
}
```

Note: `PanelType` will be updated in Task 14 to include `'disks'`. For now, the `onManageDisks` callback will call `onPanelTypeChange('disks')`.

**Step 3: Add DiskSwitcher to sidebar**

Replace the CCDisk branding section (lines 83-88):

```html
<div className="shrink-0 pt-6 p-4 flex items-center gap-2">
  <div className="h-6 w-6 rounded bg-accent flex items-center justify-center text-white font-serif font-bold text-xs">
    C
  </div>
  <div className="font-semibold text-text-primary">CCDisk</div>
</div>
```

With:

```html
<div className="shrink-0 pt-6 px-2 pb-2">
  <DiskSwitcher onManageDisks={() => onPanelTypeChange('disks' as PanelType)} />
</div>
```

**Step 4: Verify**

Run: `pnpm typecheck`

**Step 5: Commit**

```
git add src/renderer/src/components/Sidebar.tsx
git commit -m "feat(disk): integrate DiskSwitcher into sidebar top"
```

---

## Task 13: Create DiskManager Component

**Files:**

- Create: `src/renderer/src/components/settings/DiskManager.tsx`

**Step 1: Implement DiskManager**

Create `src/renderer/src/components/settings/DiskManager.tsx`:

```typescript
/**
 * DiskManager - SidePanel component for managing Disks
 * Left: disk list. Right: disk detail editor with skill/command/MCP checkboxes.
 */
import { useState, useEffect } from 'react'
import { useDiskStore } from '../../stores/disk-store'
import { Button, Input, ScrollArea } from '../ui'
import {
  Disc,
  Code,
  Database,
  PenTool,
  Plus,
  Copy,
  Trash2,
  type LucideIcon
} from 'lucide-react'
import type { DiskDefinition } from '../../../../shared/types'

const ICON_MAP: Record<string, LucideIcon> = {
  disc: Disc,
  code: Code,
  database: Database,
  'pen-tool': PenTool
}

const AVAILABLE_ICONS = ['disc', 'code', 'database', 'pen-tool']

export function DiskManager() {
  const {
    disks,
    loadDisks,
    loadPoolResources,
    poolSkills,
    poolCommands,
    poolMCPServers,
    createDisk,
    updateDisk,
    deleteDisk,
    duplicateDisk
  } = useDiskStore()

  const [selectedDiskId, setSelectedDiskId] = useState<string | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [newDiskName, setNewDiskName] = useState('')

  useEffect(() => {
    loadDisks()
    loadPoolResources()
  }, [loadDisks, loadPoolResources])

  const selectedDisk = disks.find((d) => d.id === selectedDiskId) || null

  const handleCreate = async () => {
    if (!newDiskName.trim()) return
    await createDisk({
      name: newDiskName.trim(),
      description: '',
      icon: 'disc',
      systemPrompt: null,
      model: null,
      skills: [],
      commands: [],
      mcpServers: []
    })
    setNewDiskName('')
    setIsCreating(false)
  }

  const handleUpdateField = async (field: keyof DiskDefinition, value: unknown) => {
    if (!selectedDiskId) return
    await updateDisk(selectedDiskId, { [field]: value })
  }

  const handleToggleSkill = async (skillName: string) => {
    if (!selectedDisk) return
    const skills = selectedDisk.skills.includes(skillName)
      ? selectedDisk.skills.filter((s) => s !== skillName)
      : [...selectedDisk.skills, skillName]
    await updateDisk(selectedDisk.id, { skills })
  }

  const handleToggleCommand = async (cmdName: string) => {
    if (!selectedDisk) return
    const commands = selectedDisk.commands.includes(cmdName)
      ? selectedDisk.commands.filter((c) => c !== cmdName)
      : [...selectedDisk.commands, cmdName]
    await updateDisk(selectedDisk.id, { commands })
  }

  const handleToggleMCP = async (serverName: string) => {
    if (!selectedDisk) return
    const mcpServers = selectedDisk.mcpServers.includes(serverName)
      ? selectedDisk.mcpServers.filter((m) => m !== serverName)
      : [...selectedDisk.mcpServers, serverName]
    await updateDisk(selectedDisk.id, { mcpServers })
  }

  return (
    <div className="flex h-full gap-4">
      {/* Left: Disk List */}
      <div className="w-64 shrink-0 border-r border-border-subtle pr-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-text-secondary uppercase tracking-wider">Disks</h3>
          <button
            onClick={() => setIsCreating(true)}
            className="p-1 rounded hover:bg-bg-accent transition-colors"
            title="New Disk"
          >
            <Plus className="h-4 w-4 text-text-tertiary" />
          </button>
        </div>

        {isCreating && (
          <div className="mb-2 flex gap-1">
            <Input
              value={newDiskName}
              onChange={(e) => setNewDiskName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreate()
                if (e.key === 'Escape') setIsCreating(false)
              }}
              placeholder="Disk name..."
              className="text-sm"
              autoFocus
            />
          </div>
        )}

        <div className="space-y-0.5">
          {disks.map((disk) => {
            const Icon = ICON_MAP[disk.icon] || Disc
            return (
              <button
                key={disk.id}
                onClick={() => setSelectedDiskId(disk.id)}
                className={`flex items-center gap-2 w-full px-3 py-2 rounded-lg text-left text-sm transition-colors ${
                  selectedDiskId === disk.id
                    ? 'bg-bg-accent text-text-primary font-medium'
                    : 'text-text-secondary hover:bg-bg-accent'
                }`}
              >
                <Icon className="h-4 w-4 text-text-tertiary shrink-0" />
                <span className="truncate flex-1">{disk.name}</span>
                {disk.builtIn && (
                  <span className="text-[10px] text-text-tertiary bg-bg-tertiary px-1.5 py-0.5 rounded">
                    built-in
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Right: Disk Detail */}
      <div className="flex-1 min-w-0">
        {selectedDisk ? (
          <DiskDetail
            disk={selectedDisk}
            poolSkills={poolSkills}
            poolCommands={poolCommands}
            poolMCPServers={poolMCPServers}
            onUpdateField={handleUpdateField}
            onToggleSkill={handleToggleSkill}
            onToggleCommand={handleToggleCommand}
            onToggleMCP={handleToggleMCP}
            onDuplicate={(name) => duplicateDisk(selectedDisk.id, name)}
            onDelete={() => {
              deleteDisk(selectedDisk.id)
              setSelectedDiskId(null)
            }}
          />
        ) : (
          <div className="flex items-center justify-center h-full text-text-tertiary text-sm">
            Select a disk to view details
          </div>
        )}
      </div>
    </div>
  )
}

interface DiskDetailProps {
  disk: DiskDefinition
  poolSkills: Array<{ name: string }>
  poolCommands: Array<{ name: string }>
  poolMCPServers: Record<string, unknown>
  onUpdateField: (field: keyof DiskDefinition, value: unknown) => void
  onToggleSkill: (name: string) => void
  onToggleCommand: (name: string) => void
  onToggleMCP: (name: string) => void
  onDuplicate: (newName: string) => void
  onDelete: () => void
}

function DiskDetail({
  disk,
  poolSkills,
  poolCommands,
  poolMCPServers,
  onUpdateField,
  onToggleSkill,
  onToggleCommand,
  onToggleMCP,
  onDuplicate,
  onDelete
}: DiskDetailProps) {
  const [activeTab, setActiveTab] = useState<'skills' | 'commands' | 'mcp'>('skills')
  const isDefault = disk.isDefault

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-text-primary">{disk.name}</h3>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onDuplicate(`${disk.name} Copy`)}
            title="Duplicate as custom disk"
          >
            <Copy className="h-4 w-4 mr-1" />
            Duplicate
          </Button>
          {!disk.builtIn && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onDelete}
              className="text-red-600 hover:text-red-700 hover:bg-red-50"
            >
              <Trash2 className="h-4 w-4 mr-1" />
              Delete
            </Button>
          )}
        </div>
      </div>

      {/* Basic Info */}
      {!isDefault && (
        <>
          <div>
            <label className="text-xs font-medium text-text-tertiary uppercase tracking-wider mb-1 block">
              Description
            </label>
            <Input
              value={disk.description}
              onChange={(e) => onUpdateField('description', e.target.value)}
              disabled={disk.builtIn}
              placeholder="Brief description..."
            />
          </div>

          <div>
            <label className="text-xs font-medium text-text-tertiary uppercase tracking-wider mb-1 block">
              Icon
            </label>
            <div className="flex gap-2">
              {AVAILABLE_ICONS.map((iconName) => {
                const Icon = ICON_MAP[iconName] || Disc
                return (
                  <button
                    key={iconName}
                    onClick={() => !disk.builtIn && onUpdateField('icon', iconName)}
                    className={`p-2 rounded-lg border transition-colors ${
                      disk.icon === iconName
                        ? 'border-accent bg-accent/5'
                        : 'border-border-subtle hover:border-accent/50'
                    }`}
                    disabled={disk.builtIn}
                  >
                    <Icon className="h-5 w-5" />
                  </button>
                )
              })}
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-text-tertiary uppercase tracking-wider mb-1 block">
              System Prompt
            </label>
            <textarea
              value={disk.systemPrompt || ''}
              onChange={(e) => onUpdateField('systemPrompt', e.target.value || null)}
              disabled={disk.builtIn}
              placeholder="Instructions for the AI assistant..."
              className="w-full h-24 px-3 py-2 text-sm border border-border-subtle rounded-lg resize-none focus:outline-none focus:border-accent"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-text-tertiary uppercase tracking-wider mb-1 block">
              Model Preference
            </label>
            <Input
              value={disk.model || ''}
              onChange={(e) => onUpdateField('model', e.target.value || null)}
              disabled={disk.builtIn}
              placeholder="e.g. claude-sonnet-4-20250514 (leave empty for global default)"
            />
          </div>
        </>
      )}

      {isDefault && (
        <div className="bg-bg-tertiary rounded-lg p-4 text-sm text-text-secondary">
          The Default disk uses your existing global configuration from{' '}
          <code className="bg-bg-accent px-1 rounded">~/.claude/</code>. Skills, Commands, and MCP
          servers are loaded from the standard paths.
        </div>
      )}

      {/* Resource Tabs */}
      {!isDefault && (
        <>
          <div className="flex gap-1 border-b border-border-subtle">
            {(['skills', 'commands', 'mcp'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
                  activeTab === tab
                    ? 'border-accent text-accent'
                    : 'border-transparent text-text-tertiary hover:text-text-secondary'
                }`}
              >
                {tab === 'skills' ? 'Skills' : tab === 'commands' ? 'Commands' : 'MCP Servers'}
                <span className="ml-1 text-xs text-text-tertiary">
                  ({tab === 'skills'
                    ? disk.skills.length
                    : tab === 'commands'
                      ? disk.commands.length
                      : disk.mcpServers.length})
                </span>
              </button>
            ))}
          </div>

          <div className="space-y-1">
            {activeTab === 'skills' &&
              (poolSkills.length > 0 ? (
                poolSkills.map((skill) => (
                  <label
                    key={skill.name}
                    className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-bg-accent cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={disk.skills.includes(skill.name)}
                      onChange={() => onToggleSkill(skill.name)}
                      disabled={disk.builtIn}
                      className="rounded border-border-subtle"
                    />
                    <span className="text-sm text-text-primary">{skill.name}</span>
                  </label>
                ))
              ) : (
                <div className="text-sm text-text-tertiary py-4 text-center">
                  No skills in pool. Add skills to ~/.ccdisk/skills/
                </div>
              ))}

            {activeTab === 'commands' &&
              (poolCommands.length > 0 ? (
                poolCommands.map((cmd) => (
                  <label
                    key={cmd.name}
                    className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-bg-accent cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={disk.commands.includes(cmd.name)}
                      onChange={() => onToggleCommand(cmd.name)}
                      disabled={disk.builtIn}
                      className="rounded border-border-subtle"
                    />
                    <span className="text-sm text-text-primary">{cmd.name}</span>
                  </label>
                ))
              ) : (
                <div className="text-sm text-text-tertiary py-4 text-center">
                  No commands in pool. Add commands to ~/.ccdisk/commands/
                </div>
              ))}

            {activeTab === 'mcp' &&
              (Object.keys(poolMCPServers).length > 0 ? (
                Object.keys(poolMCPServers).map((serverName) => (
                  <label
                    key={serverName}
                    className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-bg-accent cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={disk.mcpServers.includes(serverName)}
                      onChange={() => onToggleMCP(serverName)}
                      disabled={disk.builtIn}
                      className="rounded border-border-subtle"
                    />
                    <span className="text-sm text-text-primary">{serverName}</span>
                  </label>
                ))
              ) : (
                <div className="text-sm text-text-tertiary py-4 text-center">
                  No MCP servers in pool. Add servers to ~/.ccdisk/mcp-servers.json
                </div>
              ))}
          </div>
        </>
      )}
    </div>
  )
}
```

**Step 2: Verify**

Run: `pnpm typecheck`

**Step 3: Commit**

```
git add src/renderer/src/components/settings/DiskManager.tsx
git commit -m "feat(disk): create DiskManager settings panel component"
```

---

## Task 14: Update SidePanel to Include Disks Panel Type

**Files:**

- Modify: `src/renderer/src/components/SidePanel.tsx`

**Step 1: Update PanelType**

Change line 11:

```typescript
export type PanelType = 'skills' | 'mcp' | 'claude' | 'disks';
```

**Step 2: Add to PANEL_TITLES**

Update lines 19-23:

```typescript
const PANEL_TITLES: Record<PanelType, string> = {
  skills: 'Skills & Commands',
  mcp: 'MCP Servers',
  claude: 'Claude Configuration',
  disks: 'Disk Management'
};
```

**Step 3: Import and render DiskManager**

Add import:

```typescript
import { DiskManager } from './settings/DiskManager';
```

Add rendering in the content area (after line 74):

```typescript
{panelType === 'disks' && <DiskManager />}
```

**Step 4: Verify**

Run: `pnpm typecheck`

**Step 5: Commit**

```
git add src/renderer/src/components/SidePanel.tsx
git commit -m "feat(disk): add 'disks' panel type to SidePanel"
```

---

## Task 15: Update App.tsx — Initialize Disk Store

**Files:**

- Modify: `src/renderer/src/App.tsx`

**Step 1: Import disk store**

Add imports:

```typescript
import { useDiskStore, setupDiskSwitchedListener } from './stores/disk-store';
```

**Step 2: Add disk initialization to useEffect**

In the `useEffect` (lines 23-40), add disk loading and listener setup:

```typescript
useEffect(() => {
  const teardownStreamListener = setupChatStreamListener();
  const teardownDiskListener = setupDiskSwitchedListener(); // NEW

  loadWorkspace();
  loadSessions();
  loadProviders();

  // Load disk data
  useDiskStore.getState().loadDisks(); // NEW
  useDiskStore.getState().loadCurrentDisk(); // NEW

  const unwatchFiles = setupFileWatcher();

  return () => {
    teardownStreamListener();
    teardownDiskListener(); // NEW
    unwatchFiles();
  };
}, [loadSessions, loadProviders, loadWorkspace, setupFileWatcher]);
```

**Step 3: Verify**

Run: `pnpm typecheck`

**Step 4: Commit**

```
git add src/renderer/src/App.tsx
git commit -m "feat(disk): initialize disk store and listener on app mount"
```

---

## Task 16: Final Typecheck and Verification

**Step 1: Run full typecheck**

Run: `pnpm typecheck`

Fix any remaining type errors. Common issues to watch for:

- `Session` type now has `diskId` — any code that constructs Session objects manually needs updating
- `PanelType` union expanded — the `as PanelType` cast in Sidebar should be updated to direct reference once types are in sync

**Step 2: Run lint**

Run: `pnpm lint`

Fix any lint issues.

**Step 3: Run format**

Run: `pnpm format`

**Step 4: Final commit**

```
git add -A
git commit -m "feat(disk): fix type errors and format code"
```

---

## Summary

| Task | Description         | Key Files                                                    |
| ---- | ------------------- | ------------------------------------------------------------ |
| 1    | Shared types        | `src/shared/types.ts`                                        |
| 2    | IPC channels        | `src/shared/ipc-channels.ts`                                 |
| 3    | DB migration        | `src/main/db/schema.ts`, `db-service.ts`                     |
| 4    | DiskService         | `src/main/services/disk-service.ts` (new)                    |
| 5    | disk-handler        | `src/main/ipc/disk-handler.ts` (new)                         |
| 6    | Wire main process   | `src/main/index.ts`                                          |
| 7    | Preload bridge      | `src/preload/index.ts`, `index.d.ts`                         |
| 8    | disk-store          | `src/renderer/src/stores/disk-store.ts` (new)                |
| 9    | chat-handler adapt  | `src/main/ipc/chat-handler.ts`, `index.ts`                   |
| 10   | chat-store adapt    | `src/renderer/src/stores/chat-store.ts`                      |
| 11   | DiskSwitcher        | `src/renderer/src/components/DiskSwitcher.tsx` (new)         |
| 12   | Sidebar integration | `src/renderer/src/components/Sidebar.tsx`                    |
| 13   | DiskManager         | `src/renderer/src/components/settings/DiskManager.tsx` (new) |
| 14   | SidePanel update    | `src/renderer/src/components/SidePanel.tsx`                  |
| 15   | App.tsx init        | `src/renderer/src/App.tsx`                                   |
| 16   | Final verify        | All files — typecheck, lint, format                          |
