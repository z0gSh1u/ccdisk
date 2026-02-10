/**
 * SettingsDialog Component - Tabbed dialog for app settings
 */

import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/Tabs'
import { ProvidersManager } from './ProvidersManager'
import { MCPManager } from '../extensions/MCPManager'
import { SkillsManager } from '../extensions/SkillsManager'
import { CommandsManager } from '../extensions/CommandsManager'

interface SettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const [activeTab, setActiveTab] = useState('providers')

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
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="providers">Providers</TabsTrigger>
            <TabsTrigger value="mcp">MCP Servers</TabsTrigger>
            <TabsTrigger value="skills">Skills</TabsTrigger>
            <TabsTrigger value="commands">Commands</TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-y-auto mt-4">
            <TabsContent value="providers" className="mt-0">
              <ProvidersManager />
            </TabsContent>

            <TabsContent value="mcp" className="mt-0">
              <MCPManager />
            </TabsContent>

            <TabsContent value="skills" className="mt-0">
              <SkillsManager />
            </TabsContent>

            <TabsContent value="commands" className="mt-0">
              <CommandsManager />
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
