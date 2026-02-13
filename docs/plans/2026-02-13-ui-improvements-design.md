# UI Improvements Design

Date: 2026-02-13

## 1. File Icons in Directory Tree

Add VS Code-style file icons to the file tree using an icon library that maps extensions to specific icons.

- Install icon library (e.g. `vscode-icons-js` or `file-icons-js`)
- Custom `Node` renderer in `FileTree.tsx` renders 16x16 colored icons
- Folders: folder/folder-open icons based on expand state
- Files: extension-based icons (`.ts` = TypeScript icon, `.json` = JSON icon, etc.)
- Fallback to generic file icon for unknown extensions

Files: `FileTree.tsx`, `package.json`

## 2. File Preview Panel

Side-by-side preview panel (right of chat, 50/50 split) when clicking a file in the tree.

### Supported formats

| Format             | Library                      | Rendering                            |
| ------------------ | ---------------------------- | ------------------------------------ |
| Markdown           | Existing `MarkdownRenderer`  | Rendered HTML                        |
| Images             | Native `<img>`               | Scaled to fit                        |
| PDF                | `react-pdf` / pdfjs-dist     | Page-by-page viewer                  |
| Word (.docx)       | `mammoth`                    | HTML conversion                      |
| Excel (.xlsx/.csv) | SheetJS `xlsx`               | HTML table with sheet tabs           |
| PPT (.pptx)        | `pptx2json` or basic parsing | Slide text/thumbnails                |
| Code/text          | `highlight.js` or Shiki      | Syntax-highlighted with line numbers |

### Data flow

1. Click file in tree -> `workspace-store.selectFile(path)`
2. Store calls `window.api.workspace.getFileContent(path)` IPC
3. Main process reads file, returns `{ content, size, type, encoding }` (base64 for binary)
4. `FilePreview.tsx` routes to appropriate renderer

### New components

- `FilePreview.tsx` - container with type routing
- `CodePreview.tsx` - syntax-highlighted code
- `OfficePreview.tsx` - Word/Excel/PPT rendering

### IPC changes

- `getFileContent` returns base64 for binary files
- Increase max file size for binary files

## 3. New Chat Flow

Remove manual session name dialog. Simplify to:

- Button shows `+ New Chat` text (not just "+")
- Click creates session named "New Chat" immediately
- Auto-increment: "New Chat", "New Chat (2)", "New Chat (3)"
- Double-click session name in sidebar to rename inline
- Enter to save, Escape to cancel

Files: `Sidebar.tsx`, `chat-store.ts`, `sessions-handler.ts`

## 4. Provider Settings -> Direct settings.json Editor

Replace provider CRUD with direct `~/.claude/settings.json` env editor.

### Fields

- `ANTHROPIC_AUTH_TOKEN` (password field with show/hide)
- `ANTHROPIC_BASE_URL`
- `ANTHROPIC_MODEL`
- `ANTHROPIC_DEFAULT_SONNET_MODEL`
- `ANTHROPIC_DEFAULT_OPUS_MODEL`
- `ANTHROPIC_DEFAULT_HAIKU_MODEL`

### Behavior

- On mount, read env vars from `~/.claude/settings.json`
- On save, merge into settings.json (preserve other keys)
- Empty fields not written
- No "Add Provider" button, no provider list

### New IPC

- `SETTINGS_GET_CLAUDE_ENV` - read env from settings.json
- `SETTINGS_UPDATE_CLAUDE_ENV` - write env to settings.json

Files: `ProvidersManager.tsx` -> rewrite, `settings-handler.ts`, `config-service.ts`

## 5. MCP Servers (Static Config + Live Status)

### Static config (always visible)

- Read/edit `~/.claude/mcp.json` with Global/Workspace scope tabs
- Server list + details/editor panel (existing split view)
- Add/Edit/Delete server configs

### Live status (when session active)

- Status dots: green (connected), red (failed), gray (disabled)
- Available tools list per server
- Reconnect and Disable buttons

### New IPC channels

- `MCP_GET_STATUS` -> `query.mcpServerStatus()`
- `MCP_RECONNECT` -> `query.reconnectMcpServer(name)`
- `MCP_TOGGLE` -> `query.toggleMcpServer(name, enabled)`

### Key change

`ClaudeService` exposes active `Query` instance for MCP operations.

## 6. Skills & Commands (Merged Tab)

Merge separate Skills and Commands tabs into "Skills & Commands".

### Data sources

1. Filesystem skills (`~/.claude/skills/*.md`) - editable
2. Filesystem commands (`~/.claude/commands/*`) - editable
3. SDK commands (`query.supportedCommands()` when session active) - read-only

### UI

- Single sidebar list grouped by section (Skills / Commands)
- Skills: markdown content, editable with preview
- Commands: script content, editable with syntax highlighting
- SDK-registered section at bottom (read-only, plugin/built-in commands)
- Scope tabs (Global/Workspace) filter filesystem items
- Create/Edit/Delete for filesystem items

### Tab changes

Settings dialog goes from 4 tabs to 3:

- Provider (renamed to Claude Configuration)
- MCP Servers
- Skills & Commands
