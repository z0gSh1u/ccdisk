/**
 * TypeaheadPlugin - Handles slash commands and @ file mentions
 * Detects trigger characters and shows suggestion menu
 */

import { useCallback, useEffect, useState } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $getSelection, $isRangeSelection, TextNode } from 'lexical';
import { SuggestionMenu, SuggestionItem } from './SuggestionMenu';
import { useSkillsStore } from '../../stores/skills-store';
import { useWorkspaceStore } from '../../stores/workspace-store';
import type { FileNode } from '../../../../shared/types';

interface TypeaheadState {
  trigger: '/' | '@' | null;
  queryString: string;
  position: { top: number; left: number } | null;
}

export function TypeaheadPlugin() {
  const [editor] = useLexicalComposerContext();
  const [typeaheadState, setTypeaheadState] = useState<TypeaheadState>({
    trigger: null,
    queryString: '',
    position: null
  });
  const [selectedIndex, setSelectedIndex] = useState(0);

  const skills = useSkillsStore((state) => state.skills);
  const fileTree = useWorkspaceStore((state) => state.fileTree);

  // Get suggestions based on trigger and query
  const getSuggestions = useCallback(
    (trigger: '/' | '@', query: string): SuggestionItem[] => {
      if (trigger === '/') {
        // Filter skills by query
        return skills
          .filter((skill) => skill.name.toLowerCase().includes(query.toLowerCase()))
          .map((skill) => ({
            id: skill.name,
            label: `/${skill.name}`,
            description: `${skill.scope} skill`,
            type: 'skill' as const
          }))
          .slice(0, 10);
      } else if (trigger === '@') {
        // Flatten file tree and filter by query
        const flattenFiles = (nodes: FileNode[], prefix = ''): SuggestionItem[] => {
          const items: SuggestionItem[] = [];
          for (const node of nodes) {
            const fullPath = prefix + node.name;
            if (fullPath.toLowerCase().includes(query.toLowerCase())) {
              items.push({
                id: node.path,
                label: fullPath,
                description: node.path,
                type: node.type === 'file' ? 'file' : 'directory'
              });
            }
            if (node.children && node.type === 'directory') {
              items.push(...flattenFiles(node.children, fullPath + '/'));
            }
          }
          return items;
        };
        return flattenFiles(fileTree).slice(0, 10);
      }
      return [];
    },
    [skills, fileTree]
  );

  const suggestions = typeaheadState.trigger ? getSuggestions(typeaheadState.trigger, typeaheadState.queryString) : [];

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!typeaheadState.trigger || suggestions.length === 0) return;

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % suggestions.length);
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + suggestions.length) % suggestions.length);
      } else if (event.key === 'Enter' || event.key === 'Tab') {
        if (suggestions[selectedIndex]) {
          event.preventDefault();
          handleSelectSuggestion(suggestions[selectedIndex]);
        }
      } else if (event.key === 'Escape') {
        event.preventDefault();
        closeTypeahead();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [typeaheadState.trigger, suggestions, selectedIndex]);

  // Close typeahead menu
  const closeTypeahead = useCallback(() => {
    setTypeaheadState({ trigger: null, queryString: '', position: null });
    setSelectedIndex(0);
  }, []);

  // Handle suggestion selection
  const handleSelectSuggestion = useCallback(
    (item: SuggestionItem) => {
      if (!typeaheadState.trigger) return;

      editor.update(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) return;

        const node = selection.anchor.getNode();
        if (!(node instanceof TextNode)) return;

        const text = node.getTextContent();
        const triggerIndex = text.lastIndexOf(typeaheadState.trigger!);

        if (triggerIndex === -1) return;

        // Replace from trigger to current position with selected item
        const beforeTrigger = text.substring(0, triggerIndex);
        const afterCursor = text.substring(selection.anchor.offset);

        let replacement = '';
        if (typeaheadState.trigger === '/') {
          // For skills, just insert the name without the slash
          replacement = item.label.substring(1) + ' ';
        } else if (typeaheadState.trigger === '@') {
          // For files, insert the path
          replacement = '@' + item.label + ' ';
        }

        node.setTextContent(beforeTrigger + replacement + afterCursor);

        // Move cursor to end of replacement
        const newOffset = beforeTrigger.length + replacement.length;
        selection.anchor.set(node.getKey(), newOffset, 'text');
        selection.focus.set(node.getKey(), newOffset, 'text');
      });

      closeTypeahead();
    },
    [editor, typeaheadState.trigger, closeTypeahead]
  );

  // Monitor editor changes to detect triggers
  useEffect(() => {
    return editor.registerUpdateListener(({ editorState }) => {
      editorState.read(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) {
          closeTypeahead();
          return;
        }

        const node = selection.anchor.getNode();
        if (!(node instanceof TextNode)) {
          closeTypeahead();
          return;
        }

        const text = node.getTextContent();
        const cursorOffset = selection.anchor.offset;

        // Find the last trigger character before cursor
        const textBeforeCursor = text.substring(0, cursorOffset);
        const slashIndex = textBeforeCursor.lastIndexOf('/');
        const atIndex = textBeforeCursor.lastIndexOf('@');

        let trigger: '/' | '@' | null = null;
        let triggerIndex = -1;

        if (slashIndex > atIndex && slashIndex !== -1) {
          // Check if there's a space before slash or it's at the start
          const charBeforeSlash = slashIndex > 0 ? text[slashIndex - 1] : ' ';
          if (charBeforeSlash === ' ' || slashIndex === 0) {
            trigger = '/';
            triggerIndex = slashIndex;
          }
        } else if (atIndex !== -1 && atIndex > slashIndex) {
          // Check if there's a space before @ or it's at the start
          const charBeforeAt = atIndex > 0 ? text[atIndex - 1] : ' ';
          if (charBeforeAt === ' ' || atIndex === 0) {
            trigger = '@';
            triggerIndex = atIndex;
          }
        }

        if (trigger && triggerIndex !== -1) {
          const queryString = text.substring(triggerIndex + 1, cursorOffset);

          // Check if there's a space in the query (which means we should close)
          if (queryString.includes(' ')) {
            closeTypeahead();
            return;
          }

          // Get cursor position for menu placement
          const domSelection = window.getSelection();
          if (domSelection && domSelection.rangeCount > 0) {
            const range = domSelection.getRangeAt(0);
            const rect = range.getBoundingClientRect();

            setTypeaheadState({
              trigger,
              queryString,
              position: {
                top: rect.bottom + 5,
                left: rect.left
              }
            });
            setSelectedIndex(0);
          }
        } else {
          closeTypeahead();
        }
      });
    });
  }, [editor, closeTypeahead]);

  if (!typeaheadState.position || suggestions.length === 0) {
    return null;
  }

  return (
    <SuggestionMenu
      items={suggestions}
      selectedIndex={selectedIndex}
      onSelect={handleSelectSuggestion}
      position={typeaheadState.position}
    />
  );
}
