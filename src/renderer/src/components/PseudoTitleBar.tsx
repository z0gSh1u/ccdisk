/**
 * PseudoTitleBar Component - Draggable title bar for frameless window
 */

import { type ReactNode } from 'react';
import { cn } from '../lib/utils';

interface PseudoTitleBarProps {
  children?: ReactNode;
  className?: string;
}

export function PseudoTitleBar({ children, className }: PseudoTitleBarProps) {
  return (
    <div
      className={cn(
        'flex items-center border-b border-border-subtle bg-bg-primary',
        // Make the entire area draggable
        'select-none',
        className
      )}
      style={
        {
          WebkitAppRegion: 'drag'
        } as React.CSSProperties
      }
    >
      {children}
    </div>
  );
}

/**
 * Apply this inline style to interactive elements to prevent drag
 */
export const noDragStyle: React.CSSProperties = {
  WebkitAppRegion: 'no-drag'
} as React.CSSProperties;
