# CCDisk

English | [简体中文](README_zh-CN.md)

<div align="center">

![CCDisk Demo](demo.png)

**A powerful desktop GUI for Claude AI with advanced workspace management and extensibility**

[![Electron](https://img.shields.io/badge/Electron-39.2.6-47848F?logo=electron)](https://www.electronjs.org/)
[![React](https://img.shields.io/badge/React-19.2.1-61DAFB?logo=react)](https://reactjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9.3-3178C6?logo=typescript)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

</div>

---

## Overview

**CCDisk** is a native desktop application that provides a complete graphical interface for Claude AI. Built with Electron, React, and TypeScript, it offers a polished chat experience with powerful workspace management, real-time streaming responses, and comprehensive extensibility through skills, commands, and MCP servers.

### Key Features

- **🤖 Real-time Claude AI Chat** - Stream responses with syntax highlighting, math rendering, and Mermaid diagrams
- **💿 Disk Management (盘片)** - Switch between curated working environment profiles (Coding, Data, Writing) with different Skills, MCP servers, and system prompts
- **📁 Workspace Management** - File tree browser with real-time watching and syntax-highlighted previews
- **🔐 Permission Control** - Granular control over tool execution with inline approval UI
- **🔌 MCP Server Support** - Extend Claude's capabilities through Model Context Protocol
- **🎯 Skills & Commands** - Create reusable AI behavior patterns and executable scripts
- **💾 Session Persistence** - Resume previous conversations with full context
- **🌍 Multi-Provider Support** - Manage multiple Claude API configurations
- **⚡ Token Tracking** - Real-time visibility into API usage and costs

---

## Quick Start

### Prerequisites

- **Node.js** 18+ and **pnpm** (required)
- **Claude API key** from [Anthropic Console](https://console.anthropic.com/)

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/ccdisk.git
cd ccdisk

# Install dependencies
pnpm install

# Start development server
pnpm dev
```

### First Run

1. Launch the app
2. Select a workspace directory (any folder containing your code/project)
3. Add your Claude API key in **Settings → Providers**
4. Start chatting!

---

## Building

Build platform-specific installers:

```bash
# Build for current platform
pnpm build

# Build for specific platforms
pnpm build:mac     # macOS .dmg
pnpm build:win     # Windows installer
pnpm build:linux   # Linux package

# Build without packaging (for testing)
pnpm build:unpack
```

---

## Architecture

### Tech Stack

**Frontend**

- React 19 with TypeScript
- Zustand for state management
- Lexical rich text editor
- Radix UI components
- Tailwind CSS styling
- Lucide React icons

**Backend (Electron Main Process)**

- Claude Agent SDK for AI interactions
- better-sqlite3 for local database
- Drizzle ORM for type-safe queries
- Chokidar for file watching

**Build Tools**

- electron-vite for bundling
- electron-builder for packaging
- ESLint + Prettier for code quality

### Project Structure

```
src/
├── main/              # Electron main process
│   ├── services/      # Business logic (DatabaseService, ClaudeService, etc.)
│   ├── ipc/          # IPC handlers for renderer communication
│   ├── db/           # Drizzle schema definitions
│   └── index.ts      # Main process entry point
├── renderer/
│   └── src/
│       ├── components/  # React components
│       │   ├── ui/      # Reusable UI primitives
│       │   ├── chat/    # Chat interface components
│       │   ├── workspace/ # File tree and workspace UI
│       │   └── settings/  # Settings and configuration
│       ├── stores/      # Zustand state stores
│       └── lib/         # Utilities and helpers
├── preload/          # Preload scripts (IPC bridge)
└── shared/           # Shared types and constants
```

---

## Features in Detail

### Chat Interface

- **Streaming responses** with real-time text updates
- **Markdown rendering** with:
  - Syntax highlighting (100+ languages via Shiki)
  - Math equations (KaTeX)
  - Mermaid diagrams
  - GitHub Flavored Markdown (tables, task lists, etc.)
- **Message history** persisted in SQLite
- **Session management** - Create, switch, and resume conversations
- **Token usage tracking** - Per-message input/output token counts and cost estimates

### Permission System

Three permission modes for controlling tool execution:

- **Prompt** - Ask for approval on every tool use
- **Accept Edits** - Auto-approve safe tools, prompt for destructive ones (bash, edit, write)
- **Bypass Permissions** - Skip all prompts (use with caution)

Interactive inline permission bubbles appear in the chat flow, allowing you to approve or deny tool requests without disrupting the conversation.

### Disk Management (盘片)

**Disk** is CCDisk's innovative workspace environment system that solves the "context pollution" problem where too many loaded tools overwhelm the AI. A Disk is a self-contained working environment profile that defines the AI assistant's complete capability set for specific scenarios.

#### What is a Disk?

Each Disk bundles:

- **Skills** - Curated markdown-based behavior patterns for the AI
- **MCP Servers** - Model Context Protocol servers to extend Claude's capabilities
- **Commands** - Executable scripts for task automation
- **System Prompt** - Behavioral instructions that define the AI's role, style, and constraints
- **Model Preference** - Preferred Claude model identifier (e.g., `claude-sonnet-4-20250514`)

#### How Disks Work

- **Complete Replacement** - Switching Disks fully replaces the active Skills/MCP/Commands; no layering or merging
- **Global Switch** - Disk selection is a global setting affecting all new sessions
- **Session Tagging** - Sessions are tagged with the Disk they were created under, but all sessions remain visible in the sidebar with labels
- **Pool + Reference Model** - Skills, Commands, and MCP configs live in central pools (`~/.ccdisk/`); Disks only reference them by ID to avoid duplication

#### Built-in Disks

CCDisk comes with four pre-configured Disks:

1. **Default** - General purpose mode using your existing global configuration from `~/.claude/` (zero migration cost)
2. **Coding** - Optimized for software development with frontend-design, React best practices, MCP builder, and Playwright skills
3. **Data** - Focused on data processing and analysis with CSV summarizer, Excel, and PostgreSQL skills
4. **Writing** - Professional document creation with DOCX, PDF, PPTX, and EPUB skills

#### Custom Disks

Create custom Disks tailored to your specific workflows:

- Duplicate existing Disks as starting templates
- Select Skills, Commands, and MCP servers from the central pool
- Define custom system prompts to shape AI behavior
- Choose preferred models for specific tasks
- Manage Disks through the intuitive UI in **Settings → Disk Management**

#### File Structure

```
~/.ccdisk/
├── disks/              # Disk definitions (reference only)
│   ├── default/
│   ├── coding/
│   ├── data/
│   ├── writing/
│   └── my-custom/
├── skills/             # Global skill pool
├── commands/           # Global command pool
└── mcp-servers.json    # Global MCP server pool
```

Disks enable you to instantly switch between different AI "modes" - from a focused coding assistant to a data analyst to a professional writer - with a single click, ensuring Claude always has exactly the right tools for your current task.

### Workspace Management

- **File tree browser** with expand/collapse navigation
- **Real-time file watching** - Auto-refresh when files change
- **Syntax-highlighted preview** for code files
- **Smart ignore patterns** - Excludes `.git/`, `node_modules/`, build artifacts, etc.
- **Workspace-scoped sessions** - Each workspace maintains its own conversation history

### Extensions

#### Skills

Create reusable markdown-based behavior patterns for Claude:

- **Global skills**: `~/.claude/skills/` (available across all workspaces)
- **Workspace skills**: `<workspace>/.claude/skills/` (workspace-specific)
- Auto-reload when skill files change
- Supports frontmatter metadata

#### Commands

Manage executable scripts (shell, Node.js, Python, etc.):

- **Global commands**: `~/.claude/commands/`
- **Workspace commands**: `<workspace>/.claude/commands/`
- Automatic executable permissions
- Real-time validation

#### MCP Servers

Configure Model Context Protocol servers to extend Claude's capabilities:

- **Three server types**: stdio, SSE, HTTP
- **Global config**: `~/.claude/mcp.json`
- **Workspace config**: `<workspace>/.claude/mcp.json`
- Workspace configs override global for same server names
- Structured JSON editor with validation

### Provider Management

Manage multiple Claude API configurations:

- Custom API keys
- Base URLs for alternative endpoints
- Extra environment variables
- Active/inactive status
- Auto-sync to `~/.claude/settings.json`

---

## Development

### Scripts

```bash
pnpm dev              # Start dev server with hot reload
pnpm start            # Preview production build
pnpm typecheck        # Type check all code
pnpm typecheck:node   # Check main/preload only
pnpm typecheck:web    # Check renderer only
pnpm lint             # Run ESLint
pnpm format           # Format with Prettier
```

### Database Schema

Managed with Drizzle ORM (`src/main/db/schema.ts`):

- **sessions** - Chat sessions with SDK session IDs
- **messages** - Chat history with content blocks
- **providers** - API provider configurations
- **settings** - Key-value application settings

Database location: `~/.ccdisk/sessions.db`

### IPC Communication

All main ↔ renderer communication uses typed IPC channels:

- Centralized channel constants in `src/shared/ipc-channels.ts`
- Type-safe preload bridge exposes `window.api.*`
- Consistent error handling with `IPCResponse<T>`
- Event listeners for streaming and notifications

---

## Configuration

### File Locations

- **Database**: `~/.ccdisk/sessions.db`
- **Global skills**: `~/.claude/skills/*.md`
- **Global commands**: `~/.claude/commands/*`
- **Global MCP config**: `~/.claude/mcp.json`
- **Active provider**: `~/.claude/settings.json`
- **Workspace skills**: `<workspace>/.claude/skills/*.md`
- **Workspace commands**: `<workspace>/.claude/commands/*`
- **Workspace MCP config**: `<workspace>/.claude/mcp.json`

### Compatibility

CCDisk is compatible with [Claude Code CLI](https://docs.anthropic.com/en/docs/agents-tool-use)'s file-based configuration system. Skills, commands, and MCP servers created in CCDisk work seamlessly with the Claude Code CLI and vice versa.

---

## Contributing

Contributions are welcome! Please see [AGENTS.md](AGENTS.md) for developer guidelines, including:

- Build and test commands
- Code style guidelines
- Project architecture
- Common patterns and pitfalls

### Code Style

- **Formatting**: Prettier with single quotes, no semicolons
- **Naming**: kebab-case files, camelCase variables, PascalCase types/components
- **Types**: Explicit return types, `import type` for type-only imports
- **Error handling**: Try-catch with `IPCResponse<T>` pattern

---

## License

MIT License - see [LICENSE](LICENSE) file for details.

---

## Acknowledgments

- Built with [Claude Agent SDK](https://github.com/anthropics/claude-agent-sdk)
- UI components from [Radix UI](https://www.radix-ui.com/)
- Rich text editing by [Lexical](https://lexical.dev/)
- Markdown rendering by [streamdown](https://github.com/streamdown/streamdown)
