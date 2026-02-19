# Mention & Slash Command Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add `/` slash commands and `@` file mentions to the Lexical chat input with atomic badge rendering, floating completion popups, and backend mention resolution.

**Architecture:** Custom `MentionNode` (DecoratorNode) renders inline badges. Two plugins (`SlashCommandPlugin`, `FileMentionPlugin`) handle trigger detection and completion. A shared `CompletionPopup` uses `@floating-ui/react` for positioning. Messages serialize mentions as marked-up strings (`[/skill:name]`, `[@file:path]`) for IPC transport. Backend resolves mentions before forwarding to Claude.

**Tech Stack:** Lexical (DecoratorNode, plugins), @floating-ui/react, React, Zustand, TypeScript

---

### Task 1: Install @floating-ui/react

**Files:**

- Modify: `package.json`

**Step 1: Add dependency**

Run: `pnpm add @floating-ui/react`

**Step 2: Verify installation**

Run: `ls node_modules/@floating-ui/react/package.json`
Expected: File exists

**Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: add @floating-ui/react as direct dependency"
```

---

### Task 2: Create MentionNode (DecoratorNode)

**Files:**

- Create: `src/renderer/src/components/chat/nodes/MentionNode.tsx`

**Step 1: Create the MentionNode**

This is a Lexical `DecoratorNode` that renders as an inline atomic badge. It stores `mentionType`, `mentionName`, and optional `mentionData`. The `getTextContent()` method returns the marked-up serialization form.

```tsx
/**
 * MentionNode - Atomic inline DecoratorNode for / and @ mentions
 * Renders as a styled badge that is deleted as a single unit
 */

import {
  DecoratorNode,
  $applyNodeReplacement,
  type DOMConversionMap,
  type DOMExportOutput,
  type EditorConfig,
  type LexicalNode,
  type NodeKey,
  type SerializedLexicalNode,
  type Spread
} from 'lexical';
import type { ReactNode } from 'react';
import { MentionBadge } from '../MentionBadge';

export type MentionType = 'command' | 'skill' | 'file';

export type SerializedMentionNode = Spread<
  {
    mentionType: MentionType;
    mentionName: string;
    mentionData?: string;
  },
  SerializedLexicalNode
>;

export class MentionNode extends DecoratorNode<ReactNode> {
  __mentionType: MentionType;
  __mentionName: string;
  __mentionData?: string;

  static getType(): string {
    return 'mention';
  }

  static clone(node: MentionNode): MentionNode {
    return new MentionNode(node.__mentionType, node.__mentionName, node.__mentionData, node.__key);
  }

  static importJSON(serializedNode: SerializedMentionNode): MentionNode {
    return new MentionNode(serializedNode.mentionType, serializedNode.mentionName, serializedNode.mentionData);
  }

  constructor(mentionType: MentionType, mentionName: string, mentionData?: string, key?: NodeKey) {
    super(key);
    this.__mentionType = mentionType;
    this.__mentionName = mentionName;
    this.__mentionData = mentionData;
  }

  exportJSON(): SerializedMentionNode {
    return {
      ...super.exportJSON(),
      mentionType: this.__mentionType,
      mentionName: this.__mentionName,
      mentionData: this.__mentionData,
      type: 'mention',
      version: 1
    };
  }

  createDOM(config: EditorConfig): HTMLElement {
    const span = document.createElement('span');
    span.className = config.theme.mention || 'mention-node';
    return span;
  }

  updateDOM(): false {
    return false;
  }

  exportDOM(): DOMExportOutput {
    const element = document.createElement('span');
    element.setAttribute('data-mention-type', this.__mentionType);
    element.setAttribute('data-mention-name', this.__mentionName);
    if (this.__mentionData) {
      element.setAttribute('data-mention-data', this.__mentionData);
    }
    element.textContent = this.getTextContent();
    return { element };
  }

  static importDOM(): DOMConversionMap | null {
    return null;
  }

  getTextContent(): string {
    if (this.__mentionType === 'file') {
      return `[@file:${this.__mentionName}]`;
    }
    return `[/${this.__mentionType}:${this.__mentionName}]`;
  }

  isInline(): true {
    return true;
  }

  isIsolated(): true {
    return true;
  }

  decorate(): ReactNode {
    return <MentionBadge type={this.__mentionType} name={this.__mentionName} />;
  }
}

export function $createMentionNode(mentionType: MentionType, mentionName: string, mentionData?: string): MentionNode {
  return $applyNodeReplacement(new MentionNode(mentionType, mentionName, mentionData));
}

export function $isMentionNode(node: LexicalNode | null | undefined): node is MentionNode {
  return node instanceof MentionNode;
}
```

**Step 2: Verify typecheck**

Run: `pnpm typecheck:web`
Expected: No new errors from this file (MentionBadge import will fail until Task 3 — that's expected)

**Step 3: Commit**

```bash
git add src/renderer/src/components/chat/nodes/MentionNode.tsx
git commit -m "feat: add MentionNode DecoratorNode for atomic inline mentions"
```

---

### Task 3: Create MentionBadge component

**Files:**

- Create: `src/renderer/src/components/chat/MentionBadge.tsx`

**Step 1: Create the shared badge component**

This component is used both inside `MentionNode.decorate()` (in the editor) and in `MessageBubble` (in chat history). It renders a small inline pill with an icon and name.

```tsx
/**
 * MentionBadge - Shared inline badge for mention rendering
 * Used in both the Lexical editor (MentionNode) and chat history (MessageBubble)
 */

