# UI Improvements Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement 7 UI improvements: file icons, file preview panel, new chat flow, Claude config editor, MCP live status, skills reading, and merged Skills & Commands tab.

**Architecture:** Each improvement touches the full Electron stack (main process service/IPC -> preload bridge -> renderer store/component). Changes are organized to minimize merge conflicts: shared types and IPC channels first, then backend services, then preload, then stores, then UI components.

**Tech Stack:** Electron + React 19 + TypeScript + Tailwind CSS + Zustand + better-sqlite3 + Drizzle ORM + Claude Agent SDK v0.2.37

---

## Prerequisites

### Install dependencies

```bash
pnpm add file-icons-js mammoth xlsx react-pdf pdfjs-dist highlight.js
pnpm add -D @types/pdfjs-dist
```

> **Note:** `file-icons-js` provides VS Code-style file extension to icon class mapping. `highlight.js` for code syntax highlighting. `mammoth` for .docx->HTML. `xlsx` (SheetJS) for Excel->HTML. `react-pdf` + `pdfjs-dist` for PDF rendering.

---

## Task 1: Shared Types & IPC Channels

**Files:**

- Modify: `src/shared/types.ts`
- Modify: `src/shared/ipc-channels.ts`

### Step 1: Add new types to `src/shared/types.ts`

After the existing `IPCResponse` type (line 165), add:

```typescript
/**
 * Extended file content response with binary support
 */
export interface FileContentResponse {
  content: string; // text or base64-encoded
  size: number;
  type: string; // file extension
  encoding: 'utf-8' | 'base64';
  mimeType: string;
}

/**
 * Claude environment variables in ~/.claude/settings.json
 */
export interface ClaudeEnvConfig {
  ANTHROPIC_AUTH_TOKEN?: string;
  ANTHROPIC_BASE_URL?: string;
  ANTHROPIC_MODEL?: string;
  ANTHROPIC_DEFAULT_SONNET_MODEL?: string;
  ANTHROPIC_DEFAULT_OPUS_MODEL?: string;
  ANTHROPIC_DEFAULT_HAIKU_MODEL?: string;
}

/**
 * MCP server live status (from SDK query.mcpServerStatus())
 */
export interface MCPServerStatus {
  name: string;
  status: 'connected' | 'failed' | 'needs-auth' | 'pending' | 'disabled';
  tools: string[];
  error?: string;
}

/**
 * SDK slash command (from query.supportedCommands())
 */
export interface SlashCommand {
  name: string;
  description: string;
  argumentHint?: string;
}
```

### Step 2: Add new IPC channels to `src/shared/ipc-channels.ts`

Add these channels to the `IPC_CHANNELS` const object, after the existing MCP channels (line 55):

```typescript
  // Claude env config (replaces provider system)
  SETTINGS_GET_CLAUDE_ENV: 'settings:get-claude-env',
  SETTINGS_UPDATE_CLAUDE_ENV: 'settings:update-claude-env',

  // MCP live status (requires active session)
  MCP_GET_STATUS: 'mcp:get-status',
  MCP_RECONNECT: 'mcp:reconnect',
  MCP_TOGGLE: 'mcp:toggle',

  // SDK commands (requires active session)
  SDK_GET_COMMANDS: 'sdk:get-commands',
```

### Step 3: Commit

```bash
git add src/shared/types.ts src/shared/ipc-channels.ts
git commit -m "feat: add shared types and IPC channels for UI improvements"
```

---

## Task 2: Backend - Config Service (Claude Env)

**Files:**

- Modify: `src/main/services/config-service.ts`

### Step 1: Add `getClaudeEnv` and `updateClaudeEnv` methods

After the `syncProviderToFile` method (line 100), add:

```typescript
  /**
   * Read Claude env variables from settings.json
   * Returns only the 6 known ANTHROPIC_ keys
   */
  async getClaudeEnv(): Promise<Record<string, string>> {
    const settings = await this.getSettings()
    const env = (settings.env as Record<string, string>) || {}
    const knownKeys = [
      'ANTHROPIC_AUTH_TOKEN',
      'ANTHROPIC_BASE_URL',
      'ANTHROPIC_MODEL',
      'ANTHROPIC_DEFAULT_SONNET_MODEL',
      'ANTHROPIC_DEFAULT_OPUS_MODEL',
      'ANTHROPIC_DEFAULT_HAIKU_MODEL'
    ]
    const result: Record<string, string> = {}
    for (const key of knownKeys) {
      if (env[key]) {
        result[key] = env[key]
      }
    }
    return result
  }

  /**
   * Update Claude env variables in settings.json
   * Merges with existing env, removes keys with empty string values
   */
  async updateClaudeEnv(envUpdates: Record<string, string>): Promise<void> {
    const settings = await this.getSettings()
    const existingEnv = (settings.env as Record<string, string>) || {}

    // Merge updates, remove empty values
    const newEnv = { ...existingEnv }
    for (const [key, value] of Object.entries(envUpdates)) {
      if (value && value.trim()) {
        newEnv[key] = value.trim()
      } else {
        delete newEnv[key]
      }
    }

    await this.updateSettings({ env: newEnv })
  }
```

### Step 2: Commit

```bash
git add src/main/services/config-service.ts
git commit -m "feat: add Claude env read/write methods to ConfigService"
```

---

## Task 3: Backend - Claude Service (Expose Query for MCP/Commands)

**Files:**

- Modify: `src/main/services/claude-service.ts`

### Step 1: Add methods to expose active Query operations

After the `abortSession` method (line 449), add:

```typescript
  /**
   * Get active Query instance for a session (for MCP operations, commands, etc.)
   * Returns null if no active session
   */
  getActiveQuery(sessionId: string): Query | null {
    const session = this.activeSessions.get(sessionId)
    return session?.query || null
  }

  /**
   * Get MCP server status for an active session
   * Returns null if no active session or SDK doesn't support it
   */
  async getMcpServerStatus(sessionId: string): Promise<unknown[] | null> {
    const q = this.getActiveQuery(sessionId)
    if (!q) return null
    try {
      return await q.mcpServerStatus()
    } catch (error) {
      console.error('Failed to get MCP server status:', error)
      return null
    }
  }

  /**
   * Reconnect an MCP server for an active session
   */
  async reconnectMcpServer(sessionId: string, serverName: string): Promise<boolean> {
    const q = this.getActiveQuery(sessionId)
    if (!q) return false
    try {
      await q.reconnectMcpServer(serverName)
      return true
    } catch (error) {
      console.error('Failed to reconnect MCP server:', error)
      return false
    }
  }

  /**
   * Toggle an MCP server for an active session
   */
  async toggleMcpServer(
    sessionId: string,
    serverName: string,
    enabled: boolean
  ): Promise<boolean> {
    const q = this.getActiveQuery(sessionId)
    if (!q) return false
    try {
      await q.toggleMcpServer(serverName, enabled)
      return true
    } catch (error) {
      console.error('Failed to toggle MCP server:', error)
      return false
    }
  }

  /**
   * Get supported slash commands from SDK for an active session
   */
  async getSupportedCommands(sessionId: string): Promise<unknown[] | null> {
    const q = this.getActiveQuery(sessionId)
    if (!q) return null
    try {
      return await q.supportedCommands()
    } catch (error) {
      console.error('Failed to get supported commands:', error)
      return null
    }
  }

  /**
   * Check if a session is active
   */
  hasActiveSession(sessionId: string): boolean {
    return this.activeSessions.has(sessionId)
  }
```

### Step 2: Commit

```bash
git add src/main/services/claude-service.ts
git commit -m "feat: expose MCP status and SDK commands via ClaudeService"
```

---

## Task 4: Backend - IPC Handlers

**Files:**

- Modify: `src/main/ipc/settings-handler.ts`
- Modify: `src/main/ipc/sessions-handler.ts`
- Modify: `src/main/ipc/workspace-handler.ts`
- Create: `src/main/ipc/sdk-handler.ts`

### Step 1: Add Claude env handlers to `settings-handler.ts`

After the existing `SETTINGS_SYNC_TO_FILE` handler (line 110), add:

```typescript
// Get Claude env variables from settings.json
ipcMain.handle(IPC_CHANNELS.SETTINGS_GET_CLAUDE_ENV, async () => {
  try {
    const env = await configService.getClaudeEnv();
    return { success: true, data: env } as IPCResponse;
  } catch (error) {
    console.error('SETTINGS_GET_CLAUDE_ENV error:', error);
    return { success: false, error: (error as Error).message } as IPCResponse;
  }
});

// Update Claude env variables in settings.json
ipcMain.handle(IPC_CHANNELS.SETTINGS_UPDATE_CLAUDE_ENV, async (_event, envUpdates: Record<string, string>) => {
  try {
    await configService.updateClaudeEnv(envUpdates);
    return { success: true } as IPCResponse;
  } catch (error) {
    console.error('SETTINGS_UPDATE_CLAUDE_ENV error:', error);
    return { success: false, error: (error as Error).message } as IPCResponse;
  }
});
```

### Step 2: Add session rename handler to `sessions-handler.ts`

After the `SESSIONS_GET_MESSAGES` handler (line 73), add:

