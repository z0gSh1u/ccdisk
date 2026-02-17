/**
 * Collapsible Component - Reusable collapsible panel
 */

import * as React from 'react';

const CollapsibleContext = React.createContext<{
  open: boolean;
  setOpen: (open: boolean) => void;
} | null>(null);

interface CollapsibleProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
}

export function Collapsible({ open: controlledOpen, onOpenChange, children }: CollapsibleProps) {
  const [internalOpen, setInternalOpen] = React.useState(false);

  const open = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const setOpen = onOpenChange || setInternalOpen;

  return (
    <CollapsibleContext.Provider value={{ open, setOpen }}>
      <div>{children}</div>
    </CollapsibleContext.Provider>
  );
}

interface CollapsibleTriggerProps {
  children: React.ReactNode;
  className?: string;
  asChild?: boolean;
}

export function CollapsibleTrigger({ children, className, asChild }: CollapsibleTriggerProps) {
  const context = React.useContext(CollapsibleContext);
  if (!context) throw new Error('CollapsibleTrigger must be used within Collapsible');

  const handleClick = () => {
    context.setOpen(!context.open);
  };

  if (asChild && React.isValidElement(children)) {
    const childProps = children.props as any;
    return React.cloneElement(children as React.ReactElement<any>, {
      ...childProps,
      onClick: (e: React.MouseEvent) => {
        childProps.onClick?.(e);
        handleClick();
      },
      className: `${childProps.className || ''} ${className || ''}`
    });
  }

  return (
    <button onClick={handleClick} className={className}>
      {children}
    </button>
  );
}

interface CollapsibleContentProps {
  children: React.ReactNode;
  className?: string;
}

export function CollapsibleContent({ children, className }: CollapsibleContentProps) {
  const context = React.useContext(CollapsibleContext);
  if (!context) throw new Error('CollapsibleContent must be used within Collapsible');

  return (
    <div
      className={`overflow-hidden transition-all duration-200 ease-out ${
        context.open ? 'animate-collapsible-open' : 'animate-collapsible-close'
      } ${className || ''}`}
    >
      {children}
    </div>
  );
}
