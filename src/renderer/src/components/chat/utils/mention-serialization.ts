/**
 * Mention serialization utilities
 * Converts between Lexical editor state and marked-up strings
 */

import type { LexicalNode, ElementNode } from 'lexical';
import { $getRoot, $isTextNode, $isLineBreakNode, $isElementNode } from 'lexical';
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
      const children = $isElementNode(node) ? (node as ElementNode).getChildren() : [];
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