```typescript
// Update session (rename)
ipcMain.handle(IPC_CHANNELS.SESSIONS_UPDATE, async (_event, id: string, updates: { name?: string }) => {
  try {
    const session = await dbService.updateSession(id, {
      ...updates,
      updatedAt: new Date()
    });
    return { success: true, data: session } as IPCResponse;
  } catch (error) {
    console.error('SESSIONS_UPDATE error:', error);
    return { success: false, error: (error as Error).message } as IPCResponse;
  }
});
```

> **Note:** Verify that `dbService.updateSession()` exists. If it doesn't, you'll need to add it to `DatabaseService`. Check `src/main/services/db-service.ts` for existing methods. It likely needs a method like:
>
> ```typescript
> async updateSession(id: string, updates: { name?: string; updatedAt?: Date }): Promise<Session> {
>   // Update session in SQLite via Drizzle
> }
> ```

### Step 3: Update `getFileContent` in `workspace-handler.ts` for binary support

Replace the entire `WORKSPACE_GET_FILE_CONTENT` handler (lines 122-167) with:

```typescript
// Get file content (text or binary)
ipcMain.handle(
  IPC_CHANNELS.WORKSPACE_GET_FILE_CONTENT,
  async (
    _event,
    filePath: string
  ): Promise<IPCResponse<{ content: string; size: number; type: string; encoding: string; mimeType: string }>> => {
    try {
      const workspacePath = fileWatcher.getWorkspacePath();

      if (!workspacePath) {
        return { success: false, error: 'No workspace selected' };
      }

      // Resolve full path and ensure it's within workspace
      const fullPath = path.resolve(workspacePath, filePath);
      if (!fullPath.startsWith(workspacePath)) {
        return { success: false, error: 'Invalid file path: outside workspace' };
      }

      // Check file size (10MB for binary, 1MB for text)
      const stats = await fs.stat(fullPath);
      const ext = path.extname(fullPath).toLowerCase();
      const binaryExtensions = new Set([
        '.png',
        '.jpg',
        '.jpeg',
        '.gif',
        '.bmp',
        '.webp',
        '.svg',
        '.ico',
        '.pdf',
        '.docx',
        '.xlsx',
        '.xls',
        '.pptx',
        '.ppt',
        '.zip',
        '.tar',
        '.gz',
        '.7z',
        '.mp3',
        '.mp4',
        '.wav',
        '.avi',
        '.mkv'
      ]);
      const isBinary = binaryExtensions.has(ext);
      const maxSize = isBinary ? 10 * 1024 * 1024 : MAX_FILE_SIZE;

      if (stats.size > maxSize) {
        return {
          success: false,
          error: `File too large: ${stats.size} bytes (max ${maxSize} bytes)`
        };
      }

      // Determine MIME type
      const mimeMap: Record<string, string> = {
        '.md': 'text/markdown',
        '.markdown': 'text/markdown',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.webp': 'image/webp',
        '.svg': 'image/svg+xml',
        '.bmp': 'image/bmp',
        '.ico': 'image/x-icon',
        '.pdf': 'application/pdf',
        '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        '.xls': 'application/vnd.ms-excel',
        '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        '.csv': 'text/csv',
        '.json': 'application/json',
        '.html': 'text/html',
        '.htm': 'text/html',
        '.css': 'text/css',
        '.js': 'text/javascript',
        '.ts': 'text/typescript',
        '.tsx': 'text/typescript',
        '.jsx': 'text/javascript',
        '.py': 'text/x-python',
        '.rb': 'text/x-ruby',
        '.go': 'text/x-go',
        '.rs': 'text/x-rust',
        '.sh': 'text/x-shellscript',
        '.bash': 'text/x-shellscript',
        '.yml': 'text/yaml',
        '.yaml': 'text/yaml',
        '.xml': 'text/xml',
        '.toml': 'text/toml'
      };
      const mimeType = mimeMap[ext] || (isBinary ? 'application/octet-stream' : 'text/plain');

      // Read file
      if (isBinary) {
        const buffer = await fs.readFile(fullPath);
        return {
          success: true,
          data: {
            content: buffer.toString('base64'),
            size: stats.size,
            type: ext || 'unknown',
            encoding: 'base64',
            mimeType
          }
        };
      } else {
        const content = await fs.readFile(fullPath, 'utf-8');
        return {
          success: true,
          data: {
            content,
            size: stats.size,
            type: ext || 'unknown',
            encoding: 'utf-8',
            mimeType
          }
        };
      }
    } catch (error) {
      console.error('WORKSPACE_GET_FILE_CONTENT error:', error);
      return { success: false, error: (error as Error).message };
    }
  }
);
```

### Step 4: Create SDK handler for MCP status and commands

Create `src/main/ipc/sdk-handler.ts`:

```typescript
/**
 * SDK IPC Handlers
 * Wires MCP live status and SDK commands to ClaudeService
 */

import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../shared/ipc-channels';
import type { IPCResponse } from '../../shared/types';
import { ClaudeService } from '../services/claude-service';

export function registerSdkHandlers(claudeService: ClaudeService) {
  // Get MCP server status for active session
  ipcMain.handle(IPC_CHANNELS.MCP_GET_STATUS, async (_event, sessionId: string): Promise<IPCResponse> => {
    try {
      if (!claudeService.hasActiveSession(sessionId)) {
        return { success: true, data: null };
      }
      const status = await claudeService.getMcpServerStatus(sessionId);
      return { success: true, data: status };
    } catch (error) {
      console.error('MCP_GET_STATUS error:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  // Reconnect MCP server
  ipcMain.handle(
    IPC_CHANNELS.MCP_RECONNECT,
    async (_event, sessionId: string, serverName: string): Promise<IPCResponse> => {
      try {
        const result = await claudeService.reconnectMcpServer(sessionId, serverName);
        return { success: true, data: result };
      } catch (error) {
        console.error('MCP_RECONNECT error:', error);
        return { success: false, error: (error as Error).message };
      }
    }
  );

  // Toggle MCP server
  ipcMain.handle(
    IPC_CHANNELS.MCP_TOGGLE,
    async (_event, sessionId: string, serverName: string, enabled: boolean): Promise<IPCResponse> => {
      try {
        const result = await claudeService.toggleMcpServer(sessionId, serverName, enabled);
        return { success: true, data: result };
      } catch (error) {
        console.error('MCP_TOGGLE error:', error);
        return { success: false, error: (error as Error).message };
      }
    }
  );

  // Get supported SDK commands
  ipcMain.handle(IPC_CHANNELS.SDK_GET_COMMANDS, async (_event, sessionId: string): Promise<IPCResponse> => {
    try {
      if (!claudeService.hasActiveSession(sessionId)) {
        return { success: true, data: null };
      }
      const commands = await claudeService.getSupportedCommands(sessionId);
      return { success: true, data: commands };
    } catch (error) {
      console.error('SDK_GET_COMMANDS error:', error);
      return { success: false, error: (error as Error).message };
    }
  });
}
```

### Step 5: Register SDK handler in `src/main/index.ts`

Add import at top (after line 24):

```typescript
import { registerSdkHandlers } from './ipc/sdk-handler';
```

Add registration call where other handlers are registered (look for `registerChatHandlers` call and add after it):

```typescript
registerSdkHandlers(claudeService);
```

### Step 6: Commit

```bash
git add src/main/ipc/settings-handler.ts src/main/ipc/sessions-handler.ts src/main/ipc/workspace-handler.ts src/main/ipc/sdk-handler.ts src/main/index.ts
git commit -m "feat: add IPC handlers for Claude env, session rename, binary files, SDK operations"
```

---

## Task 5: Backend - Database Service (Session Update)

**Files:**

- Modify: `src/main/services/db-service.ts`

### Step 1: Add `updateSession` method

Check if `updateSession` already exists in `db-service.ts`. If not, add it alongside the other session methods:

```typescript
  /**
   * Update session by ID
   */
  async updateSession(
    id: string,
    updates: { name?: string; sdkSessionId?: string | null; model?: string | null; updatedAt?: Date }
  ): Promise<Session | null> {
    try {
      const result = this.db
        .update(sessions)
        .set(updates)
        .where(eq(sessions.id, id))
        .returning()
        .get()
      return result || null
    } catch (error) {
      console.error('Failed to update session:', error)
      throw error
    }
  }
```

> **Note:** Check the existing Drizzle schema in `src/main/db/` for the correct table name and column references. The `sessions` table likely has `id`, `name`, `sdkSessionId`, `model`, `createdAt`, `updatedAt` columns.

### Step 2: Commit

```bash
git add src/main/services/db-service.ts
git commit -m "feat: add updateSession method to DatabaseService"
```

---

## Task 6: Preload Bridge

**Files:**

- Modify: `src/preload/index.ts`
- Modify: `src/preload/index.d.ts`

### Step 1: Update `src/preload/index.ts`

Add to the `settings` namespace (after `syncToFile` around line 85):

```typescript
    getClaudeEnv: () =>
      ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_GET_CLAUDE_ENV),
    updateClaudeEnv: (envUpdates: Record<string, string>) =>
      ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_UPDATE_CLAUDE_ENV, envUpdates),
```

Add to the `sessions` namespace - verify `update` is already there (around line 43). It should be:

```typescript
    update: (id: string, updates: { name?: string }) =>
      ipcRenderer.invoke(IPC_CHANNELS.SESSIONS_UPDATE, id, updates),
```

Add new `sdk` namespace (after the `mcp` namespace, around line 132):

