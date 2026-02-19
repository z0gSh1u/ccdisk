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

  isKeyboardSelectable(): true {
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
