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