```typescript
    sdk: {
      getMcpStatus: (sessionId: string) =>
        ipcRenderer.invoke(IPC_CHANNELS.MCP_GET_STATUS, sessionId),
      reconnectMcpServer: (sessionId: string, serverName: string) =>
        ipcRenderer.invoke(IPC_CHANNELS.MCP_RECONNECT, sessionId, serverName),
      toggleMcpServer: (sessionId: string, serverName: string, enabled: boolean) =>
        ipcRenderer.invoke(IPC_CHANNELS.MCP_TOGGLE, sessionId, serverName, enabled),
      getCommands: (sessionId: string) =>
        ipcRenderer.invoke(IPC_CHANNELS.SDK_GET_COMMANDS, sessionId),
    },
```

### Step 2: Update `src/preload/index.d.ts`

Add to the `API` interface the corresponding type declarations.

In the `settings` section, add:

```typescript
getClaudeEnv: () => Promise<IPCResponse<Record<string, string>>>;
updateClaudeEnv: (envUpdates: Record<string, string>) => Promise<IPCResponse<void>>;
```

Add new `sdk` section:

```typescript
sdk: {
  getMcpStatus: (sessionId: string) => Promise<IPCResponse<MCPServerStatus[] | null>>;
  reconnectMcpServer: (sessionId: string, serverName: string) => Promise<IPCResponse<boolean>>;
  toggleMcpServer: (sessionId: string, serverName: string, enabled: boolean) => Promise<IPCResponse<boolean>>;
  getCommands: (sessionId: string) => Promise<IPCResponse<SlashCommand[] | null>>;
}
```

Also add imports for `MCPServerStatus` and `SlashCommand` at the top of the file.

### Step 3: Commit

```bash
git add src/preload/index.ts src/preload/index.d.ts
git commit -m "feat: add preload bridge for Claude env, SDK operations"
```

---

## Task 7: File Icons in Directory Tree

**Files:**

- Modify: `src/renderer/src/components/workspace/FileTree.tsx`
- Modify: `src/renderer/src/components/workspace/FileTree.css`

### Step 1: Update `FileTree.tsx` to use `file-icons-js`

Replace the `NodeRenderer` function (lines 30-61) with:

```typescript
// Map file extension to icon class using file-icons-js
import icons from 'file-icons-js'

function getFileIconClass(filename: string): string {
  return icons.getClassWithColor(filename) || 'default-icon'
}

function NodeRenderer({ node, style, dragHandle }: any) {
  const data = node.data as TreeNode
  const isSelected = node.isSelected

  return (
    <div
      ref={dragHandle}
      style={style}
      className={`tree-node flex items-center gap-2 px-4 py-1.5 cursor-pointer hover:bg-gray-100 transition-colors ${
        isSelected ? 'bg-accent bg-opacity-10 text-accent' : 'text-text-primary'
      }`}
      onClick={() => node.toggle()}
    >
      {/* Expand/Collapse arrow for directories */}
      {data.type === 'directory' && (
        <span className="flex-shrink-0">
          {node.isOpen ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </span>
      )}

      {/* File/Folder Icon */}
      {data.type === 'directory' ? (
        <span
          className={`file-icon ${node.isOpen ? getFileIconClass('folder-open') : getFileIconClass('folder')}`}
          style={{ fontSize: '16px', width: '16px', height: '16px', flexShrink: 0 }}
        />
      ) : (
        <span
          className={`file-icon ${getFileIconClass(data.name)}`}
          style={{ fontSize: '16px', width: '16px', height: '16px', flexShrink: 0 }}
        />
      )}

      {/* Name */}
      <span className="truncate flex-1 text-sm">{data.name}</span>
    </div>
  )
}
```

> **Note:** `file-icons-js` uses CSS classes from Atom's file-icons package. You need to import its CSS. If the library doesn't work well in this context, fall back to a simple extension-to-emoji/SVG mapping function instead. Test this step carefully.

### Step 2: Import file-icons CSS in `FileTree.css`

Add at the top of `FileTree.css`:

```css
@import 'file-icons-js/css/style.css';
```

> **Fallback approach:** If `file-icons-js` CSS doesn't integrate well with the Electron/Vite build, create a manual icon mapping using Lucide icons or inline SVGs. A simple approach:
>
> ```typescript
> const ICON_MAP: Record<string, { icon: typeof FileIcon; color: string }> = {
>   '.ts': { icon: FileCode, color: '#3178c6' },
>   '.tsx': { icon: FileCode, color: '#3178c6' },
>   '.js': { icon: FileCode, color: '#f7df1e' },
>   '.json': { icon: FileJson, color: '#292929' },
>   '.md': { icon: FileText, color: '#083fa1' },
>   '.css': { icon: FileCode, color: '#264de4' },
>   '.html': { icon: FileCode, color: '#e34c26' },
>   '.py': { icon: FileCode, color: '#3776ab' }
>   // ... etc
> };
> ```

### Step 3: Remove unused Lucide import

Remove `FileIcon` from the import line at line 6 (keep `FolderIcon` as fallback if needed, or remove if using file-icons-js for folders too).

### Step 4: Commit

```bash
git add src/renderer/src/components/workspace/FileTree.tsx src/renderer/src/components/workspace/FileTree.css
git commit -m "feat: add VS Code-style file icons to directory tree"
```

---

## Task 8: File Preview Panel

**Files:**

- Create: `src/renderer/src/components/workspace/FilePreview.tsx`
- Create: `src/renderer/src/components/workspace/CodePreview.tsx`
- Create: `src/renderer/src/components/workspace/OfficePreview.tsx`
- Modify: `src/renderer/src/stores/workspace-store.ts`
- Modify: `src/renderer/src/components/MainLayout.tsx`
- Modify: `src/renderer/src/App.tsx`

### Step 1: Update workspace store for binary file support

Replace the `getFileContent` method (lines 80-92) and add new state/actions to `workspace-store.ts`:

Add to the interface (after `selectedFile`, line 13):

```typescript
fileContent: FileContentResponse | null;
isLoadingFile: boolean;
```

Add to the interface actions (after `getFileContent`):

```typescript
  loadFileContent: (path: string) => Promise<void>
  clearFileContent: () => void
```

Add to initial state:

```typescript
  fileContent: null,
  isLoadingFile: false,
```

Replace `selectFile` (line 76-78):

```typescript
  selectFile: (path: string) => {
    set({ selectedFile: path })
    get().loadFileContent(path)
  },
```

Replace `getFileContent` (lines 80-92) and add `loadFileContent`:

```typescript
  getFileContent: async (path: string) => {
    try {
      const response = await window.api.workspace.getFileContent(path)
      if (response.success && response.data) {
        return response.data.content
      }
      return null
    } catch (error) {
      console.error('Failed to get file content:', error)
      return null
    }
  },

  loadFileContent: async (path: string) => {
    set({ isLoadingFile: true })
    try {
      const response = await window.api.workspace.getFileContent(path)
      if (response.success && response.data) {
        set({ fileContent: response.data, isLoadingFile: false })
      } else {
        set({ fileContent: null, isLoadingFile: false })
      }
    } catch (error) {
      console.error('Failed to load file content:', error)
      set({ fileContent: null, isLoadingFile: false })
    }
  },

  clearFileContent: () => {
    set({ selectedFile: null, fileContent: null })
  },
```

Also add import for `FileContentResponse` at the top:

```typescript
import type { FileNode, FileContentResponse } from '../../../shared/types';
```

### Step 2: Create `CodePreview.tsx`

Create `src/renderer/src/components/workspace/CodePreview.tsx`:

```typescript
/**
 * CodePreview - Syntax-highlighted code viewer using highlight.js
 */

import { useEffect, useRef } from 'react'
import hljs from 'highlight.js'
import 'highlight.js/styles/github.css'

interface CodePreviewProps {
  content: string
  language?: string
  fileName?: string
}

// Map file extension to highlight.js language
const EXT_TO_LANG: Record<string, string> = {
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.py': 'python',
  '.rb': 'ruby',
  '.go': 'go',
  '.rs': 'rust',
  '.java': 'java',
  '.c': 'c',
  '.cpp': 'cpp',
  '.h': 'c',
  '.cs': 'csharp',
  '.php': 'php',
  '.swift': 'swift',
  '.kt': 'kotlin',
  '.sh': 'bash',
  '.bash': 'bash',
  '.zsh': 'bash',
  '.json': 'json',
  '.yaml': 'yaml',
  '.yml': 'yaml',
  '.xml': 'xml',
  '.html': 'html',
  '.htm': 'html',
  '.css': 'css',
  '.scss': 'scss',
  '.less': 'less',
  '.sql': 'sql',
  '.md': 'markdown',
  '.toml': 'ini',
  '.ini': 'ini',
  '.dockerfile': 'dockerfile',
  '.makefile': 'makefile',
}

function getLanguage(fileName?: string): string | undefined {
  if (!fileName) return undefined
  const ext = '.' + fileName.split('.').pop()?.toLowerCase()
  return EXT_TO_LANG[ext]
}

export function CodePreview({ content, language, fileName }: CodePreviewProps) {
  const codeRef = useRef<HTMLElement>(null)
  const lang = language || getLanguage(fileName)

  useEffect(() => {
    if (codeRef.current) {
      // Reset previous highlighting
      codeRef.current.removeAttribute('data-highlighted')
      if (lang) {
        codeRef.current.className = `language-${lang}`
      }
      hljs.highlightElement(codeRef.current)
    }
  }, [content, lang])

  return (
    <div className="h-full overflow-auto bg-white">
      <pre className="p-4 text-sm leading-relaxed">
        <code ref={codeRef} className={lang ? `language-${lang}` : ''}>
          {content}
        </code>
      </pre>
    </div>
  )
}
```

