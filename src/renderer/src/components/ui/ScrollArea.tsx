/**
 * ScrollArea Component - Custom scrollable container
 */

import { type ReactNode, forwardRef, type HTMLAttributes } from 'react';
import { cn } from '../../lib/utils';

export interface ScrollAreaProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

const ScrollArea = forwardRef<HTMLDivElement, ScrollAreaProps>(({ className, children, ...props }, ref) => {
  return (
    <div ref={ref} className={cn('overflow-auto', className)} {...props}>
      {children}
    </div>
  );
});

ScrollArea.displayName = 'ScrollArea';

export { ScrollArea };