import { Terminal, BookOpen, FileText } from 'lucide-react';
import type { MentionType } from './nodes/MentionNode';

interface MentionBadgeProps {
  type: MentionType;
  name: string;
}

const mentionConfig: Record<MentionType, { icon: typeof Terminal; bgClass: string; textClass: string }> = {
  command: {
    icon: Terminal,
    bgClass: 'bg-amber-100 dark:bg-amber-900/30',
    textClass: 'text-amber-800 dark:text-amber-200'
  },
  skill: {
    icon: BookOpen,
    bgClass: 'bg-blue-100 dark:bg-blue-900/30',
    textClass: 'text-blue-800 dark:text-blue-200'
  },
  file: {
    icon: FileText,
    bgClass: 'bg-emerald-100 dark:bg-emerald-900/30',
    textClass: 'text-emerald-800 dark:text-emerald-200'
  }
};

export function MentionBadge({ type, name }: MentionBadgeProps) {
  const config = mentionConfig[type];
  const Icon = config.icon;
  const prefix = type === 'file' ? '@' : '/';

  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium ${config.bgClass} ${config.textClass} select-none`}
    >
      <Icon className="h-3 w-3 shrink-0" />
      <span>
        {prefix}
        {name}
      </span>
    </span>
  );
}
```

**Step 2: Verify typecheck**

Run: `pnpm typecheck:web`
Expected: MentionNode.tsx and MentionBadge.tsx should now both pass

**Step 3: Commit**

```bash
git add src/renderer/src/components/chat/MentionBadge.tsx
git commit -m "feat: add MentionBadge shared inline badge component"
```

---

### Task 4: Create mention-serialization utility

**Files:**

- Create: `src/renderer/src/components/chat/utils/mention-serialization.ts`

**Step 1: Create serialization utilities**

Two functions: `serializeEditorState` (walks Lexical tree, returns marked-up string) and `parseMentions` (parses marked-up string into segments for rendering).

```typescript
/**
 * Mention serialization utilities
 * Converts between Lexical editor state and marked-up strings
 */

import type { EditorState, LexicalNode } from 'lexical';
import { $getRoot, $isTextNode, $isLineBreakNode } from 'lexical';
import { $isMentionNode } from '../nodes/MentionNode';
import type { MentionType } from '../nodes/MentionNode';

export interface TextSegment {
  type: 'text';
  content: string;
}

export interface MentionSegment {
  type: 'mention';
  mentionType: MentionType;
  name: string;
}

export type MessageSegment = TextSegment | MentionSegment;

/**
 * Serialize Lexical editor state to a marked-up string.
 * TextNodes contribute text as-is.
 * MentionNodes contribute their marked-up form via getTextContent().
 * Must be called within editor.getEditorState().read() or editor.update().
 */
export function $serializeToMarkedText(): string {
  const root = $getRoot();
  const parts: string[] = [];

  const processNode = (node: LexicalNode): void => {
    if ($isTextNode(node)) {
      parts.push(node.getTextContent());
    } else if ($isMentionNode(node)) {
      parts.push(node.getTextContent());
    } else if ($isLineBreakNode(node)) {
      parts.push('\n');
    } else {
      // ElementNode (ParagraphNode, etc.) — process children
      const children = 'getChildren' in node ? (node as any).getChildren() : [];
      for (let i = 0; i < children.length; i++) {
        processNode(children[i]);
      }
      // Add newline between paragraphs (except the last one)
      if (node.getType() === 'paragraph' && node.getNextSibling()) {
        parts.push('\n');
      }
    }
  };

  const children = root.getChildren();
  for (const child of children) {
    processNode(child);
  }

  return parts.join('');
}

/**
 * Parse a marked-up message string into segments for rendering.
 * Recognizes patterns: [/command:name], [/skill:name], [@file:path]
 */
export function parseMentions(text: string): MessageSegment[] {
  const segments: MessageSegment[] = [];
  // Match [/command:name], [/skill:name], [@file:path]
  const mentionRegex = /\[\/(command|skill):([^\]]+)\]|\[@file:([^\]]+)\]/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = mentionRegex.exec(text)) !== null) {
    // Add text before this match
    if (match.index > lastIndex) {
      segments.push({ type: 'text', content: text.slice(lastIndex, match.index) });
    }

    if (match[1] && match[2]) {
      // Slash command or skill: [/command:name] or [/skill:name]
      segments.push({
        type: 'mention',
        mentionType: match[1] as MentionType,
        name: match[2]
      });
    } else if (match[3]) {
      // File mention: [@file:path]
      segments.push({
        type: 'mention',
        mentionType: 'file',
        name: match[3]
      });
    }

    lastIndex = match.index + match[0].length;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    segments.push({ type: 'text', content: text.slice(lastIndex) });
  }

  return segments;
}
```

**Step 2: Verify typecheck**

Run: `pnpm typecheck:web`
Expected: PASS

**Step 3: Commit**

```bash
git add src/renderer/src/components/chat/utils/mention-serialization.ts
git commit -m "feat: add mention serialization and parsing utilities"
```

---

### Task 5: Create CompletionPopup component

**Files:**

- Create: `src/renderer/src/components/chat/plugins/CompletionPopup.tsx`

**Step 1: Create the floating completion list**

Generic popup positioned via `@floating-ui/react`. The plugins handle keyboard navigation; this component just renders the list and handles mouse selection.

```tsx
/**
 * CompletionPopup - Floating completion list for / and @ triggers
 * Uses @floating-ui/react for positioning relative to the caret
 */

import { useRef, useEffect } from 'react';
import { useFloating, offset, flip, shift, size } from '@floating-ui/react';
import type { ReactNode } from 'react';

export interface CompletionItem {
  id: string;
  label: string;
  description?: string;
  icon?: ReactNode;
  type: string;
}

interface CompletionPopupProps {
  items: CompletionItem[];
  selectedIndex: number;
  isOpen: boolean;
  anchorRect: DOMRect | null;
  onSelect: (item: CompletionItem) => void;
}

export function CompletionPopup({ items, selectedIndex, isOpen, anchorRect, onSelect }: CompletionPopupProps) {
  const listRef = useRef<HTMLDivElement>(null);

  const { refs, floatingStyles } = useFloating({
    open: isOpen,
    placement: 'bottom-start',
    middleware: [
      offset(8),
      flip({ padding: 8 }),
      shift({ padding: 8 }),
      size({
        padding: 8,
        apply({ availableHeight, elements }) {
          elements.floating.style.maxHeight = `${Math.min(300, availableHeight)}px`;
        }
      })
    ],
    elements: {
      reference: anchorRect
        ? {
            getBoundingClientRect: () => anchorRect
          }
        : undefined
    }
  });

  // Scroll selected item into view
  useEffect(() => {
    if (!listRef.current) return;
    const selected = listRef.current.children[selectedIndex] as HTMLElement | undefined;
    selected?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  if (!isOpen || items.length === 0 || !anchorRect) return null;

  return (
    <div
      ref={refs.setFloating}
      style={floatingStyles}
      className="z-50 overflow-y-auto rounded-lg border border-border-subtle bg-white shadow-lg"
    >
      <div ref={listRef} className="py-1" role="listbox">
        {items.map((item, index) => (
          <div
            key={item.id}
            role="option"
            aria-selected={index === selectedIndex}
            className={`flex items-center gap-2 px-3 py-2 cursor-pointer text-sm ${
              index === selectedIndex ? 'bg-accent/10 text-text-primary' : 'text-text-secondary hover:bg-bg-secondary'
            }`}
            onMouseDown={(e) => {
              e.preventDefault(); // Prevent editor blur
              onSelect(item);
            }}
          >
            {item.icon && <span className="shrink-0">{item.icon}</span>}
            <div className="flex-1 min-w-0">
              <div className="font-medium truncate">{item.label}</div>
              {item.description && <div className="text-xs text-text-tertiary truncate">{item.description}</div>}
            </div>
            <span className="text-[10px] text-text-tertiary uppercase shrink-0">{item.type}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
```

**Step 2: Verify typecheck**

Run: `pnpm typecheck:web`
Expected: PASS

**Step 3: Commit**

```bash
git add src/renderer/src/components/chat/plugins/CompletionPopup.tsx
git commit -m "feat: add CompletionPopup floating completion list component"
```

---

### Task 6: Create SlashCommandPlugin

**Files:**

- Create: `src/renderer/src/components/chat/plugins/SlashCommandPlugin.tsx`

**Step 1: Create the plugin**

Detects `/` at the start of input, shows Commands + Skills completion list, replaces trigger text with a MentionNode on selection.

```tsx
/**
 * SlashCommandPlugin - Detects / at start of input
 * Shows Commands and Skills in a completion popup
 * Inserts MentionNode on selection
 */

import { useCallback, useEffect, useState } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  $getRoot,
  $getSelection,
  $isRangeSelection,
  $createTextNode,
  KEY_DOWN_COMMAND,
  KEY_ESCAPE_COMMAND,
  COMMAND_PRIORITY_HIGH
} from 'lexical';
import { mergeRegister } from '@lexical/utils';
import { Terminal, BookOpen } from 'lucide-react';
import { useSkillsStore } from '../../../stores/skills-store';
import { useCommandsStore } from '../../../stores/commands-store';
import { $createMentionNode } from '../nodes/MentionNode';
import { CompletionPopup } from './CompletionPopup';
import type { CompletionItem } from './CompletionPopup';

function getCaretRect(): DOMRect | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  const rect = range.getBoundingClientRect();
  // If rect is zero-size (collapsed cursor), use range's start container
  if (rect.width === 0 && rect.height === 0) {
    const span = document.createElement('span');
    span.textContent = '\u200b'; // zero-width space
    range.insertNode(span);
    const spanRect = span.getBoundingClientRect();
    span.parentNode?.removeChild(span);
    // Restore selection
    selection.removeAllRanges();
    selection.addRange(range);
    return spanRect;
  }
  return rect;
}

export function SlashCommandPlugin() {
  const [editor] = useLexicalComposerContext();
  const { skills } = useSkillsStore();
  const { commands } = useCommandsStore();

  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);

  // Build completion items from skills + commands
  const allItems: CompletionItem[] = [
    ...commands.map((cmd) => ({
      id: `command:${cmd.name}`,
      label: cmd.name,
      description: cmd.scope,
      icon: <Terminal className="h-4 w-4 text-amber-600" />,
      type: 'command'
    })),
    ...skills.map((skill) => ({
      id: `skill:${skill.name}`,
      label: skill.name,
      description: skill.scope,
      icon: <BookOpen className="h-4 w-4 text-blue-600" />,
      type: 'skill'
    }))
  ];

  // Filter items by query
  const filteredItems = query
    ? allItems.filter((item) => item.label.toLowerCase().includes(query.toLowerCase()))
    : allItems;

  // Clamp selectedIndex when filtered list changes
  useEffect(() => {
    setSelectedIndex((prev) => Math.min(prev, Math.max(0, filteredItems.length - 1)));
  }, [filteredItems.length]);

  // Detect / trigger at start of input
  useEffect(() => {
    return editor.registerUpdateListener(({ editorState }) => {
      editorState.read(() => {
        const root = $getRoot();
        const text = root.getTextContent();
        const selection = $getSelection();

        if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
          setIsOpen(false);
          return;
        }

        // Only trigger when text starts with /
        if (text.startsWith('/')) {
          const slashQuery = text.slice(1).split('\n')[0]; // Only first line
          setQuery(slashQuery);
          setIsOpen(true);

          // Update anchor position
          setTimeout(() => {
            setAnchorRect(getCaretRect());
          }, 0);
        } else {
          setIsOpen(false);
        }
      });
    });
  }, [editor]);

  // Handle selection
  const handleSelect = useCallback(
    (item: CompletionItem) => {
      editor.update(() => {
        const root = $getRoot();
        const firstChild = root.getFirstChild();
        if (!firstChild) return;

        // Clear the entire root (the / and query text)
        root.clear();

        // Create a new paragraph with the mention node
        const { $createParagraphNode } = require('lexical');
        const paragraph = $createParagraphNode();
        const mentionType = item.type as 'command' | 'skill';
        const mentionNode = $createMentionNode(mentionType, item.label);
        const spaceNode = $createTextNode(' ');

        paragraph.append(mentionNode, spaceNode);
        root.append(paragraph);
        spaceNode.select();
      });

      setIsOpen(false);
      setQuery('');
      setSelectedIndex(0);
    },
    [editor]
  );

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    return mergeRegister(
      editor.registerCommand(
        KEY_DOWN_COMMAND,
        (event: KeyboardEvent) => {
          if (!isOpen || filteredItems.length === 0) return false;

          switch (event.key) {
            case 'ArrowDown':
              event.preventDefault();
              setSelectedIndex((prev) => (prev < filteredItems.length - 1 ? prev + 1 : 0));
              return true;
            case 'ArrowUp':
              event.preventDefault();
              setSelectedIndex((prev) => (prev > 0 ? prev - 1 : filteredItems.length - 1));
              return true;
            case 'Tab':
            case 'Enter':
              event.preventDefault();
              event.stopPropagation();
              if (filteredItems[selectedIndex]) {
                handleSelect(filteredItems[selectedIndex]);
              }
              return true;
            case 'Escape':
              event.preventDefault();
              setIsOpen(false);
              return true;
            default:
              return false;
          }
        },
        COMMAND_PRIORITY_HIGH + 1 // Higher than EnterKeyPlugin
      ),
      editor.registerCommand(
        KEY_ESCAPE_COMMAND,
        () => {
          if (isOpen) {
            setIsOpen(false);
            return true;
          }
          return false;
        },
        COMMAND_PRIORITY_HIGH
      )
    );
  }, [editor, isOpen, filteredItems, selectedIndex, handleSelect]);

  return (
    <CompletionPopup
      items={filteredItems}
      selectedIndex={selectedIndex}
      isOpen={isOpen}
      anchorRect={anchorRect}
      onSelect={handleSelect}
    />
  );
}
```

**Step 2: Verify typecheck**

Run: `pnpm typecheck:web`
Expected: PASS

**Step 3: Commit**

```bash
git add src/renderer/src/components/chat/plugins/SlashCommandPlugin.tsx
git commit -m "feat: add SlashCommandPlugin for / command completion"
```

---

### Task 7: Create FileMentionPlugin

**Files:**

- Create: `src/renderer/src/components/chat/plugins/FileMentionPlugin.tsx`

**Step 1: Create the plugin**

Detects `@` at any position, shows workspace file tree as completion list, replaces `@query` with a MentionNode on selection.

```tsx
/**
 * FileMentionPlugin - Detects @ at any position
 * Shows workspace file tree in a completion popup
 * Inserts MentionNode on selection
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  $createTextNode,
  KEY_DOWN_COMMAND,
  KEY_ESCAPE_COMMAND,
  COMMAND_PRIORITY_HIGH
} from 'lexical';
import { mergeRegister } from '@lexical/utils';
import { FileText, Folder } from 'lucide-react';
import { useWorkspaceStore } from '../../../stores/workspace-store';
import { $createMentionNode } from '../nodes/MentionNode';
import { CompletionPopup } from './CompletionPopup';
import type { CompletionItem } from './CompletionPopup';
import type { FileNode } from '../../../../../shared/types';

/**
 * Flatten a FileNode tree into a list of relative paths
 */
function flattenFileTree(nodes: FileNode[], prefix = ''): Array<{ path: string; type: 'file' | 'directory' }> {
  const result: Array<{ path: string; type: 'file' | 'directory' }> = [];
  for (const node of nodes) {
    const fullPath = prefix ? `${prefix}/${node.name}` : node.name;
    result.push({ path: fullPath, type: node.type });
    if (node.children) {
      result.push(...flattenFileTree(node.children, fullPath));
    }
  }
  return result;
}

function getCaretRect(): DOMRect | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  const rect = range.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) {
    const span = document.createElement('span');
    span.textContent = '\u200b';
    range.insertNode(span);
    const spanRect = span.getBoundingClientRect();
    span.parentNode?.removeChild(span);
    selection.removeAllRanges();
    selection.addRange(range);
    return spanRect;
  }
  return rect;
}

/**
 * Find the @ trigger position by scanning backward from cursor in the current text node.
 * Returns the query string after @ (from @ to cursor), or null if no trigger found.
 */
function findAtTrigger(text: string, cursorOffset: number): { query: string; startOffset: number } | null {
  // Scan backward from cursor to find @
  for (let i = cursorOffset - 1; i >= 0; i--) {
    const char = text[i];
    if (char === '@') {
      const query = text.slice(i + 1, cursorOffset);
      // Don't trigger if @ is preceded by a word character (e.g. email addresses)
      if (i > 0 && /\w/.test(text[i - 1])) return null;
      return { query, startOffset: i };
    }
    // Stop scanning if we hit whitespace before finding @
    if (char === ' ' || char === '\n' || char === '\t') return null;
  }
  return null;
}

export function FileMentionPlugin() {
  const [editor] = useLexicalComposerContext();
  const { fileTree } = useWorkspaceStore();

  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const [triggerInfo, setTriggerInfo] = useState<{
    nodeKey: string;
    startOffset: number;
  } | null>(null);

  // Flatten file tree into searchable list
  const flatFiles = useMemo(() => flattenFileTree(fileTree), [fileTree]);

  // Build completion items
  const allItems: CompletionItem[] = flatFiles.map((file) => ({
    id: `file:${file.path}`,
    label: file.path,
    icon:
      file.type === 'directory' ? (
        <Folder className="h-4 w-4 text-emerald-600" />
      ) : (
        <FileText className="h-4 w-4 text-emerald-600" />
      ),
    type: file.type
  }));

  // Filter by query
  const filteredItems = query
    ? allItems.filter((item) => item.label.toLowerCase().includes(query.toLowerCase()))
    : allItems.slice(0, 50); // Limit initial list

  // Clamp selectedIndex
  useEffect(() => {
    setSelectedIndex((prev) => Math.min(prev, Math.max(0, filteredItems.length - 1)));
  }, [filteredItems.length]);

  // Detect @ trigger
  useEffect(() => {
    return editor.registerUpdateListener(({ editorState }) => {
      editorState.read(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
          setIsOpen(false);
          return;
        }

        const anchorNode = selection.anchor.getNode();
        if (!$isTextNode(anchorNode)) {
          setIsOpen(false);
          return;
        }

        const text = anchorNode.getTextContent();
        const cursorOffset = selection.anchor.offset;
        const trigger = findAtTrigger(text, cursorOffset);

        if (trigger) {
          setQuery(trigger.query);
          setTriggerInfo({
            nodeKey: anchorNode.getKey(),
            startOffset: trigger.startOffset
          });
          setIsOpen(true);
          setTimeout(() => {
            setAnchorRect(getCaretRect());
          }, 0);
        } else {
          setIsOpen(false);
          setTriggerInfo(null);
        }
      });
    });
  }, [editor]);

  // Handle selection
  const handleSelect = useCallback(
    (item: CompletionItem) => {
      if (!triggerInfo) return;

      editor.update(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) return;

        const anchorNode = selection.anchor.getNode();
        if (!$isTextNode(anchorNode) || anchorNode.getKey() !== triggerInfo.nodeKey) return;

        const text = anchorNode.getTextContent();
        const cursorOffset = selection.anchor.offset;

        // Split text: before @, and after the query
        const beforeAt = text.slice(0, triggerInfo.startOffset);
        const afterQuery = text.slice(cursorOffset);

        // Replace the text node content
        const mentionNode = $createMentionNode('file', item.label);

        if (beforeAt) {
          anchorNode.setTextContent(beforeAt);
          anchorNode.insertAfter(mentionNode);
        } else {
          anchorNode.replace(mentionNode);
        }

        if (afterQuery) {
          const afterNode = $createTextNode(afterQuery);
          mentionNode.insertAfter(afterNode);
          afterNode.select(0, 0);
        } else {
          const spaceNode = $createTextNode(' ');
          mentionNode.insertAfter(spaceNode);
          spaceNode.select(1, 1);
        }
      });

      setIsOpen(false);
      setQuery('');
      setSelectedIndex(0);
      setTriggerInfo(null);
    },
    [editor, triggerInfo]
  );

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    return mergeRegister(
      editor.registerCommand(
        KEY_DOWN_COMMAND,
        (event: KeyboardEvent) => {
          if (!isOpen || filteredItems.length === 0) return false;

          switch (event.key) {
            case 'ArrowDown':
              event.preventDefault();
              setSelectedIndex((prev) => (prev < filteredItems.length - 1 ? prev + 1 : 0));
              return true;
            case 'ArrowUp':
              event.preventDefault();
              setSelectedIndex((prev) => (prev > 0 ? prev - 1 : filteredItems.length - 1));
              return true;
            case 'Tab':
            case 'Enter':
              event.preventDefault();
              event.stopPropagation();
              if (filteredItems[selectedIndex]) {
                handleSelect(filteredItems[selectedIndex]);
              }
              return true;
            case 'Escape':
              event.preventDefault();
              setIsOpen(false);
              return true;
            default:
              return false;
          }
        },
        COMMAND_PRIORITY_HIGH + 1
      ),
      editor.registerCommand(
        KEY_ESCAPE_COMMAND,
        () => {
          if (isOpen) {
            setIsOpen(false);
            return true;
          }
          return false;
        },
        COMMAND_PRIORITY_HIGH
      )
    );
  }, [editor, isOpen, filteredItems, selectedIndex, handleSelect]);

  return (
    <CompletionPopup
      items={filteredItems}
      selectedIndex={selectedIndex}
      isOpen={isOpen}
      anchorRect={anchorRect}
      onSelect={handleSelect}
    />
  );
}
```

**Step 2: Verify typecheck**

Run: `pnpm typecheck:web`
Expected: PASS

**Step 3: Commit**

```bash
git add src/renderer/src/components/chat/plugins/FileMentionPlugin.tsx
git commit -m "feat: add FileMentionPlugin for @ file mention completion"
```

---

### Task 8: Integrate plugins into LexicalMessageInput

**Files:**

- Modify: `src/renderer/src/components/chat/LexicalMessageInput.tsx`

**Step 1: Register MentionNode and add plugins**

Changes to `LexicalMessageInput.tsx`:

1. Import `MentionNode` and add it to `initialConfig.nodes`
2. Import and render `SlashCommandPlugin` and `FileMentionPlugin`
3. Update `EnterKeyPlugin` to use `$serializeToMarkedText()` instead of `$getRoot().getTextContent()`
4. Add `mention` to the Lexical theme

Key modifications:

- **Imports**: Add `MentionNode`, `SlashCommandPlugin`, `FileMentionPlugin`, `$serializeToMarkedText`
- **Theme**: Add `mention: 'inline'` to the theme object
- **Config**: Add `nodes: [MentionNode]` to `initialConfig`
- **EnterKeyPlugin**: Replace `const text = root.getTextContent().trim()` with `const text = $serializeToMarkedText().trim()`
- **Render**: Add `<SlashCommandPlugin />` and `<FileMentionPlugin />` alongside other plugins
- **OnChangePlugin**: Replace `root.getTextContent()` with `$serializeToMarkedText()` so `hasText` tracks mention nodes too

Full updated file:

```tsx
/**
 * LexicalMessageInput - Lexical-based plain text input for chat messages
 * Uses PlainTextPlugin for simple text editing with Enter to send
 * Supports / slash commands and @ file mentions via plugins
 */

import { useCallback, useEffect, useRef } from 'react';
import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { PlainTextPlugin } from '@lexical/react/LexicalPlainTextPlugin';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $getRoot, $createParagraphNode, KEY_ENTER_COMMAND, COMMAND_PRIORITY_HIGH } from 'lexical';
import { mergeRegister } from '@lexical/utils';
import { Button } from '../ui';
import { ArrowUp, Paperclip } from 'lucide-react';
import { MentionNode } from './nodes/MentionNode';
import { SlashCommandPlugin } from './plugins/SlashCommandPlugin';
import { FileMentionPlugin } from './plugins/FileMentionPlugin';
import { $serializeToMarkedText } from './utils/mention-serialization';

interface LexicalMessageInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

// Theme configuration for Lexical
const theme = {
  paragraph: 'mb-0',
  text: {
    base: 'text-text-primary'
  },
  mention: 'inline'
};

// Initial editor configuration
const initialConfig = {
  namespace: 'ChatInput',
  theme,
  nodes: [MentionNode],
  onError: (error: Error) => {
    console.error('Lexical error:', error);
  }
};

// Custom plugin to handle Enter key and extract content
function EnterKeyPlugin({
  onSend,
  disabled,
  onTextChange
}: {
  onSend: (message: string) => void;
  disabled: boolean;
  onTextChange: (text: string) => void;
}) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return mergeRegister(
      editor.registerCommand(
        KEY_ENTER_COMMAND,
        (event: KeyboardEvent) => {
          if (disabled) return true;

          // Shift+Enter = new line (let default behavior happen)
          if (event.shiftKey) {
            return false;
          }

          // Enter = send message
          event.preventDefault();

          editor.getEditorState().read(() => {
            const text = $serializeToMarkedText().trim();

            if (text) {
              onSend(text);
              // Clear editor after sending
              editor.update(() => {
                const root = $getRoot();
                root.clear();
                const paragraph = $createParagraphNode();
                root.append(paragraph);
                paragraph.select();
              });
              onTextChange('');
            }
          });

          return true;
        },
        COMMAND_PRIORITY_HIGH
      )
    );
  }, [editor, onSend, disabled, onTextChange]);

  return null;
}

// Clear editor plugin (expose method to parent)
function ClearEditorPlugin({ clearRef }: { clearRef: React.MutableRefObject<(() => void) | null> }) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    clearRef.current = () => {
      editor.update(() => {
        const root = $getRoot();
        root.clear();
        const paragraph = $createParagraphNode();
        root.append(paragraph);
        paragraph.select();
      });
    };
  }, [editor, clearRef]);

  return null;
}

export function LexicalMessageInput({
  onSend,
  disabled = false,
  placeholder = 'Ask Claude...'
}: LexicalMessageInputProps) {
  const hasText = useRef(false);
  const clearEditorRef = useRef<(() => void) | null>(null);

  const handleSend = useCallback(() => {
    if (disabled || !hasText.current) return;

    const event = new KeyboardEvent('keydown', {
      key: 'Enter',
      code: 'Enter',
      keyCode: 13,
      which: 13,
      bubbles: true,
      cancelable: true
    });
    document.querySelector('[contenteditable="true"]')?.dispatchEvent(event);
  }, [disabled]);

  const handleTextChange = useCallback((text: string) => {
    hasText.current = text.trim().length > 0;
  }, []);

  const handleFileUpload = useCallback(() => {
    // TODO: Implement file upload functionality
    console.log('File upload clicked');
  }, []);

  return (
    <LexicalComposer initialConfig={initialConfig}>
      <div className="relative rounded-2xl border border-border-strong bg-white shadow-sm transition-shadow focus-within:shadow-md focus-within:border-accent overflow-hidden">
        {/* File upload button */}
        <div className="absolute left-2 bottom-2 z-10">
          <Button
            onClick={handleFileUpload}
            disabled={disabled}
            variant="ghost"
            className="h-8 w-8 p-0 rounded-lg text-text-tertiary hover:text-text-primary hover:bg-gray-100"
          >
            <Paperclip className="h-4 w-4" />
          </Button>
        </div>

        {/* Lexical editor */}
        <div className="relative">
          <PlainTextPlugin
            contentEditable={
              <ContentEditable className="w-full min-h-[48px] max-h-[200px] overflow-y-auto border-none bg-transparent py-4 pl-12 pr-12 text-text-primary placeholder-text-tertiary focus:outline-none text-base resize-none" />
            }
            placeholder={
              <div className="absolute top-4 left-12 text-text-tertiary pointer-events-none select-none">
                {placeholder}
              </div>
            }
            ErrorBoundary={() => <div>Error loading editor</div>}
          />
        </div>

        {/* Send button */}
        <div className="absolute right-2 bottom-2">
          <Button
            onClick={handleSend}
            disabled={disabled || !hasText.current}
            className={`h-8 w-8 p-0 rounded-lg transition-colors flex items-center justify-center ${
              !hasText.current
                ? 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                : 'bg-accent text-white hover:bg-accent-hover shadow-sm'
            }`}
          >
            {disabled ? (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
            ) : (
              <ArrowUp className="h-4 w-4" />
            )}
          </Button>
        </div>

        {/* Plugins */}
        <HistoryPlugin />
        <OnChangePlugin
          onChange={(editorState) => {
            editorState.read(() => {
              const text = $serializeToMarkedText();
              handleTextChange(text);
            });
          }}
        />
        <EnterKeyPlugin onSend={onSend} disabled={disabled} onTextChange={handleTextChange} />
        <ClearEditorPlugin clearRef={clearEditorRef} />
        <SlashCommandPlugin />
        <FileMentionPlugin />
      </div>
    </LexicalComposer>
  );
}
```

**Step 2: Verify typecheck**

Run: `pnpm typecheck:web`
Expected: PASS

**Step 3: Commit**

```bash
git add src/renderer/src/components/chat/LexicalMessageInput.tsx
git commit -m "feat: integrate MentionNode and plugins into LexicalMessageInput"
```

---

### Task 9: Update ChatInterface for mention rendering

**Files:**

- Modify: `src/renderer/src/components/ChatInterface.tsx`

**Step 1: Update user message rendering**

In `MessageBubble`, replace the plain text rendering for user messages with `parseMentions()` + `MentionBadge` rendering.

Changes:

1. Import `parseMentions` from `./chat/utils/mention-serialization`
2. Import `MentionBadge` from `./chat/MentionBadge`
3. In the user message section of `MessageBubble`, replace the plain text `<div>` with segmented rendering

Replace the user message block (around lines 172-177):

```tsx
// OLD:
{isUser ? (
  <div className="text-base leading-relaxed whitespace-pre-wrap">
    {blocks
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join(' ')}
  </div>
) : (
```

```tsx
// NEW:
{isUser ? (
  <div className="text-base leading-relaxed whitespace-pre-wrap">
    {blocks
      .filter((block) => block.type === 'text')
      .map((block, blockIndex) => (
        <span key={blockIndex}>
          {parseMentions(block.text).map((segment, i) =>
            segment.type === 'text' ? (
              <span key={i}>{segment.content}</span>
            ) : (
              <MentionBadge key={i} type={segment.mentionType} name={segment.name} />
            )
          )}
        </span>
      ))}
  </div>
) : (
```

**Step 2: Verify typecheck**

Run: `pnpm typecheck:web`
Expected: PASS

**Step 3: Commit**

```bash
git add src/renderer/src/components/ChatInterface.tsx
git commit -m "feat: render mention badges in user message bubbles"
```

---

### Task 10: Update backend chat-handler for mention resolution

**Files:**

- Modify: `src/main/ipc/chat-handler.ts`

**Step 1: Add mention resolution**

Before sending the message to `claudeService.sendMessage()`, parse the marked-up string and resolve mention references. The original marked-up string is saved to the database; the resolved string is sent to Claude.

Create a helper function in chat-handler.ts that resolves mentions:

```typescript
import { SkillsService } from '../services/skills-service';
import { CommandsService } from '../services/commands-service';

/**
 * Resolve mention markers in a message string.
 * [/command:name] -> resolves command content
 * [/skill:name] -> resolves skill content
 * [@file:path] -> transforms to file reference
 */
async function resolveMentions(
  message: string,
  skillsService: SkillsService,
  commandsService: CommandsService
): Promise<string> {
  const mentionRegex = /\[\/(command|skill):([^\]]+)\]|\[@file:([^\]]+)\]/g;
  let resolved = message;
  const matches = [...message.matchAll(mentionRegex)];

  // Process in reverse order to preserve indices
  for (let i = matches.length - 1; i >= 0; i--) {
    const match = matches[i];
    const start = match.index!;
    const end = start + match[0].length;
    let replacement = match[0]; // fallback to original

    try {
      if (match[1] === 'command' && match[2]) {
        const result = await commandsService
          .getCommand(match[2], 'global')
          .catch(() => commandsService.getCommand(match[2], 'workspace'));
        replacement = `[Command: ${match[2]}]\n\`\`\`\n${result.content}\n\`\`\``;
      } else if (match[1] === 'skill' && match[2]) {
        const skills = await skillsService.listSkills();
        const skill = skills.find((s) => s.name === match[2]);
        if (skill) {
          replacement = `[Skill: ${match[2]}]\n${skill.content}`;
        }
      } else if (match[3]) {
        replacement = `(See file: ${match[3]})`;
      }
    } catch (error) {
      console.error(`Failed to resolve mention ${match[0]}:`, error);
    }

    resolved = resolved.slice(0, start) + replacement + resolved.slice(end);
  }

  return resolved;
}
```

Then update the `CHAT_SEND` handler to:

1. Accept `skillsService` and `commandsService` in `registerChatHandlers` params
2. Call `resolveMentions()` to get the resolved message
3. Send the resolved message to `claudeService.sendMessage()`
4. Save the original (marked-up) message to the database

The `registerChatHandlers` function signature changes:

```typescript
export function registerChatHandlers(
  _win: BrowserWindow,
  claudeService: ClaudeService,
  dbService: DatabaseService,
  skillsService: SkillsService,
  commandsService: CommandsService
);
```

Inside the handler:

```typescript
// Resolve mentions for Claude
const resolvedMessage = await resolveMentions(message, skillsService, commandsService);