### Step 3: Create `OfficePreview.tsx`

Create `src/renderer/src/components/workspace/OfficePreview.tsx`:

```typescript
/**
 * OfficePreview - Renders Word, Excel, and PPT files
 */

import { useEffect, useState } from 'react'

interface OfficePreviewProps {
  content: string // base64 encoded
  mimeType: string
  fileName: string
}

export function OfficePreview({ content, mimeType, fileName }: OfficePreviewProps) {
  const [html, setHtml] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function convert() {
      setIsLoading(true)
      setError(null)

      try {
        // Decode base64 to ArrayBuffer
        const binary = atob(content)
        const bytes = new Uint8Array(binary.length)
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i)
        }
        const buffer = bytes.buffer

        if (mimeType.includes('wordprocessingml') || fileName.endsWith('.docx')) {
          // Word document
          const mammoth = await import('mammoth')
          const result = await mammoth.convertToHtml({ arrayBuffer: buffer })
          if (!cancelled) setHtml(result.value)
        } else if (
          mimeType.includes('spreadsheetml') ||
          mimeType.includes('ms-excel') ||
          fileName.endsWith('.xlsx') ||
          fileName.endsWith('.xls') ||
          fileName.endsWith('.csv')
        ) {
          // Excel document
          const XLSX = await import('xlsx')
          const workbook = XLSX.read(buffer, { type: 'array' })
          const firstSheet = workbook.SheetNames[0]
          const worksheet = workbook.Sheets[firstSheet]
          const htmlTable = XLSX.utils.sheet_to_html(worksheet)
          if (!cancelled) {
            // Wrap with sheet tabs if multiple sheets
            const sheetTabs = workbook.SheetNames.length > 1
              ? `<div style="margin-bottom:8px;display:flex;gap:4px">${workbook.SheetNames.map(
                  (name) =>
                    `<span style="padding:4px 12px;border-radius:4px;background:${name === firstSheet ? '#e0e7ff' : '#f3f4f6'};font-size:12px;cursor:pointer">${name}</span>`
                ).join('')}</div>`
              : ''
            setHtml(sheetTabs + htmlTable)
          }
        } else if (
          mimeType.includes('presentationml') ||
          fileName.endsWith('.pptx')
        ) {
          // PowerPoint - basic text extraction
          if (!cancelled) {
            setHtml(
              '<div style="padding:20px;text-align:center;color:#666"><p>PowerPoint preview is limited to basic text extraction.</p><p>Open the file externally for full rendering.</p></div>'
            )
          }
        } else {
          if (!cancelled) setError('Unsupported office format')
        }
      } catch (err) {
        if (!cancelled) {
          console.error('Office preview error:', err)
          setError(`Failed to render: ${(err as Error).message}`)
        }
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    convert()
    return () => { cancelled = true }
  }, [content, mimeType, fileName])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-text-tertiary">
        <div className="animate-spin h-6 w-6 border-2 border-current border-t-transparent rounded-full" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full text-red-500 text-sm">
        {error}
      </div>
    )
  }

  return (
    <div
      className="h-full overflow-auto p-4 prose prose-sm max-w-none"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
```

### Step 4: Create `FilePreview.tsx`

Create `src/renderer/src/components/workspace/FilePreview.tsx`:

```typescript
/**
 * FilePreview - Main container that routes to the appropriate renderer
 */

import { useWorkspaceStore } from '../../stores/workspace-store'
import { CodePreview } from './CodePreview'
import { OfficePreview } from './OfficePreview'
import { MarkdownRenderer } from '../chat/MarkdownRenderer'
import { X } from 'lucide-react'

export function FilePreview() {
  const { selectedFile, fileContent, isLoadingFile, clearFileContent } = useWorkspaceStore()

  if (!selectedFile) return null

  if (isLoadingFile) {
    return (
      <div className="h-full flex items-center justify-center bg-white border-l border-border-subtle">
        <div className="animate-spin h-6 w-6 border-2 border-accent border-t-transparent rounded-full" />
      </div>
    )
  }

  if (!fileContent) {
    return (
      <div className="h-full flex items-center justify-center bg-white border-l border-border-subtle text-text-tertiary text-sm">
        Failed to load file
      </div>
    )
  }

  const fileName = selectedFile.split('/').pop() || selectedFile
  const { content, mimeType, encoding } = fileContent

  // Determine preview type
  const getPreviewComponent = () => {
    // Markdown
    if (mimeType === 'text/markdown') {
      return (
        <div className="h-full overflow-auto p-6 prose prose-sm max-w-none">
          <MarkdownRenderer content={content} />
        </div>
      )
    }

    // Images
    if (mimeType.startsWith('image/')) {
      const src = encoding === 'base64'
        ? `data:${mimeType};base64,${content}`
        : `data:${mimeType};utf8,${encodeURIComponent(content)}`
      return (
        <div className="h-full flex items-center justify-center p-4 bg-gray-50">
          <img
            src={src}
            alt={fileName}
            className="max-w-full max-h-full object-contain rounded shadow-sm"
          />
        </div>
      )
    }

    // PDF
    if (mimeType === 'application/pdf') {
      const pdfUrl = `data:application/pdf;base64,${content}`
      return (
        <div className="h-full">
          <iframe
            src={pdfUrl}
            className="w-full h-full border-0"
            title={fileName}
          />
        </div>
      )
    }

    // Office documents (Word, Excel, PPT)
    if (
      mimeType.includes('officedocument') ||
      mimeType.includes('ms-excel') ||
      mimeType.includes('ms-powerpoint')
    ) {
      return <OfficePreview content={content} mimeType={mimeType} fileName={fileName} />
    }

    // CSV (render as table via xlsx)
    if (mimeType === 'text/csv') {
      // Convert CSV text to base64 for OfficePreview
      const base64 = btoa(content)
      return <OfficePreview content={base64} mimeType={mimeType} fileName={fileName} />
    }

    // Code and text files (default)
    return <CodePreview content={content} fileName={fileName} />
  }

  return (
    <div className="h-full flex flex-col bg-white border-l border-border-subtle">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border-subtle bg-bg-secondary">
        <div className="text-sm font-medium text-text-primary truncate">{fileName}</div>
        <button
          onClick={clearFileContent}
          className="p-1 rounded hover:bg-bg-accent transition-colors"
          title="Close preview"
        >
          <X className="h-4 w-4 text-text-tertiary" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {getPreviewComponent()}
      </div>
    </div>
  )
}
```

### Step 5: Update `MainLayout.tsx` for split panel

Replace the entire content area section in `MainLayout.tsx`. The new layout adds an optional `preview` slot:

```typescript
/**
 * MainLayout Component - Application shell with sidebar navigation
 */

import { type ReactNode, useState } from 'react'
import { cn } from '../lib/utils'
import { Menu } from 'lucide-react'

interface MainLayoutProps {
  children: ReactNode
  sidebar?: ReactNode
  toolbar?: ReactNode
  preview?: ReactNode
}

export function MainLayout({ children, sidebar, toolbar, preview }: MainLayoutProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true)

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-bg-primary">
      {/* Sidebar */}
      {sidebar && (
        <aside
          className={cn(
            'flex flex-col border-r border-border-subtle bg-bg-secondary transition-all duration-300 ease-in-out',
            isSidebarOpen ? 'w-[260px]' : 'w-0 border-r-0'
          )}
        >
          <div
            className={cn(
              'flex-1 overflow-hidden w-[260px]',
              isSidebarOpen ? 'opacity-100' : 'opacity-0'
            )}
          >
            {sidebar}
          </div>
        </aside>
      )}

      {/* Main content area */}
      <main className="flex flex-1 flex-col overflow-hidden relative">
        {/* Toolbar / Header Area */}
        <div className="absolute top-4 left-4 z-50">
          <button
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="rounded-lg p-2 text-text-tertiary hover:bg-bg-accent hover:text-text-secondary transition-colors"
            aria-label="Toggle sidebar"
            title={isSidebarOpen ? 'Close Sidebar' : 'Open Sidebar'}
          >
            <Menu className="h-5 w-5" />
          </button>
        </div>

        {toolbar && (
          <div className="flex items-center justify-between border-b border-border-subtle bg-bg-primary px-4 py-2 pl-16">
            {toolbar}
          </div>
        )}

        {/* Content + Preview split */}
        <div className="flex-1 overflow-hidden flex">
          {/* Chat content */}
          <div className={cn('overflow-hidden', preview ? 'w-1/2' : 'flex-1')}>
            {children}
          </div>

          {/* File Preview panel */}
          {preview && (
            <div className="w-1/2 overflow-hidden">
              {preview}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
```

### Step 6: Update `App.tsx` to wire preview

In `App.tsx`, import FilePreview and pass it to MainLayout:

Add import:

```typescript
import { FilePreview } from './components/workspace/FilePreview';
import { useWorkspaceStore } from './stores/workspace-store';
```

Inside `App` function, add:

```typescript
const selectedFile = useWorkspaceStore((s) => s.selectedFile);
```

Update the return to include preview:

```typescript
  return (
    <MainLayout
      sidebar={<Sidebar />}
      toolbar={<Toolbar />}
      preview={selectedFile ? <FilePreview /> : undefined}
    >
      <ChatInterface />
    </MainLayout>
  )
```

