# AGENTS.md - Developer Guide for AI Coding Agents

This document provides essential guidelines for working with the **ccdisk** Electron application codebase.

---

## Project Overview

Electron desktop application built with:

- **Frontend**: React 19 + TypeScript + Tailwind CSS
- **Backend**: Electron main process + better-sqlite3 + Drizzle ORM
- **Build System**: electron-vite + Vite
- **State Management**: Zustand
- **Package Manager**: pnpm (required)

---

## Build, Lint & Test Commands

### Development

```bash
pnpm dev              # Start development server with hot reload
pnpm start            # Preview build in Electron
```

### Type Checking

```bash
pnpm typecheck        # Check both Node and Web types
pnpm typecheck:node   # Check main/preload process types only
pnpm typecheck:web    # Check renderer process types only
```

### Linting & Formatting

```bash
pnpm lint             # Run ESLint with cache
pnpm format           # Format all files with Prettier
```

### Building

```bash
pnpm build            # Type check + build for all platforms
pnpm build:win        # Build Windows installer
pnpm build:mac        # Build macOS app
pnpm build:linux      # Build Linux package
pnpm build:unpack     # Build without packaging (for testing)
```

### Testing

⚠️ **No test framework currently configured**. If adding tests:

- Create `__tests__/` directories alongside source files
- Use `.test.ts` or `.test.tsx` suffix
- Recommended: Vitest for unit tests, Playwright for E2E

---

## Directory Structure

```
src/
├── main/              # Electron main process (Node.js)
│   ├── services/      # Business logic (DatabaseService, ClaudeService, etc.)
│   ├── ipc/          # IPC handlers (workspace-handler, chat-handler, etc.)
│   ├── db/           # Drizzle schema definitions
│   └── __tests__/    # Tests for main process
├── renderer/
│   └── src/
│       ├── components/  # React components
│       │   ├── ui/      # Reusable UI primitives (Button, Dialog, etc.)
│       │   ├── chat/    # Chat-specific components
│       │   ├── workspace/ # Workspace/file tree components
│       │   └── settings/  # Settings UI
│       ├── stores/      # Zustand stores (*-store.ts)
│       └── lib/         # Utilities and helpers
├── preload/          # Preload scripts (IPC bridge)
└── shared/           # Shared types and constants
```

---

## Code Style Guidelines

### Imports

**Order** (separated by blank lines):

1. External libraries (electron, react, node built-ins)
2. External packages (zustand, lucide-react, etc.)
3. Internal services/utilities
4. IPC handlers (main process)
5. Type imports (using `import type`)

**Patterns**:

- Use `import type` for type-only imports
- Absolute imports for external packages: `import { create } from 'zustand'`
- Relative imports for internal modules: `import { Button } from './ui'`
- Path alias for renderer: `@renderer/*` → `src/renderer/src/*`

```typescript
// Example import order
import { app, BrowserWindow } from 'electron'
import { join } from 'path'
import Database from 'better-sqlite3'

import { DatabaseService } from './services/db-service'
import { registerWorkspaceHandlers } from './ipc/workspace-handler'

import type { Session, StreamEvent } from '../../shared/types'
```

### Formatting (Prettier Config)

```yaml
singleQuote: true # Use 'string' not "string"
semi: false # No semicolons
printWidth: 100 # Max line length
trailingComma: none # No trailing commas
```

### Naming Conventions

**Files**:

- **kebab-case**: `chat-store.ts`, `claude-service.ts`, `workspace-handler.ts`
- **PascalCase** for React components: `ChatInterface.tsx`, `Sidebar.tsx`
- **Test files**: `*.test.ts` or `*.test.tsx`

**Variables & Functions**:

- **camelCase**: `currentSession`, `loadSessions()`, `handleSend()`
- **UPPER_SNAKE_CASE** for constants: `MAX_FILE_SIZE`, `IGNORED_DIRS`, `IPC_CHANNELS`

**Types & Interfaces**:

- **PascalCase**: `interface ChatStore`, `type StreamEvent`
- **Suffixes**:
  - `Insert`/`Select`: Drizzle types (`SessionInsert`, `SessionSelect`)
  - `Config`: Configuration objects (`MCPConfig`)
  - `Data`: Event payloads (`ToolUseData`, `ResultData`)

**Classes**:

- **PascalCase** with descriptive suffixes: `DatabaseService`, `ClaudeService`, `FileWatcherService`

### TypeScript Types

**Always use**:

- Explicit return types for public methods/functions
- `import type` for type-only imports
- Strict null checks: check for `null`/`undefined` before operations

**Patterns**:

```typescript
// Union types for events
type StreamEvent =
  | { type: 'text'; data: string }
  | { type: 'tool_use'; data: ToolUseData }
  | { type: 'error'; data: string }

// Generic response type
interface IPCResponse<T = unknown> {
  success: boolean
  data?: T
  error?: string
}

// Extending base types
export interface ChatMessage extends Message {
  isStreaming?: boolean
  streamingText?: string
}

// Record types for dictionaries
mcpServers: Record<string, MCPServerConfig>
```

### Error Handling

**Standard Pattern** (all IPC handlers and services):

```typescript
try {
  // Validate inputs first
  if (!sessionName.trim()) {
    throw new Error('Session name is required')
  }

  // Perform operation
  const result = await operation()

  return { success: true, data: result }
} catch (error) {
  console.error('Descriptive context:', error)
  return { success: false, error: (error as Error).message }
}
```

**Guidelines**:

- All IPC handlers must return `IPCResponse<T>`
- Always log errors with context: `console.error('CHAT_SEND error:', error)`
- Type assertions: `(error as Error).message` or `error instanceof Error`
- Validate inputs before operations
- Provide graceful fallbacks where appropriate

### Component Patterns

**Functional components** (no class components):

```typescript
/**
 * Component description
 */
export function ComponentName() {
  // 1. Hooks (stores, state, refs)
  const { state, action } = useStore()
  const [localState, setLocalState] = useState()

  // 2. Event handlers
  const handleEvent = async () => {
    // implementation
  }

  // 3. Effects
  useEffect(() => {
    // side effects
  }, [deps])

  // 4. Render
  return <div>...</div>
}
```

**Props pattern**:

```typescript
interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'primary'
  size?: 'sm' | 'md' | 'lg'
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', ...props }, ref) => {
    return <button ref={ref} {...props} />
  }
)
```

### Service Pattern

**Class-based services**:

```typescript
export class ServiceName {
  private dependency: Type

  constructor(dependency: Type) {
    this.dependency = dependency
  }

  async publicMethod(): Promise<ReturnType> {
    try {
      // implementation
      return result
    } catch (error) {
      console.error('ServiceName.publicMethod error:', error)
      throw error
    }
  }

  private helperMethod(): void {
    // helper logic
  }
}
```

### Store Pattern (Zustand)

```typescript
interface StoreInterface {
  // State
  data: Type[]
  isLoading: boolean

  // Actions
  loadData: () => Promise<void>
  updateItem: (id: string, updates: Partial<Type>) => void
}

export const useStoreName = create<StoreInterface>((set, get) => ({
  data: [],
  isLoading: false,

  loadData: async () => {
    set({ isLoading: true })
    try {
      const result = await window.api.loadData()
      if (result.success) {
        set({ data: result.data })
      }
    } finally {
      set({ isLoading: false })
    }
  },

  updateItem: (id, updates) => {
    set((state) => ({
      data: state.data.map((item) => (item.id === id ? { ...item, ...updates } : item))
    }))
  }
}))
```

---

## Common Pitfalls

1. **Don't import renderer code in main process** (and vice versa)
2. **Always use IPC for main ↔ renderer communication** via `window.api.*`
3. **Run type checking before committing**: `pnpm typecheck`
4. **Use pnpm, not npm/yarn** (project uses pnpm workspaces)
5. **Don't forget semicolons are disabled** - Prettier will remove them
6. **Validate IPC inputs** - never trust data from renderer
7. **Clean up resources** - close file watchers, database connections, etc.

---

## Key Dependencies

- **@anthropic-ai/claude-agent-sdk**: Claude AI integration
- **better-sqlite3**: Local database (synchronous API)
- **drizzle-orm**: Type-safe SQL ORM
- **zustand**: Lightweight state management
- **lexical**: Rich text editor framework
- **radix-ui**: Unstyled accessible UI primitives
- **tailwindcss**: Utility-first CSS framework
- **lucide-react**: Icon library

---

This guide should be sufficient for AI agents to contribute effectively to this codebase. Always run `pnpm typecheck` before finalizing changes.
