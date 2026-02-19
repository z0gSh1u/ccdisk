/**
 * FileMentionPlugin - Detects @ at any position
 * Shows workspace file tree in a completion popup
 * Inserts MentionNode on selection
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { JSX } from 'react';
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
 * Flatten a FileNode tree into a list of paths
 */
function flattenFileTree(nodes: FileNode[]): Array<{ path: string; type: 'file' | 'directory' }> {
  const result: Array<{ path: string; type: 'file' | 'directory' }> = [];
  for (const node of nodes) {
    result.push({ path: node.path, type: node.type });
    if (node.children) {
      result.push(...flattenFileTree(node.children));
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

export function FileMentionPlugin(): JSX.Element | null {
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

  // Clamp selectedIndex at render time (avoid setState in useEffect)
  const clampedSelectedIndex = Math.min(selectedIndex, Math.max(0, filteredItems.length - 1));

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
              if (filteredItems[clampedSelectedIndex]) {
                handleSelect(filteredItems[clampedSelectedIndex]);
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
        4 // COMMAND_PRIORITY_CRITICAL (COMMAND_PRIORITY_HIGH + 1)
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
  }, [editor, isOpen, filteredItems, clampedSelectedIndex, handleSelect]);

  return (
    <CompletionPopup
      items={filteredItems}
      selectedIndex={clampedSelectedIndex}
      isOpen={isOpen}
      anchorRect={anchorRect}
      onSelect={handleSelect}
    />
  );
}