### Step 7: Commit

```bash
git add src/renderer/src/components/workspace/FilePreview.tsx src/renderer/src/components/workspace/CodePreview.tsx src/renderer/src/components/workspace/OfficePreview.tsx src/renderer/src/stores/workspace-store.ts src/renderer/src/components/MainLayout.tsx src/renderer/src/App.tsx
git commit -m "feat: add file preview panel with split-panel layout"
```

---

## Task 9: New Chat Flow

**Files:**

- Modify: `src/renderer/src/components/Sidebar.tsx`
- Modify: `src/renderer/src/stores/chat-store.ts`

### Step 1: Update `chat-store.ts` - change `createSession` to auto-name

Replace `createSession` (lines 83-98) with:

```typescript
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
```

Also add a `renameSession` action to the interface (after `deleteSession`):

```typescript
renameSession: (sessionId: string, name: string) => Promise<void>;
```

And implement it (after `deleteSession` implementation):

```typescript
  // Rename session
  renameSession: async (sessionId: string, name: string) => {
    if (!name.trim()) return
    const response = await window.api.sessions.update(sessionId, { name: name.trim() })
    if (response.success) {
      set((state) => ({
        sessions: state.sessions.map((s) =>
          s.id === sessionId ? { ...s, name: name.trim() } : s
        )
      }))
    }
  },
```

Also update the interface definition for `createSession`:

```typescript
createSession: (name?: string) => Promise<string>;
```

### Step 2: Rewrite `Sidebar.tsx` - remove dialog, add inline rename

Replace the entire `Sidebar.tsx` content:

```typescript
/**
 * Sidebar Component - Navigation sidebar with sessions and workspace
 */

import { useState, useRef, useEffect } from 'react'
import { useChatStore } from '../stores/chat-store'
import { useWorkspaceStore } from '../stores/workspace-store'
import { Button, Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui'
import {
  Plus,
  Folder,
  MessageSquare,
  ExternalLink,
  Settings,
  ChevronDown,
  ChevronRight,
  Trash2
} from 'lucide-react'
import { SettingsDialog } from './settings/SettingsDialog'
import { FileTree } from './workspace/FileTree'

export function Sidebar() {
  const { sessions, currentSessionId, selectSession, createSession, deleteSession, renameSession } =
    useChatStore()
  const { currentWorkspace, openWorkspaceInExplorer } = useWorkspaceStore()
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [isFileTreeExpanded, setIsFileTreeExpanded] = useState(true)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [sessionToDelete, setSessionToDelete] = useState<string | null>(null)
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const renameInputRef = useRef<HTMLInputElement>(null)

  // Focus rename input when editing starts
  useEffect(() => {
    if (editingSessionId && renameInputRef.current) {
      renameInputRef.current.focus()
      renameInputRef.current.select()
    }
  }, [editingSessionId])

  const handleNewSession = async () => {
    try {
      await createSession()
    } catch (error) {
      console.error('Failed to create session:', error)
    }
  }

  const handleDeleteSession = (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation()
    setSessionToDelete(sessionId)
    setDeleteConfirmOpen(true)
  }

  const handleConfirmDelete = async () => {
    if (sessionToDelete) {
      try {
        await deleteSession(sessionToDelete)
      } catch (error) {
        console.error('Failed to delete session:', error)
        alert('Failed to delete session')
      } finally {
        setSessionToDelete(null)
        setDeleteConfirmOpen(false)
      }
    }
  }

  const handleCancelDelete = () => {
    setSessionToDelete(null)
    setDeleteConfirmOpen(false)
  }

  const handleDoubleClick = (sessionId: string, currentName: string) => {
    setEditingSessionId(sessionId)
    setEditingName(currentName)
  }

  const handleRenameSubmit = async () => {
    if (editingSessionId && editingName.trim()) {
      await renameSession(editingSessionId, editingName.trim())
    }
    setEditingSessionId(null)
    setEditingName('')
  }

  const handleRenameCancel = () => {
    setEditingSessionId(null)
    setEditingName('')
  }

  const handleOpenWorkspace = async () => {
    try {
      await openWorkspaceInExplorer()
    } catch (error) {
      console.error('Failed to open workspace:', error)
    }
  }

  return (
    <>
      <div className="flex flex-col h-full bg-bg-secondary border-r border-border-subtle">
        {/* Header / Brand */}
        <div className="shrink-0 p-4 flex items-center gap-2">
          <div className="h-6 w-6 rounded bg-accent flex items-center justify-center text-white font-serif font-bold text-xs">
            C
          </div>
          <div className="font-semibold text-text-primary">CCDisk</div>
        </div>

        {/* Main content: Workspace (50%) + Recents (50%) */}
        <div className="flex-1 flex flex-col min-h-0">
          {/* Workspace section */}
          <div className="px-4 py-2 h-[50%] flex flex-col min-h-0">
            <div className="mb-2 flex items-center justify-between shrink-0">
              <div className="text-xs font-medium uppercase tracking-wider text-text-tertiary">
                Workspace
              </div>
              <button
                onClick={() => setIsFileTreeExpanded(!isFileTreeExpanded)}
                className="p-1 rounded hover:bg-bg-accent transition-colors"
                title={isFileTreeExpanded ? 'Hide Files' : 'Show Files'}
              >
                {isFileTreeExpanded ? (
                  <ChevronDown className="h-4 w-4 text-text-tertiary" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-text-tertiary" />
                )}
              </button>
            </div>
            <button
              onClick={handleOpenWorkspace}
              className="flex items-center gap-2 rounded-md bg-white px-3 py-2 text-sm shadow-sm border border-border-subtle text-text-secondary hover:bg-bg-accent transition-colors w-full mb-2 shrink-0"
              title={currentWorkspace || '~/.ccdisk'}
            >
              <Folder className="h-4 w-4 text-text-tertiary" />
              <div className="truncate font-medium flex-1 text-left">
                {currentWorkspace ? currentWorkspace.split('/').pop() : '.ccdisk'}
              </div>
              <ExternalLink className="h-3 w-3 text-text-tertiary" />
            </button>

            {/* File Tree */}
            {isFileTreeExpanded && (
              <div className="bg-white rounded-md border border-border-subtle overflow-hidden flex-1 min-h-0">
                <FileTree />
              </div>
            )}
          </div>

          {/* Sessions section */}
          <div className="flex-1 overflow-y-auto px-2 py-4 min-h-0">
            <div className="mb-2 px-2 flex items-center justify-between group">
              <div className="text-xs font-medium uppercase tracking-wider text-text-tertiary">
                Recents
              </div>
              <button
                onClick={handleNewSession}
                className="flex items-center gap-1 rounded px-2 py-1 text-text-tertiary hover:bg-bg-accent hover:text-text-primary transition-colors text-xs"
                title="New Chat"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>New Chat</span>
              </button>
            </div>

            <div className="space-y-0.5">
              {sessions.map((session) => (
                <div
                  key={session.id}
                  onClick={() => selectSession(session.id)}
                  onDoubleClick={() => handleDoubleClick(session.id, session.name)}
                  className={`group flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-all cursor-pointer ${
                    currentSessionId === session.id
                      ? 'bg-bg-accent text-text-primary font-medium shadow-sm'
                      : 'text-text-secondary hover:bg-bg-accent hover:text-text-primary'
                  }`}
                >
                  <MessageSquare
                    className={`h-4 w-4 shrink-0 ${currentSessionId === session.id ? 'text-accent' : 'text-text-tertiary group-hover:text-text-secondary'}`}
                  />
                  {editingSessionId === session.id ? (
                    <input
                      ref={renameInputRef}
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleRenameSubmit()
                        if (e.key === 'Escape') handleRenameCancel()
                      }}
                      onBlur={handleRenameSubmit}
                      onClick={(e) => e.stopPropagation()}
                      className="flex-1 bg-white border border-accent rounded px-1 py-0 text-sm outline-none"
                    />
                  ) : (
                    <div className="truncate flex-1">{session.name}</div>
                  )}
                  {editingSessionId !== session.id && (
                    <button
                      onClick={(e) => handleDeleteSession(e, session.id)}
                      className="shrink-0 opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-50 hover:text-red-500 transition-all"
                      title="Delete session"
                    >
                      <Trash2 className="h-3 w-3 text-text-tertiary" />
                    </button>
                  )}
                </div>
              ))}

              {sessions.length === 0 && (
                <div className="px-4 py-8 text-center text-sm text-text-tertiary italic">
                  No active sessions
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer profile/settings area */}
        <div className="p-4 border-t border-border-subtle">
          <button
            onClick={() => setIsSettingsOpen(true)}
            className="flex items-center gap-3 w-full px-3 py-2 rounded-lg hover:bg-bg-accent transition-colors"
          >
            <Settings className="h-5 w-5 text-text-tertiary" />
            <div className="text-sm font-medium text-text-secondary">Settings</div>
          </button>
        </div>
      </div>

      {/* Settings Dialog */}
      <SettingsDialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen} />

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent className="bg-white">
          <DialogHeader>
            <DialogTitle className="font-serif text-xl">Delete Session</DialogTitle>
          </DialogHeader>
          <div className="py-4 text-sm text-text-secondary">
            Are you sure you want to delete this session? This action cannot be undone.
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={handleCancelDelete}>
              Cancel
            </Button>
            <Button
              className="bg-red-500 text-white hover:bg-red-600"
              onClick={handleConfirmDelete}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
```

