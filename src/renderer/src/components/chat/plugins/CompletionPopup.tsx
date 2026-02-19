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
    ]
  });

  // Update the position reference whenever anchorRect changes
  useEffect(() => {
    if (anchorRect) {
      refs.setPositionReference({
        getBoundingClientRect: () => anchorRect
      });
    }
  }, [anchorRect, refs]);

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
