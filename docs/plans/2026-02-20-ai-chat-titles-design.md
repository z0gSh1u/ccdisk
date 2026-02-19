# AI Chat Titles Design

## Overview

New chats always start with "New Chat" as the title. This feature adds automatic title generation:

- **Setting OFF (default):** truncate user's first message to ~20 chars as title
- **Setting ON:** use AI (Anthropic Messages API) to generate a short title

The setting lives in Claude Config panel since it depends on the user's API key/model config.

## Data Layer

### Settings Storage

SQLite `settings` table, key-value:

- key: `ai_generate_titles`
- value: `'false'` (default)

### DatabaseService

Add generic setting accessors in `db-service.ts`:

- `getSetting(key: string): string | undefined`
- `setSetting(key: string, value: string): void` (upsert)

### IPC Channels

In `settings-handler.ts`, add two generic handlers:

- `settings:get` — read a setting by key
- `settings:set` — write a setting by key

Reusable for future settings without adding new handlers each time.

## Title Generation Logic

### Trigger

In `chat-handler.ts`, inside the `chat:send` handler. When the user sends a message:

1. Check if this is the first message of the session (no existing messages)
2. If not the first message, skip

### Branching

Read `ai_generate_titles` from the settings table:

**OFF (default):**

- Synchronously truncate user message to first 20 characters (append `...` if truncated)
- Update DB via `dbService.updateSession()`
- Notify renderer via `webContents.send('chat:title-updated', sessionId, newTitle)`

**ON:**

- Fire-and-forget async call to `generateTitle(userMessage)`
- Runs in parallel with the main `claudeService.sendMessage()`, no blocking
- On success: update DB + notify renderer
- On failure: silently fallback to truncation method

### generateTitle Implementation

Location: new utility function in `claude-service.ts` or standalone module.

Method:

- Read user's configured API key / base URL / model from `~/.claude/settings.json` via `configService`
- Direct `fetch` to Anthropic Messages API (`POST /v1/messages`)
- System prompt: "Generate a short title (under 10 characters) for this conversation. Return only the title text, nothing else."
- User message content: the user's first message
- `max_tokens`: 30
- No SDK session, no tool use, no context pollution

## Renderer Changes

### Chat Store

In `chat-store.ts`, add a listener for `chat:title-updated`:

- `window.api.chat.onTitleUpdated((sessionId, newTitle) => { ... })`
- Updates the matching session's `name` in the store
- Sidebar re-renders automatically since it reads from `sessions` state

### Settings UI

In `ClaudeConfigEditor.tsx`, below the existing three env fields:

- Toggle switch: "AI Generate Chat Titles"
- Description: "Use AI to automatically generate titles for new chats. Incurs additional API call costs."
- Reads initial value from `settings:get('ai_generate_titles')`
- On change: calls `settings:set('ai_generate_titles', value)`

### Preload Bridge

Expose new IPC channels in preload:

- `window.api.settings.get(key)` / `window.api.settings.set(key, value)`
- `window.api.chat.onTitleUpdated(callback)`

## Error Handling

- AI title generation failure: silent fallback to truncation, log error to console
- Missing API key / model: skip AI generation, use truncation
- Network timeout: same fallback behavior
- Title generation must never block or affect the main chat flow
