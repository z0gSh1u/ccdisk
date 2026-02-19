/**
 * SlashCommandPlugin - Detects / at start of input
 * Shows Commands and Skills in a completion popup
 * Inserts MentionNode on selection
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { JSX } from 'react';
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
import { getCaretRect } from '../utils/caret-rect';

export function SlashCommandPlugin(): JSX.Element | null {
  const [editor] = useLexicalComposerContext();
  const { skills, loadSkills, setupSkillsWatcher } = useSkillsStore();
  const { commands, loadCommands, setupCommandsWatcher } = useCommandsStore();

  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const [commandPreviewMap, setCommandPreviewMap] = useState<Record<string, string>>({});

  const truncatePreview = useCallback((value: string | undefined) => {
    if (!value) return undefined;
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    if (trimmed.length <= 30) return trimmed;
    return `${trimmed.slice(0, 30)}…`;
  }, []);

  const getSkillDescription = useCallback(
    (skill: (typeof skills)[number]) => {
      if (skill.frontmatter && typeof skill.frontmatter.description === 'string') {
        return truncatePreview(skill.frontmatter.description);
      }
      return undefined;
    },
    [truncatePreview]
  );

  // Build completion items from skills + commands
  const allItems: CompletionItem[] = useMemo(
    () => [
      ...commands.map((cmd) => ({
        id: `command:${cmd.name}`,
        label: cmd.name,
        icon: <Terminal className="h-4 w-4 text-amber-600" />,
        type: 'command',
        commandName: cmd.name,
        commandScope: cmd.scope
      })),
      ...skills.map((skill) => ({
        id: `skill:${skill.name}`,
        label: skill.name,
        description: getSkillDescription(skill),
        icon: <BookOpen className="h-4 w-4 text-blue-600" />,
        type: 'skill'
      }))
    ],
    [commands, skills, getSkillDescription]
  );

  const stripCommandExtension = useCallback((name: string) => {
    return name.endsWith('.md') ? name.slice(0, -3) : name;
  }, []);

  // Filter items by query
  const filteredItems = useMemo(() => {
    const items = allItems
      .map((item) => (item.type === 'command' ? { ...item, label: stripCommandExtension(item.label) } : item))
      .map((item) => {
        if (item.type !== 'command') return item;
        const previewKey = item.commandScope && item.commandName ? `${item.commandScope}:${item.commandName}` : '';
        return {
          ...item,
          description: previewKey ? truncatePreview(commandPreviewMap[previewKey]) : undefined
        };
      });

    if (!query) return items;
    return items.filter((item) => item.label.toLowerCase().includes(query.toLowerCase()));
  }, [allItems, query, stripCommandExtension, commandPreviewMap, truncatePreview]);

  // Clamp selectedIndex at render time (avoid setState in useEffect)
  const clampedSelectedIndex = Math.min(selectedIndex, Math.max(0, filteredItems.length - 1));

  useEffect(() => {
    void loadSkills();
    void loadCommands();

    const cleanupSkills = setupSkillsWatcher();
    const cleanupCommands = setupCommandsWatcher();

    return () => {
      cleanupSkills();
      cleanupCommands();
    };
  }, [loadSkills, loadCommands, setupSkillsWatcher, setupCommandsWatcher]);

  useEffect(() => {
    if (!isOpen || filteredItems.length === 0) return;

    const nextMap: Record<string, string> = {};
    for (const item of filteredItems) {
      if (item.type !== 'command' || !item.commandName || !item.commandScope) continue;
      const key = `${item.commandScope}:${item.commandName}`;
      if (commandPreviewMap[key]) continue;
      nextMap[key] = '';
    }

    const keysToFetch = Object.keys(nextMap);
    if (keysToFetch.length === 0) return;

    let cancelled = false;

    const loadPreviews = async () => {
      const updates: Record<string, string> = {};
      await Promise.all(
        keysToFetch.map(async (key) => {
          const [scope, name] = key.split(':');
          try {
            const response = await window.api.commands.get(name, scope as 'global' | 'workspace');
            if (response.success && response.data?.content) {
              const firstLine = response.data.content.split(/\r?\n/)[0] || '';
              updates[key] = firstLine.trim();
            }
          } catch (error) {
            console.error('Failed to load command preview:', error);
          }
        })
      );

      if (cancelled || Object.keys(updates).length === 0) return;
      setCommandPreviewMap((prev) => ({ ...prev, ...updates }));
    };

    void loadPreviews();

    return () => {
      cancelled = true;
    };
  }, [isOpen, filteredItems, commandPreviewMap]);

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