// Send resolved message to Claude
await claudeService.sendMessage(sessionId, resolvedMessage, files, sdkSessionId);

// Save original (with markers) to database
await dbService.createMessage({
  id: randomUUID(),
  sessionId,
  role: 'user',
  content: JSON.stringify([{ type: 'text', text: message }]),
  createdAt: new Date()
});
```

**Step 2: Update the call site in main/index.ts**

Find where `registerChatHandlers` is called and pass `skillsService` and `commandsService` as additional arguments.

**Step 3: Verify typecheck**

Run: `pnpm typecheck:node`
Expected: PASS

**Step 4: Commit**

```bash
git add src/main/ipc/chat-handler.ts src/main/index.ts
git commit -m "feat: resolve mention markers in chat-handler before sending to Claude"
```

---

### Task 11: Final verification

**Step 1: Full typecheck**

Run: `pnpm typecheck`
Expected: PASS for both node and web

**Step 2: Lint**

Run: `pnpm lint`
Expected: No new errors

**Step 3: Format**

Run: `pnpm format`

**Step 4: Final commit (if format changed files)**

```bash
git add -A
git commit -m "style: format mention system files"
```

---

## File Summary

| Task | File                                                              | Action                   |
| ---- | ----------------------------------------------------------------- | ------------------------ |
| 1    | `package.json`                                                    | Add `@floating-ui/react` |
| 2    | `src/renderer/src/components/chat/nodes/MentionNode.tsx`          | Create                   |
| 3    | `src/renderer/src/components/chat/MentionBadge.tsx`               | Create                   |
| 4    | `src/renderer/src/components/chat/utils/mention-serialization.ts` | Create                   |
| 5    | `src/renderer/src/components/chat/plugins/CompletionPopup.tsx`    | Create                   |
| 6    | `src/renderer/src/components/chat/plugins/SlashCommandPlugin.tsx` | Create                   |
| 7    | `src/renderer/src/components/chat/plugins/FileMentionPlugin.tsx`  | Create                   |
| 8    | `src/renderer/src/components/chat/LexicalMessageInput.tsx`        | Modify                   |
| 9    | `src/renderer/src/components/ChatInterface.tsx`                   | Modify                   |
| 10   | `src/main/ipc/chat-handler.ts` + `src/main/index.ts`              | Modify                   |
| 11   | All files                                                         | Verify + format          |
