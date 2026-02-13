/**
 * SettingsDialog Component - Tabbed dialog for app settings
 */

import { useState } from 'react'

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/Tabs'
import { ClaudeConfigEditor } from './ClaudeConfigEditor'
import { MCPManager } from '../extensions/MCPManager'
import { SkillsCommandsManager } from './SkillsCommandsManager'

interface SettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const [activeTab, setActiveTab] = useState('claude-config')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-white max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="font-serif text-2xl">Settings</DialogTitle>
        </DialogHeader>

        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className="flex-1 flex flex-col overflow-hidden"
        >
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="claude-config">Claude Configuration</TabsTrigger>
            <TabsTrigger value="mcp">MCP Servers</TabsTrigger>
            <TabsTrigger value="skills-commands">Skills & Commands</TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-y-auto mt-4">
            <TabsContent value="claude-config" className="mt-0">
              <ClaudeConfigEditor />
            </TabsContent>

            <TabsContent value="mcp" className="mt-0">
              <MCPManager />
            </TabsContent>

            <TabsContent value="skills-commands" className="mt-0">
              <SkillsCommandsManager />
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
