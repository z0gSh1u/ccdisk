# AI Chat Titles Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Automatically update chat titles from "New Chat" to either a truncated user message or an AI-generated title when the first message is sent.

**Architecture:** On first message send, the chat handler checks the `ai_generate_titles` setting. If off (default), it truncates the user message to ~20 chars. If on, it fires a standalone `fetch` to the Anthropic Messages API (no SDK session) to generate a short title. The result is pushed to the renderer via a new `chat:title-updated` IPC event. The setting is stored in SQLite's `settings` table and configurable via a toggle in the Claude Config panel.

**Tech Stack:** Electron IPC, better-sqlite3/Drizzle ORM, Anthropic Messages REST API (fetch), React/Zustand, Tailwind CSS

---

### Task 1: Add IPC channels for generic settings and title-updated event

**Files:**

- Modify: `src/shared/ipc-channels.ts:5-66`

**Step 1: Add new channel constants**

Add these three constants to the `IPC_CHANNELS` object:

```typescript
// In the "Settings & Providers" section, after SETTINGS_UPDATE_CLAUDE_ENV:
SETTINGS_GET: 'settings:get',
SETTINGS_SET: 'settings:set',

// In the "Chat operations" section, after CHAT_ABORT:
CHAT_TITLE_UPDATED: 'chat:title-updated',
```

**Step 2: Verify no type errors**

Run: `pnpm typecheck:node`
Expected: PASS (new constants are just strings)

**Step 3: Commit**

```bash
git add src/shared/ipc-channels.ts
git commit -m "feat: add IPC channels for generic settings and chat title updates"
```

---

### Task 2: Add generic settings IPC handlers

**Files:**

- Modify: `src/main/ipc/settings-handler.ts:13-130`

**Step 1: Add settings get/set handlers**

At the end of the `registerSettingsHandlers` function body (before the closing `}`), add:

```typescript
// Get a setting by key
ipcMain.handle(IPC_CHANNELS.SETTINGS_GET, async (_event, key: string) => {
  try {
    const value = await dbService.getSetting(key);
    return { success: true, data: value } as IPCResponse;
  } catch (error) {
    console.error('SETTINGS_GET error:', error);
    return { success: false, error: (error as Error).message } as IPCResponse;
  }
});

// Set a setting by key
ipcMain.handle(IPC_CHANNELS.SETTINGS_SET, async (_event, key: string, value: string) => {
  try {
    await dbService.setSetting(key, value);
    return { success: true } as IPCResponse;
  } catch (error) {
    console.error('SETTINGS_SET error:', error);
    return { success: false, error: (error as Error).message } as IPCResponse;
  }
});
```

Note: `dbService.getSetting()` and `dbService.setSetting()` already exist in `db-service.ts:212-222`.

**Step 2: Verify no type errors**

Run: `pnpm typecheck:node`
Expected: PASS

**Step 3: Commit**

```bash
git add src/main/ipc/settings-handler.ts
git commit -m "feat: add generic settings get/set IPC handlers"
```

---

### Task 3: Add preload bridge for new IPC channels

**Files:**

- Modify: `src/preload/index.ts:62-76` (settings section)
- Modify: `src/preload/index.ts:21-33` (chat section)
- Modify: `src/preload/index.d.ts:17-83` (type declarations)

**Step 1: Add settings.get and settings.set to preload/index.ts**

In the `settings` object (around line 62), after the `updateClaudeEnv` entry (line 74-75), add:

```typescript
    get: (key: string): Promise<IPCResponse<string | undefined>> =>
      ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_GET, key),
    set: (key: string, value: string): Promise<IPCResponse<void>> =>
      ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_SET, key, value),
```

**Step 2: Add chat.onTitleUpdated to preload/index.ts**

In the `chat` object (around line 21), after the `abort` entry (line 32), add:

```typescript
    onTitleUpdated: (callback: (sessionId: string, newTitle: string) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, sessionId: string, newTitle: string) =>
        callback(sessionId, newTitle)
      ipcRenderer.on(IPC_CHANNELS.CHAT_TITLE_UPDATED, handler)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.CHAT_TITLE_UPDATED, handler)
    },
```

**Step 3: Update type declarations in preload/index.d.ts**

In the `chat` interface (around line 18-32), after the `abort` method, add:

```typescript
    onTitleUpdated: (callback: (sessionId: string, newTitle: string) => void) => () => void;
```

In the `settings` interface (around line 48-58), after `updateClaudeEnv`, add:

```typescript
get: (key: string) => Promise<IPCResponse<string | undefined>>;
set: (key: string, value: string) => Promise<IPCResponse<void>>;
```

**Step 4: Verify no type errors**

