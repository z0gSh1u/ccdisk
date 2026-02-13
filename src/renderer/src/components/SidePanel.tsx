/**
 * SidePanel - Slide-in panel from right side for settings and configurations
 */

import { useEffect } from 'react'
import { X } from 'lucide-react'
import { ClaudeConfigEditor } from './settings/ClaudeConfigEditor'
import { MCPManager } from './extensions/MCPManager'
import { SkillsCommandsManager } from './settings/SkillsCommandsManager'

export type PanelType = 'skills' | 'mcp' | 'claude'

interface SidePanelProps {
  isOpen: boolean
  panelType: PanelType | null
  onClose: () => void
}

const PANEL_TITLES: Record<PanelType, string> = {
  skills: 'Skills & Commands',
  mcp: 'MCP Servers',
  claude: 'Claude Configuration'
}

export function SidePanel({ isOpen, panelType, onClose }: SidePanelProps) {
  // ESC key handler
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen || !panelType) return null

  return (
    <div className="fixed inset-0 z-50">
      {/* Overlay - blocks all interactions with content below */}
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />

      {/* Panel - slides in from right */}
      <div className="absolute right-0 top-0 bottom-0 w-[480px] bg-white shadow-2xl flex flex-col">
        {/* Header */}
        <div className="shrink-0 flex items-center justify-between p-4 border-b border-border-subtle">
          <h2 className="text-lg font-semibold text-text-primary">{PANEL_TITLES[panelType]}</h2>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-bg-accent transition-colors"
            title="Close panel"
          >
            <X className="h-5 w-5 text-text-tertiary" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {panelType === 'skills' && <SkillsCommandsManager />}
          {panelType === 'mcp' && <MCPManager />}
          {panelType === 'claude' && <ClaudeConfigEditor />}
        </div>
      </div>
    </div>
  )
}