Key changes:

- Removed the `isDialogOpen`/`sessionName`/`handleCreateSession` state and dialog
- `handleNewSession` directly calls `createSession()` (no args = auto-name)
- New Chat button shows `+ New Chat` text
- Double-click on session name enters inline rename mode
- Enter saves, Escape cancels rename
- `onBlur` also saves (handles clicking away)

### Step 3: Commit

```bash
git add src/renderer/src/stores/chat-store.ts src/renderer/src/components/Sidebar.tsx
git commit -m "feat: new chat flow with auto-naming and inline rename"
```

---

## Task 10: Claude Configuration Editor (Replace Providers)

**Files:**

- Create: `src/renderer/src/components/settings/ClaudeConfigEditor.tsx`
- Modify: `src/renderer/src/components/settings/SettingsDialog.tsx`
- Modify: `src/renderer/src/stores/settings-store.ts`

### Step 1: Create `ClaudeConfigEditor.tsx`

Create `src/renderer/src/components/settings/ClaudeConfigEditor.tsx`:

```typescript
/**
 * ClaudeConfigEditor - Direct editor for ~/.claude/settings.json env variables
 */

import { useEffect, useState } from 'react'
import { Button, Input } from '../ui'
import { Save, Eye, EyeOff, RefreshCw } from 'lucide-react'

interface EnvField {
  key: string
  label: string
  placeholder: string
  isSecret: boolean
}

const ENV_FIELDS: EnvField[] = [
  {
    key: 'ANTHROPIC_AUTH_TOKEN',
    label: 'Auth Token',
    placeholder: 'sk-ant-...',
    isSecret: true
  },
  {
    key: 'ANTHROPIC_BASE_URL',
    label: 'Base URL',
    placeholder: 'https://api.anthropic.com (leave empty for default)',
    isSecret: false
  },
  {
    key: 'ANTHROPIC_MODEL',
    label: 'Model',
    placeholder: 'claude-sonnet-4-20250514',
    isSecret: false
  },
  {
    key: 'ANTHROPIC_DEFAULT_SONNET_MODEL',
    label: 'Default Sonnet Model',
    placeholder: 'claude-sonnet-4-20250514',
    isSecret: false
  },
  {
    key: 'ANTHROPIC_DEFAULT_OPUS_MODEL',
    label: 'Default Opus Model',
    placeholder: 'claude-opus-4-20250514',
    isSecret: false
  },
  {
    key: 'ANTHROPIC_DEFAULT_HAIKU_MODEL',
    label: 'Default Haiku Model',
    placeholder: 'claude-haiku-3-20250514',
    isSecret: false
  }
]

export function ClaudeConfigEditor() {
  const [values, setValues] = useState<Record<string, string>>({})
  const [showSecrets, setShowSecrets] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)

  // Load env on mount
  useEffect(() => {
    loadEnv()
  }, [])

  const loadEnv = async () => {
    setIsLoading(true)
    try {
      const response = await window.api.settings.getClaudeEnv()
      if (response.success && response.data) {
        setValues(response.data)
      }
    } catch (error) {
      console.error('Failed to load Claude env:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleSave = async () => {
    setIsSaving(true)
    setSaveMessage(null)
    try {
      const response = await window.api.settings.updateClaudeEnv(values)
      if (response.success) {
        setSaveMessage('Settings saved successfully')
        setTimeout(() => setSaveMessage(null), 3000)
      } else {
        setSaveMessage(`Error: ${response.error}`)
      }
    } catch (error) {
      console.error('Failed to save Claude env:', error)
      setSaveMessage(`Error: ${(error as Error).message}`)
    } finally {
      setIsSaving(false)
    }
  }

  const handleChange = (key: string, value: string) => {
    setValues((prev) => ({ ...prev, [key]: value }))
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-text-tertiary">
        <div className="animate-spin h-5 w-5 border-2 border-current border-t-transparent rounded-full" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm text-text-secondary">
            Configure Claude API settings. These are stored in{' '}
            <code className="text-xs bg-gray-100 px-1 py-0.5 rounded">~/.claude/settings.json</code>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setShowSecrets(!showSecrets)}
            className="text-text-tertiary"
          >
            {showSecrets ? <EyeOff className="h-4 w-4 mr-1" /> : <Eye className="h-4 w-4 mr-1" />}
            {showSecrets ? 'Hide' : 'Show'}
          </Button>
          <Button size="sm" variant="ghost" onClick={loadEnv} className="text-text-tertiary">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="space-y-4">
        {ENV_FIELDS.map((field) => (
          <div key={field.key}>
            <label className="block text-sm font-medium text-text-primary mb-1">
              {field.label}
            </label>
            <div className="text-xs text-text-tertiary mb-1 font-mono">{field.key}</div>
            <Input
              type={field.isSecret && !showSecrets ? 'password' : 'text'}
              placeholder={field.placeholder}
              value={values[field.key] || ''}
              onChange={(e) => handleChange(field.key, e.target.value)}
            />
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between pt-4 border-t border-border-subtle">
        {saveMessage && (
          <div
            className={`text-sm ${saveMessage.startsWith('Error') ? 'text-red-500' : 'text-green-600'}`}
          >
            {saveMessage}
          </div>
        )}
        <div className="flex-1" />
        <Button
          onClick={handleSave}
          disabled={isSaving}
          className="bg-accent text-white hover:bg-accent-hover"
        >
          <Save className="h-4 w-4 mr-1" />
          {isSaving ? 'Saving...' : 'Save Settings'}
        </Button>
      </div>
    </div>
  )
}
```

### Step 2: Update `SettingsDialog.tsx` - replace Providers tab, merge Skills+Commands

Replace the entire `SettingsDialog.tsx`:

```typescript
/**
 * SettingsDialog Component - Tabbed dialog for app settings
 */

import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/Tabs'
import { ClaudeConfigEditor } from './ClaudeConfigEditor'
import { MCPManager } from '../extensions/MCPManager'
import { SkillsCommandsManager } from './SkillsCommandsManager'

interface SettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const [activeTab, setActiveTab] = useState('claude-config')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-white max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="font-serif text-2xl">Settings</DialogTitle>
        </DialogHeader>

        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className="flex-1 flex flex-col overflow-hidden"
        >
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="claude-config">Claude Configuration</TabsTrigger>
            <TabsTrigger value="mcp">MCP Servers</TabsTrigger>
            <TabsTrigger value="skills-commands">Skills & Commands</TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-y-auto mt-4">
            <TabsContent value="claude-config" className="mt-0">
              <ClaudeConfigEditor />
            </TabsContent>

            <TabsContent value="mcp" className="mt-0">
              <MCPManager />
            </TabsContent>

            <TabsContent value="skills-commands" className="mt-0">
              <SkillsCommandsManager />
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
```

### Step 3: Update `settings-store.ts` - add Claude env methods

Add to the interface (after `activateProvider`):

```typescript
// Actions - Claude Env Config
loadClaudeEnv: () => Promise<Record<string, string>>;
updateClaudeEnv: (envUpdates: Record<string, string>) => Promise<void>;
```

Add state:

```typescript
claudeEnv: Record<string, string>;
```

Add initial state:

```typescript
  claudeEnv: {},
```

Add implementations:

```typescript
  loadClaudeEnv: async () => {
    try {
      const response = await window.api.settings.getClaudeEnv()
      if (response.success && response.data) {
        set({ claudeEnv: response.data })
        return response.data
      }
      return {}
    } catch (error) {
      console.error('Failed to load Claude env:', error)
      return {}
    }
  },

  updateClaudeEnv: async (envUpdates) => {
    try {
      const response = await window.api.settings.updateClaudeEnv(envUpdates)
      if (response.success) {
        set((state) => ({ claudeEnv: { ...state.claudeEnv, ...envUpdates } }))
      }
    } catch (error) {
      console.error('Failed to update Claude env:', error)
      throw error
    }
  },
```

### Step 4: Commit

```bash
git add src/renderer/src/components/settings/ClaudeConfigEditor.tsx src/renderer/src/components/settings/SettingsDialog.tsx src/renderer/src/stores/settings-store.ts
git commit -m "feat: replace providers with direct Claude configuration editor"
```

---

## Task 11: MCP Live Status

**Files:**

- Modify: `src/renderer/src/components/extensions/MCPManager.tsx`
- Modify: `src/renderer/src/stores/mcp-store.ts`

### Step 1: Add live status state to MCP store

Add to the `MCPStore` interface:

```typescript
  // Live status (from active SDK session)
  liveStatuses: MCPServerStatus[]
  isStatusLoading: boolean

  // Actions - Live status
  loadLiveStatus: (sessionId: string) => Promise<void>
  reconnectServer: (sessionId: string, serverName: string) => Promise<void>
  toggleServer: (sessionId: string, serverName: string, enabled: boolean) => Promise<void>
```

Add import:

```typescript
import type { MCPConfig, MCPServerConfig, MCPServerStatus } from '../../../shared/types';
```

Add initial state:

```typescript
  liveStatuses: [],
  isStatusLoading: false,
```

Add implementations:

```typescript
  loadLiveStatus: async (sessionId: string) => {
    set({ isStatusLoading: true })
    try {
      const response = await window.api.sdk.getMcpStatus(sessionId)
      if (response.success && response.data) {
        set({ liveStatuses: response.data as MCPServerStatus[], isStatusLoading: false })
      } else {
        set({ liveStatuses: [], isStatusLoading: false })
      }
    } catch (error) {
      console.error('Failed to load MCP live status:', error)
      set({ liveStatuses: [], isStatusLoading: false })
    }
  },

  reconnectServer: async (sessionId: string, serverName: string) => {
    try {
      await window.api.sdk.reconnectMcpServer(sessionId, serverName)
      // Refresh status after reconnect
      await get().loadLiveStatus(sessionId)
    } catch (error) {
      console.error('Failed to reconnect server:', error)
    }
  },

  toggleServer: async (sessionId: string, serverName: string, enabled: boolean) => {
    try {
      await window.api.sdk.toggleMcpServer(sessionId, serverName, enabled)
      // Refresh status after toggle
      await get().loadLiveStatus(sessionId)
    } catch (error) {
      console.error('Failed to toggle server:', error)
    }
  },
```

### Step 2: Add live status section to `MCPManager.tsx`

Add import of `useChatStore`:

```typescript
import { useChatStore } from '../../stores/chat-store';
```

At the top of the `MCPManager` component, add:

```typescript
const currentSessionId = useChatStore((s) => s.currentSessionId);
const { liveStatuses, isStatusLoading, loadLiveStatus, reconnectServer, toggleServer } = useMCPStore();

// Load live status when session is active
useEffect(() => {
  if (currentSessionId) {
    loadLiveStatus(currentSessionId);
  }
}, [currentSessionId, loadLiveStatus]);
```

After the existing `{/* Content */}` section (before the closing `</div>` of the main container), add a live status section:

```typescript
      {/* Live Status Section */}
      {currentSessionId && (
        <div className="border-t border-gray-200 dark:border-gray-700">
          <div className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                Live Status
              </h3>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => loadLiveStatus(currentSessionId)}
                disabled={isStatusLoading}
              >
                <RefreshCw className={`h-3 w-3 ${isStatusLoading ? 'animate-spin' : ''}`} />
              </Button>
            </div>

            {liveStatuses.length === 0 ? (
              <div className="text-sm text-gray-500">No MCP servers connected to current session</div>
            ) : (
              <div className="space-y-2">
                {liveStatuses.map((status) => (
                  <div
                    key={status.name}
                    className="flex items-center justify-between p-2 rounded-md border border-gray-200 bg-gray-50"
                  >
                    <div className="flex items-center gap-2">
                      <div
                        className={`h-2 w-2 rounded-full ${
                          status.status === 'connected'
                            ? 'bg-green-500'
                            : status.status === 'failed'
                              ? 'bg-red-500'
                              : status.status === 'disabled'
                                ? 'bg-gray-400'
                                : 'bg-yellow-500'
                        }`}
                      />
                      <span className="text-sm font-medium">{status.name}</span>
                      <span className="text-xs text-gray-500">
                        {status.tools.length} tools
                      </span>
                    </div>
                    <div className="flex gap-1">
                      {status.status === 'failed' && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-xs h-6"
                          onClick={() => reconnectServer(currentSessionId, status.name)}
                        >
                          Reconnect
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-xs h-6"
                        onClick={() =>
                          toggleServer(
                            currentSessionId,
                            status.name,
                            status.status === 'disabled'
                          )
                        }
                      >
                        {status.status === 'disabled' ? 'Enable' : 'Disable'}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
```

Also add `RefreshCw` to the lucide-react import in MCPManager.tsx.

### Step 3: Commit

```bash
git add src/renderer/src/stores/mcp-store.ts src/renderer/src/components/extensions/MCPManager.tsx
git commit -m "feat: add MCP live status with reconnect and toggle controls"
```

---

## Task 12: Merged Skills & Commands Tab

**Files:**

- Create: `src/renderer/src/components/settings/SkillsCommandsManager.tsx`

### Step 1: Create `SkillsCommandsManager.tsx`

This component merges `SkillsManager` and `CommandsManager` into a single view with sections. Create `src/renderer/src/components/settings/SkillsCommandsManager.tsx`:

```typescript
/**
 * SkillsCommandsManager - Unified manager for Skills and Commands
 * Merges the separate Skills and Commands tabs into one view.
 * - Filesystem skills (~/.claude/skills/*.md) - editable
 * - Filesystem commands (~/.claude/commands/*) - editable
 * - SDK commands (query.supportedCommands()) - read-only when session active
 */

import { useEffect, useState } from 'react'
import { useSkillsStore } from '../../stores/skills-store'
import { useCommandsStore } from '../../stores/commands-store'
import { useChatStore } from '../../stores/chat-store'
import type { Skill, Command, SlashCommand } from '../../../../shared/types'
import { Button } from '../ui/Button'
import { Tabs, TabsList, TabsTrigger } from '../ui/Tabs'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription
} from '../ui/Dialog'
import { cn } from '../../lib/utils'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { FileCode, BookOpen, Terminal, Plus } from 'lucide-react'

type ItemType = 'skill' | 'command' | 'sdk-command'
type SelectedItem =
  | { type: 'skill'; item: Skill }
  | { type: 'command'; item: Command }
  | { type: 'sdk-command'; item: SlashCommand }

export function SkillsCommandsManager() {
  const currentSessionId = useChatStore((s) => s.currentSessionId)

  // Skills store
  const {
    skills,
    currentScope: skillsScope,
    isLoading: skillsLoading,
    setScope: setSkillsScope,
    loadSkills,
    createSkill,
    updateSkill,
    deleteSkill,
    setupSkillsWatcher
  } = useSkillsStore()

  // Commands store
  const {
    commands,
    currentScope: commandsScope,
    commandContent,
    isLoading: commandsLoading,
    loadCommands,
    selectCommand: loadCommandContent,
    createCommand,
    deleteCommand,
    setupCommandsWatcher
  } = useCommandsStore()

  const [scope, setScope] = useState<'global' | 'workspace'>('global')
  const [selected, setSelected] = useState<SelectedItem | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [editContent, setEditContent] = useState('')
  const [showPreview, setShowPreview] = useState(false)
  const [sdkCommands, setSdkCommands] = useState<SlashCommand[]>([])
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [createType, setCreateType] = useState<'skill' | 'command'>('skill')
  const [newName, setNewName] = useState('')
  const [newCommandExt, setNewCommandExt] = useState('.sh')

  // Load data on mount
  useEffect(() => {
    loadSkills()
    loadCommands()
    const cleanupSkills = setupSkillsWatcher()
    const cleanupCommands = setupCommandsWatcher()
    return () => {
      cleanupSkills()
      cleanupCommands()
    }
  }, [loadSkills, loadCommands, setupSkillsWatcher, setupCommandsWatcher])

  // Load SDK commands when session is active
  useEffect(() => {
    if (currentSessionId) {
      window.api.sdk.getCommands(currentSessionId).then((response) => {
        if (response.success && response.data) {
          setSdkCommands(response.data as SlashCommand[])
        }
      })
    } else {
      setSdkCommands([])
    }
  }, [currentSessionId])

  // Sync scope across stores
  useEffect(() => {
    setSkillsScope(scope)
  }, [scope, setSkillsScope])

  // Filter by scope
  const scopedSkills = skills.filter((s) => s.scope === scope)
  const scopedCommands = commands.filter((c) => c.scope === scope)

  const handleSelectSkill = (skill: Skill) => {
    setSelected({ type: 'skill', item: skill })
    setEditContent(skill.content)
    setIsEditing(false)
  }

  const handleSelectCommand = async (command: Command) => {
    setSelected({ type: 'command', item: command })
    setIsEditing(false)
    await loadCommandContent(command)
  }

  const handleSelectSdkCommand = (cmd: SlashCommand) => {
    setSelected({ type: 'sdk-command', item: cmd })
    setIsEditing(false)
  }

  const handleSave = async () => {
    if (!selected) return
    if (selected.type === 'skill') {
      await updateSkill(selected.item.name, editContent)
      setIsEditing(false)
    }
    // Commands don't have update in the current store - would need to re-create
  }

  const handleDelete = async () => {
    if (!selected) return
    if (selected.type === 'skill') {
      if (confirm(`Delete skill "${selected.item.name}"?`)) {
        await deleteSkill(selected.item.name, selected.item.scope)
        setSelected(null)
      }
    } else if (selected.type === 'command') {
      if (confirm(`Delete command "${selected.item.name}"?`)) {
        await deleteCommand(selected.item.name, selected.item.scope)
        setSelected(null)
      }
    }
  }

  const handleCreate = async () => {
    if (!newName.trim()) return
    if (createType === 'skill') {
      await createSkill(newName.trim(), '# New Skill\n\nAdd your skill content here...')
    } else {
      const fullName = newName.trim() + newCommandExt
      const shebangs: Record<string, string> = {
        '.sh': '#!/bin/bash\n\n',
        '.js': '#!/usr/bin/env node\n\n',
        '.py': '#!/usr/bin/env python3\n\n'
      }
      await createCommand(fullName, shebangs[newCommandExt] || '')
    }
    setIsCreateOpen(false)
    setNewName('')
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-200 p-4">
        <Tabs value={scope} onValueChange={(v) => setScope(v as 'global' | 'workspace')}>
          <TabsList>
            <TabsTrigger value="global">Global</TabsTrigger>
            <TabsTrigger value="workspace">Workspace</TabsTrigger>
          </TabsList>
        </Tabs>
        <Button
          variant="primary"
          size="sm"
          onClick={() => setIsCreateOpen(true)}
        >
          <Plus className="w-4 h-4 mr-1" />
          New
        </Button>
      </div>

      {/* Content - Split view */}
      <div className="flex flex-1 overflow-hidden">
        {/* List sidebar */}
        <div className="w-72 border-r border-gray-200 overflow-y-auto">
          {/* Skills section */}
          <div className="p-3">
            <div className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2 flex items-center gap-1">
              <BookOpen className="h-3 w-3" /> Skills
            </div>
            {scopedSkills.length === 0 ? (
              <div className="text-xs text-gray-400 px-2 py-1">No skills</div>
            ) : (
              scopedSkills.map((skill) => (
                <div
                  key={`skill-${skill.name}`}
                  onClick={() => handleSelectSkill(skill)}
                  className={cn(
                    'px-3 py-2 rounded-md text-sm cursor-pointer transition-colors',
                    selected?.type === 'skill' && (selected.item as Skill).name === skill.name
                      ? 'bg-blue-50 text-blue-900'
                      : 'hover:bg-gray-100 text-gray-700'
                  )}
                >
                  <span className="font-medium">{skill.name}</span>
                </div>
              ))
            )}
          </div>

          {/* Commands section */}
          <div className="p-3 border-t border-gray-100">
            <div className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2 flex items-center gap-1">
              <FileCode className="h-3 w-3" /> Commands
            </div>
            {scopedCommands.length === 0 ? (
              <div className="text-xs text-gray-400 px-2 py-1">No commands</div>
            ) : (
              scopedCommands.map((command) => (
                <div
                  key={`cmd-${command.name}`}
                  onClick={() => handleSelectCommand(command)}
                  className={cn(
                    'px-3 py-2 rounded-md text-sm cursor-pointer transition-colors',
                    selected?.type === 'command' &&
                      (selected.item as Command).name === command.name
                      ? 'bg-blue-50 text-blue-900'
                      : 'hover:bg-gray-100 text-gray-700'
                  )}
                >
                  <span className="font-medium font-mono text-xs">{command.name}</span>
                </div>
              ))
            )}
          </div>

        </div>

        {/* Detail / Editor */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {selected ? (
            <>
              {/* Toolbar */}
              <div className="flex items-center justify-between border-b border-gray-200 p-3">
                <div>
                  <h3 className="font-semibold text-lg">
                    {selected.type === 'sdk-command'
                      ? `/${(selected.item as SlashCommand).name}`
                      : selected.item.name}
                  </h3>
                  <p className="text-xs text-gray-500">
                    {selected.type === 'skill'
                      ? 'Skill (Markdown)'
                      : selected.type === 'command'
                        ? 'Command (Script)'
                        : 'SDK Built-in Command'}
                  </p>
                </div>
                <div className="flex gap-2">
                  {selected.type !== 'sdk-command' && (
                    <>
                      {isEditing ? (
                        <>
                          {selected.type === 'skill' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setShowPreview(!showPreview)}
                            >
                              {showPreview ? 'Edit' : 'Preview'}
                            </Button>
                          )}
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => setIsEditing(false)}
                          >
                            Cancel
                          </Button>
                          <Button variant="primary" size="sm" onClick={handleSave}>
                            Save
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button
                            variant="primary"
                            size="sm"
                            onClick={() => {
                              setIsEditing(true)
                              if (selected.type === 'skill') {
                                setEditContent((selected.item as Skill).content)
                              }
                            }}
                          >
                            Edit
                          </Button>
                          <Button variant="danger" size="sm" onClick={handleDelete}>
                            Delete
                          </Button>
                        </>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto p-4">
                {selected.type === 'sdk-command' ? (
                  <div className="space-y-2">
                    <div className="text-sm text-gray-600">
                      {(selected.item as SlashCommand).description}
                    </div>
                    {(selected.item as SlashCommand).argumentHint && (
                      <div className="text-xs text-gray-400 font-mono">
                        Usage: /{(selected.item as SlashCommand).name}{' '}
                        {(selected.item as SlashCommand).argumentHint}
                      </div>
                    )}
                  </div>
                ) : selected.type === 'skill' ? (
                  isEditing && !showPreview ? (
                    <textarea
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      className="w-full h-full min-h-[400px] rounded-md border border-gray-300 p-4 font-mono text-sm resize-none focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  ) : (
                    <div className="prose prose-sm max-w-none">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {isEditing ? editContent : (selected.item as Skill).content}
                      </ReactMarkdown>
                    </div>
                  )
                ) : (
                  <pre className="p-4 bg-gray-50 rounded-md text-sm font-mono overflow-auto">
                    {commandContent || 'Loading...'}
                  </pre>
                )}
              </div>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center text-gray-500">
              <div className="text-center">
                <p className="text-lg font-medium">No item selected</p>
                <p className="text-sm">Select a skill or command from the list</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Create Dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New</DialogTitle>
            <DialogDescription>Create in {scope} scope</DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="flex gap-2">
              <Button
                variant={createType === 'skill' ? 'primary' : 'ghost'}
                size="sm"
                onClick={() => setCreateType('skill')}
              >
                Skill
              </Button>
              <Button
                variant={createType === 'command' ? 'primary' : 'ghost'}
                size="sm"
                onClick={() => setCreateType('command')}
              >
                Command
              </Button>
            </div>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={createType === 'skill' ? 'my-skill' : 'my-command'}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreate()
              }}
            />
            {createType === 'command' && (
              <select
                value={newCommandExt}
                onChange={(e) => setNewCommandExt(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              >
                <option value=".sh">Shell (.sh)</option>
                <option value=".js">JavaScript (.js)</option>
                <option value=".py">Python (.py)</option>
                <option value=".rb">Ruby (.rb)</option>
              </select>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsCreateOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleCreate}>
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
```

### Step 2: Commit

```bash
git add src/renderer/src/components/settings/SkillsCommandsManager.tsx
git commit -m "feat: create merged Skills & Commands manager component"
```

---

## Task 13: Final Wiring & Type Checking

**Files:**

- Modify: `src/renderer/src/App.tsx` (already done in Task 8)
- Various type fixes

### Step 1: Run type check

```bash
pnpm typecheck
```

### Step 2: Fix any type errors

Address each error based on the output. Common issues will be:

- Missing imports for new types
- Type mismatches in preload bridge (IPC response types)
- Missing method declarations in `db-service.ts`

### Step 3: Run lint

```bash
pnpm lint
```

### Step 4: Format

```bash
pnpm format
```

### Step 5: Commit

```bash
git add -A
git commit -m "fix: resolve type errors and formatting issues"
```

---

## Task 14: Build Verification

### Step 1: Build the project

```bash
pnpm build:unpack
```

### Step 2: Fix any build errors

Address each error until the build succeeds.

### Step 3: Commit any fixes

```bash
git add -A
git commit -m "fix: resolve build issues"
```

---

## Execution Dependency Graph

```
Task 1 (Types/Channels) ──┬── Task 2 (ConfigService)
                           ├── Task 3 (ClaudeService)
                           ├── Task 5 (DatabaseService)
                           └── Task 6 (Preload)
                                    │
Task 2 ─── Task 4a (settings-handler)
Task 3 ─── Task 4b (sdk-handler)
Task 5 ─── Task 4c (sessions-handler)
           Task 4d (workspace-handler)
                    │
Task 6 + Task 4 ───┬── Task 7 (File Icons)
                    ├── Task 8 (File Preview)
                    ├── Task 9 (New Chat Flow)
                    ├── Task 10 (Claude Config)
                    ├── Task 11 (MCP Live Status)
                    └── Task 12 (Skills & Commands)
                             │
                    Task 13 (Type Check)
                    Task 14 (Build)
```

Tasks 7-12 are independent of each other and can be done in parallel after Tasks 1-6 are complete.

---

## Notes for Implementation

1. **`file-icons-js` may need configuration** - If CSS import fails in electron-vite, either:
   - Copy the CSS file to `src/renderer/src/assets/` and import from there
   - Or fall back to the Lucide icon mapping approach (see Task 7 fallback)

2. **`react-pdf` needs PDF.js worker** - You may need to configure the worker URL:

   ```typescript
   import { pdfjs } from 'react-pdf';
   pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;
   ```

   For offline/Electron, copy the worker file to `public/` or use a bundled version.

3. **PDF preview uses iframe as simpler alternative** - The plan uses `<iframe>` with data URL for PDF, which is simpler than react-pdf pagination. Switch to react-pdf if you need page-by-page navigation.

4. **`dbService.updateSession` might not exist** - Check `src/main/services/db-service.ts` first. If it doesn't have this method, implement it using the same Drizzle pattern as other CRUD methods.

5. **Old provider-related code can be removed later** - The plan keeps backward compatibility. Once the Claude Config Editor is working, you can safely remove:
   - Provider CRUD from `settings-handler.ts`
   - Provider methods from `settings-store.ts`
   - `ProvidersManager.tsx` component
   - Provider-related IPC channels

6. **The `Query` type methods (`mcpServerStatus`, `supportedCommands`, etc.)** - These are from the Claude Agent SDK. Verify the exact method signatures match your installed SDK version (`@anthropic-ai/claude-agent-sdk`). The SDK types may differ slightly.