Run: `pnpm typecheck`
Expected: PASS

**Step 5: Commit**

```bash
git add src/preload/index.ts src/preload/index.d.ts
git commit -m "feat: expose settings get/set and chat title-updated in preload bridge"
```

---

### Task 4: Add title generation utility function

**Files:**

- Modify: `src/main/ipc/chat-handler.ts`

**Step 1: Add generateTitleWithAI function**

Add this function after the `resolveMentions` function (after line 76), before `registerChatHandlers`:

```typescript
/**
 * Generate a chat title using the Anthropic Messages API directly (no SDK session).
 * Returns the generated title string, or null on failure.
 */
async function generateTitleWithAI(userMessage: string, configService: ConfigService): Promise<string | null> {
  try {
    const env = await configService.getClaudeEnv();
    const apiKey = env.ANTHROPIC_AUTH_TOKEN;
    if (!apiKey) return null;

    const baseUrl = env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com';
    const model = env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514';

    const response = await fetch(`${baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model,
        max_tokens: 30,
        system:
          'Generate a short title (under 10 characters) for this conversation based on the user message. Return only the title text, nothing else. No quotes, no punctuation at the end.',
        messages: [{ role: 'user', content: userMessage }]
      })
    });

    if (!response.ok) {
      console.error('Title generation API error:', response.status, response.statusText);
      return null;
    }

    const data = await response.json();
    const title = data?.content?.[0]?.text?.trim();
    return title || null;
  } catch (error) {
    console.error('Failed to generate title with AI:', error);
    return null;
  }
}
```

Also add the `ConfigService` import at the top of the file:

```typescript
import { ConfigService } from '../services/config-service';
```

**Step 2: Verify no type errors**

Run: `pnpm typecheck:node`
Expected: PASS

**Step 3: Commit**

```bash
git add src/main/ipc/chat-handler.ts
git commit -m "feat: add AI title generation utility using Anthropic Messages API"
```

---

### Task 5: Add title update logic to chat:send handler

**Files:**

- Modify: `src/main/ipc/chat-handler.ts:78-118`

**Step 1: Update registerChatHandlers signature**

Add `configService: ConfigService` parameter to `registerChatHandlers`:

```typescript
export function registerChatHandlers(
  _win: BrowserWindow,
  claudeService: ClaudeService,
  dbService: DatabaseService,
  skillsService: SkillsService,
  commandsService: CommandsService,
  fileWatcher: FileWatcherService,
  configService: ConfigService
): void {
```

**Step 2: Add title update logic inside the CHAT_SEND handler**

Inside the `CHAT_SEND` handler, after saving the user message to the database (after line 110, before `return { success: true }`), add:

```typescript
// Auto-update title on first message
const existingMessages = await dbService.getMessages(sessionId);
// Only 1 message means this is the first (the one we just saved)
if (existingMessages.length === 1) {
  const aiTitlesSetting = await dbService.getSetting('ai_generate_titles');
  const useAI = aiTitlesSetting === 'true';

  if (useAI) {
    // Fire-and-forget: generate title with AI, fallback to truncation
    generateTitleWithAI(message, configService)
      .then(async (title) => {
        const finalTitle = title || truncateTitle(message);
        await dbService.updateSession(sessionId, { name: finalTitle, updatedAt: new Date() });
        _win.webContents.send(IPC_CHANNELS.CHAT_TITLE_UPDATED, sessionId, finalTitle);
      })
      .catch(async (err) => {
        console.error('AI title generation failed, using truncation:', err);
        const fallbackTitle = truncateTitle(message);
        await dbService.updateSession(sessionId, { name: fallbackTitle, updatedAt: new Date() });
        _win.webContents.send(IPC_CHANNELS.CHAT_TITLE_UPDATED, sessionId, fallbackTitle);
      });
  } else {
    // Truncate user message
    const title = truncateTitle(message);
    await dbService.updateSession(sessionId, { name: title, updatedAt: new Date() });
    _win.webContents.send(IPC_CHANNELS.CHAT_TITLE_UPDATED, sessionId, title);
  }
}
```

**Step 3: Add truncateTitle helper**

Add this helper function near the top of the file (after imports, before `resolveMentions`):

```typescript
/** Truncate a message to use as a chat title */
function truncateTitle(message: string, maxLength = 20): string {
  // Strip mention markers for cleaner titles
  const clean = message.replace(/\[\/(command|skill):[^\]]+\]|\[@file:[^\]]+\]/g, '').trim();
  if (clean.length <= maxLength) return clean;
  return clean.slice(0, maxLength) + '...';
}
```

**Step 4: Update the BrowserWindow parameter name**

Change `_win` to `win` in the function signature since we now use it:

```typescript
export function registerChatHandlers(
  win: BrowserWindow,
  ...
```

And update the CHAT_SEND handler to use `win` instead of `_win`:

```typescript
win.webContents.send(IPC_CHANNELS.CHAT_TITLE_UPDATED, sessionId, finalTitle);
```

**Step 5: Update the call site in main/index.ts**

In `src/main/index.ts:105`, add `configService` as the last argument:

```typescript
registerChatHandlers(mainWindow, claudeService, dbService, skillsService, commandsService, fileWatcher, configService);
```

**Step 6: Verify no type errors**

Run: `pnpm typecheck:node`
Expected: PASS

**Step 7: Commit**

```bash
git add src/main/ipc/chat-handler.ts src/main/index.ts
git commit -m "feat: auto-update chat title on first message with truncation or AI"
```

---

### Task 6: Add title-updated listener in chat store

**Files:**

- Modify: `src/renderer/src/stores/chat-store.ts:421-426`

**Step 1: Add onTitleUpdated listener to setupChatStreamListener**

Rename `setupChatStreamListener` to also set up the title listener (or keep the name and add the listener inside). Modify the function:

```typescript
export function setupChatStreamListener() {
  const teardownStream = window.api.chat.onStream((sessionId, event) => {
    useChatStore.getState().handleStreamEvent(sessionId, event);
  });

  const teardownTitle = window.api.chat.onTitleUpdated((sessionId, newTitle) => {
    useChatStore.setState((state) => ({
      sessions: state.sessions.map((s) => (s.id === sessionId ? { ...s, name: newTitle } : s))
    }));
  });

  return () => {
    teardownStream();
    teardownTitle();
  };
}
```

**Step 2: Verify no type errors**

Run: `pnpm typecheck:web`
Expected: PASS

**Step 3: Commit**

```bash
git add src/renderer/src/stores/chat-store.ts
git commit -m "feat: listen for chat title updates from main process"
```

---

### Task 7: Add toggle switch to ClaudeConfigEditor

**Files:**

- Modify: `src/renderer/src/components/settings/ClaudeConfigEditor.tsx`

**Step 1: Add state and load/save logic for the toggle**

Inside the `ClaudeConfigEditor` component, after the existing state declarations (around line 75), add:

```typescript
const [aiTitles, setAiTitles] = useState(false);
const [aiTitlesLoaded, setAiTitlesLoaded] = useState(false);
```

Add a useEffect to load the initial value (after the existing `useEffect` on line 103-105):

```typescript
useEffect(() => {
  window.api.settings.get('ai_generate_titles').then((res) => {
    if (res.success) {
      setAiTitles(res.data === 'true');
    }
    setAiTitlesLoaded(true);
  });
}, []);
```

Add a handler for toggling:

```typescript
const handleAiTitlesToggle = async (enabled: boolean) => {
  setAiTitles(enabled);
  try {
    await window.api.settings.set('ai_generate_titles', enabled ? 'true' : 'false');
  } catch (error) {
    console.error('Failed to save AI titles setting:', error);
    setAiTitles(!enabled); // revert on error
  }
};
```

**Step 2: Add the toggle UI**

After the env fields section (after the closing `</div>` of the `space-y-4` div around line 236), add a divider and toggle section:

```tsx
<div className="border-t border-gray-200 pt-4">
  <div className="flex items-center justify-between">
    <div className="space-y-0.5">
      <Label>AI Generate Chat Titles</Label>
      <p className="text-xs text-gray-500">
        Use AI to automatically generate titles for new chats. Incurs additional API call costs.
      </p>
    </div>
    <button
      role="switch"
      aria-checked={aiTitles}
      disabled={!aiTitlesLoaded}
      onClick={() => handleAiTitlesToggle(!aiTitles)}
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${
        aiTitles ? 'bg-blue-600' : 'bg-gray-200'
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
          aiTitles ? 'translate-x-4' : 'translate-x-0'
        }`}
      />
    </button>
  </div>
</div>
```

**Step 3: Verify no type errors**

Run: `pnpm typecheck:web`
Expected: PASS

**Step 4: Commit**

```bash
git add src/renderer/src/components/settings/ClaudeConfigEditor.tsx
git commit -m "feat: add AI title generation toggle to Claude Config panel"
```

---

### Task 8: Final verification

**Step 1: Full type check**

Run: `pnpm typecheck`
Expected: PASS for both node and web

**Step 2: Lint check**

Run: `pnpm lint`
Expected: PASS (or only pre-existing warnings)

**Step 3: Format**

Run: `pnpm format`

**Step 4: Final commit if formatting changed anything**

```bash
git add -A
git commit -m "chore: format code"
```
