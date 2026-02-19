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
  $createParagraphNode,
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
        4 // COMMAND_PRIORITY_CRITICAL - Higher than EnterKeyPlugin (COMMAND_PRIORITY_HIGH = 3)
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
