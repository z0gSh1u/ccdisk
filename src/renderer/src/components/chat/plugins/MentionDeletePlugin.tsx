/**
 * MentionDeletePlugin - Handles backspace/delete for MentionNode tokens
 * Ensures atomic removal of inline mention badges
 */

import { useEffect } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  $getSelection,
  $isRangeSelection,
  $isNodeSelection,
  $isTextNode,
  $isElementNode,
  KEY_BACKSPACE_COMMAND,
  KEY_DELETE_COMMAND,
  COMMAND_PRIORITY_HIGH
} from 'lexical';
import { mergeRegister } from '@lexical/utils';
import { $isMentionNode } from '../nodes/MentionNode';

export function MentionDeletePlugin(): null {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    const handleDelete = (isBackward: boolean): boolean => {
      const selection = $getSelection();
      if (!selection) return false;

      if ($isNodeSelection(selection)) {
        const nodes = selection.getNodes();
        let removed = false;
        for (const node of nodes) {
          if ($isMentionNode(node)) {
            node.remove();
            removed = true;
          }
        }
        return removed;
      }

      if (!$isRangeSelection(selection) || !selection.isCollapsed()) return false;

      const anchor = selection.anchor;
      const anchorNode = anchor.getNode();

      if ($isTextNode(anchorNode)) {
        const offset = anchor.offset;
        if (isBackward && offset === 0) {
          const prev = anchorNode.getPreviousSibling();
          if (prev && $isMentionNode(prev)) {
            prev.remove();
            return true;
          }
        }

        if (!isBackward && offset === anchorNode.getTextContentSize()) {
          const next = anchorNode.getNextSibling();
          if (next && $isMentionNode(next)) {
            next.remove();
            return true;
          }
        }

        return false;
      }

      if ($isElementNode(anchorNode)) {
        const offset = anchor.offset;
        const children = anchorNode.getChildren();

        if (isBackward && offset > 0) {
          const prev = children[offset - 1];
          if (prev && $isMentionNode(prev)) {
            prev.remove();
            return true;
          }
        }

        if (!isBackward && offset < children.length) {
          const next = children[offset];
          if (next && $isMentionNode(next)) {
            next.remove();
            return true;
          }
        }
      }

      return false;
    };

    return mergeRegister(
      editor.registerCommand(KEY_BACKSPACE_COMMAND, () => handleDelete(true), COMMAND_PRIORITY_HIGH),
      editor.registerCommand(KEY_DELETE_COMMAND, () => handleDelete(false), COMMAND_PRIORITY_HIGH)
    );
  }, [editor]);

  return null;
}
