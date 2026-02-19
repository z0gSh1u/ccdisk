# Lexical Mention & Slash Command System Design

## Overview

Add slash commands (`/`) and at-mentions (`@`) to the Lexical-based chat input. Slash commands reference Commands and Skills. At-mentions reference files and folders in the workspace. Both render as atomic badges in the editor and chat history, and are serialized as marked-up strings for IPC transport.

## Requirements

- `/` triggers only at the very start of input, opens a completion list of Commands and Skills
- `@` triggers at any position, opens a completion list of workspace files/folders
- Selected items render as atomic inline badges (deleted as a unit by Backspace/Delete)
- Completion popup uses `@floating-ui/react` for positioning
- Messages are sent as marked-up strings (e.g., `[/skill:name]`, `[@file:path]`)
- Chat history renders mentions as styled badges
- Backend resolves mention content before forwarding to Claude

## Architecture

### File Structure

```
src/renderer/src/components/chat/
├── LexicalMessageInput.tsx          # Modified: register MentionNode, add plugins
├── MentionBadge.tsx                 # New: shared badge component (editor + chat history)
├── nodes/
│   └── MentionNode.tsx              # New: DecoratorNode for atomic mentions
├── plugins/
│   ├── SlashCommandPlugin.tsx       # New: / trigger detection + completion
│   ├── FileMentionPlugin.tsx        # New: @ trigger detection + completion
│   └── CompletionPopup.tsx          # New: shared floating completion list
└── utils/
    └── mention-serialization.ts     # New: serialize/parse mention markers
```

### Component Relationship

```
LexicalComposer (registers MentionNode)
  ├── PlainTextPlugin
  ├── HistoryPlugin
  ├── EnterKeyPlugin (modified: uses mention serializer)
  ├── SlashCommandPlugin
  │     └── CompletionPopup (uses skills-store + commands-store)
  └── FileMentionPlugin
        └── CompletionPopup (uses workspace-store file tree)
```

## Custom Lexical Node: MentionNode

`MentionNode` extends `DecoratorNode` for atomic inline rendering.

### Properties

```typescript
type MentionType = 'command' | 'skill' | 'file';

class MentionNode extends DecoratorNode<ReactNode> {
  __mentionType: MentionType; // 'command', 'skill', or 'file'
  __mentionName: string; // Display name: 'agent-browser', 'src/main.ts'
  __mentionData?: string; // Optional extra data (full path, scope)
}
```

### Behaviors

- `isInline()` returns `true`
- `isIsolated()` returns `true` (cursor cannot enter the node)
- `getTextContent()` returns the marked-up form: `[/skill:agent-browser]` or `[@file:src/main.ts]`
- `decorate()` returns a `<MentionBadge>` React component
- `exportJSON()` / `importJSON()` for undo/redo and clipboard
- Atomic deletion is handled natively by DecoratorNode

### Extensibility

Adding future mention types (e.g., `@user`, `#tag`) requires only a new `MentionType` value and a corresponding icon/color in `MentionBadge`.

## Plugin Design

Both plugins follow the same pattern: listen for text changes, detect a trigger, show the popup, replace trigger text with a `MentionNode` on selection.

### SlashCommandPlugin

- Registers `editor.registerUpdateListener`
- Checks if entire editor content starts with `/`
- Extracts query after `/` (e.g., `/age` -> query `age`)
- Fetches items from `useSkillsStore` + `useCommandsStore` (already loaded via Zustand)
- Filters by fuzzy-matching query against names
- Items shaped as `{ type: 'command' | 'skill', name, scope }` in a single flat list with type labels
- On selection: replaces `/query` text range with a `MentionNode`, inserts a trailing space

### FileMentionPlugin

- Same listener pattern, triggers on `@` at any position
- Scans backward from cursor to find the nearest unmatched `@`
- Fetches file tree from `useWorkspaceStore`, flattens into a path list
- Filters by matching query against relative paths
- On selection: replaces `@query` text range with a `MentionNode`

### Trigger Range Tracking

Both plugins store the trigger's anchor point (`PointType`) when detected, and use `$createRangeSelection()` to select and replace the trigger range on completion.

## Completion Popup

Generic, reusable floating list. Plugins own data and trigger logic; this component handles rendering and interaction.

### Props

```typescript
interface CompletionItem {
  id: string;
  label: string;
  description?: string;
  icon?: ReactNode;
  type: string;
}

interface CompletionPopupProps {
  items: CompletionItem[];
  anchorElement: HTMLElement | null;
  anchorRect: DOMRect | null;
  isOpen: boolean;
  onSelect: (item: CompletionItem) => void;
  onClose: () => void;
}
```

### Floating UI Setup

- `useFloating()` with `offset(8)` + `flip()` + `shift()` middleware
- Positioned via virtual reference from caret's `DOMRect` (`window.getSelection().getRangeAt(0).getBoundingClientRect()`)
- Default placement: `bottom-start`, flips to `top-start` near viewport bottom

### Keyboard Navigation

Handled in the plugin (not the popup) via `KEY_DOWN_COMMAND` at `COMMAND_PRIORITY_HIGH` when popup is open:

- Arrow Up/Down: move highlighted index, scroll into view
- Enter/Tab: select highlighted item
- Escape: close popup
- Other keys: pass through to editor (continue typing/filtering)

## Message Serialization

### Editor to String

`serializeEditorState(editorState)` walks the Lexical node tree:

- `TextNode` contributes text as-is
- `MentionNode` contributes its marked-up form via `getTextContent()`

Result example: `Use [/skill:agent-browser] to check [@file:src/main.ts] for browser tests`

### String to Segments

`parseMentions(text)` returns an array for rendering:

```typescript
type MessageSegment = { type: 'text'; content: string } | { type: 'mention'; mentionType: MentionType; name: string };
```

Used in chat history rendering and backend reference extraction.

## Chat History Rendering

### User Messages

`MessageBubble` uses `parseMentions()` to render user messages with `MentionBadge` components inline instead of raw text.

### Assistant Messages

No changes. Continue rendering through `MarkdownRenderer`.

### Database Storage

Messages stored with markers intact (`[/skill:agent-browser]`). No schema changes needed.

## Backend Changes

### chat-handler.ts

Before forwarding to Claude, resolves marked-up references:

- `[/command:name]` -> resolves via `commandsService.getCommand(name)`, prepends content as context
- `[/skill:name]` -> resolves via `skillsService.getSkill(name)`, prepends content as context
- `[@file:path]` -> transformed to a path reference (e.g., `(See file: path)`)

The original marked-up string is saved to the database. The resolved string is sent to Claude.

### claude-service.ts

No changes. Continues receiving a plain string via `session.send(message)`.

## New Dependency

`@floating-ui/react` must be added as a direct dependency (currently only available as a transitive dep from Radix UI).

## Files Changed Summary

| File                             | Change                                        |
| -------------------------------- | --------------------------------------------- |
| `LexicalMessageInput.tsx`        | Register `MentionNode`, add plugins           |
| `nodes/MentionNode.tsx`          | New                                           |
| `plugins/SlashCommandPlugin.tsx` | New                                           |
| `plugins/FileMentionPlugin.tsx`  | New                                           |
| `plugins/CompletionPopup.tsx`    | New                                           |
| `MentionBadge.tsx`               | New                                           |
| `utils/mention-serialization.ts` | New                                           |
| `ChatInterface.tsx`              | Use `parseMentions` in user message rendering |
| `chat-handler.ts`                | Resolve mentions before sending to Claude     |
| `package.json`                   | Add `@floating-ui/react`                      |
