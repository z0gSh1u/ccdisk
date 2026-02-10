/**
 * SuggestionMenu - Dropdown menu for slash commands and file mentions
 */

import { useEffect, useRef } from 'react'
import { Command, FileIcon, FolderIcon } from 'lucide-react'

export interface SuggestionItem {
  id: string
  label: string
  description?: string
  type: 'skill' | 'command' | 'file' | 'directory'
  icon?: React.ReactNode
}

interface SuggestionMenuProps {
  items: SuggestionItem[]
  selectedIndex: number
  onSelect: (item: SuggestionItem) => void
  position: { top: number; left: number }
}

export function SuggestionMenu({ items, selectedIndex, onSelect, position }: SuggestionMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const selectedElement = menuRef.current?.querySelector('[data-selected="true"]')
    if (selectedElement) {
      selectedElement.scrollIntoView({ block: 'nearest' })
    }
  }, [selectedIndex])

  if (items.length === 0) {
    return null
  }

  const getIcon = (item: SuggestionItem) => {
    if (item.icon) return item.icon

    switch (item.type) {
      case 'skill':
      case 'command':
        return <Command className="h-4 w-4" />
      case 'file':
        return <FileIcon className="h-4 w-4" />
      case 'directory':
        return <FolderIcon className="h-4 w-4" />
      default:
        return null
    }
  }

  return (
    <div
      ref={menuRef}
      className="absolute z-50 w-80 max-h-64 overflow-y-auto bg-white rounded-lg border border-border-strong shadow-lg"
      style={{
        top: `${position.top}px`,
        left: `${position.left}px`
      }}
    >
      <div className="py-1">
        {items.map((item, index) => (
          <button
            key={item.id}
            data-selected={index === selectedIndex}
            onClick={() => onSelect(item)}
            className={`w-full px-3 py-2 text-left flex items-start gap-3 transition-colors ${
              index === selectedIndex
                ? 'bg-accent bg-opacity-10 text-accent'
                : 'hover:bg-gray-50 text-text-primary'
            }`}
          >
            <div className="mt-0.5 flex-shrink-0">{getIcon(item)}</div>
            <div className="flex-1 min-w-0">
              <div className="font-medium truncate">{item.label}</div>
              {item.description && (
                <div className="text-xs text-text-tertiary truncate mt-0.5">
                  {item.description}
                </div>
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
