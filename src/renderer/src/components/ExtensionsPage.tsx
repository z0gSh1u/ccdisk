/**
 * Extensions Page - Example integration of Skills, Commands, and MCP managers
 *
 * This demonstrates how to integrate the SkillsManager component into the app.
 * To use this in the main app, you would:
 *
 * 1. Add navigation to this page from the sidebar or toolbar
 * 2. Use a routing library (like react-router) to show this instead of ChatInterface
 * 3. Or use a tabbed interface to switch between Chat and Extensions
 *
 * Example integration in App.tsx:
 *
 * ```tsx
 * import { useState } from 'react'
 * import { ChatInterface } from './components/ChatInterface'
 * import { ExtensionsPage } from './components/ExtensionsPage'
 *
 * function App() {
 *   const [currentView, setCurrentView] = useState<'chat' | 'extensions'>('chat')
 *
 *   return (
 *     <MainLayout sidebar={<Sidebar onNavigate={setCurrentView} />}>
 *       {currentView === 'chat' ? <ChatInterface /> : <ExtensionsPage />}
 *     </MainLayout>
 *   )
 * }
 * ```
 */

import { useState } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from './ui/Tabs';
import { SkillsManager } from './extensions/SkillsManager';
import { CommandsManager } from './extensions/CommandsManager';
import { MCPManager } from './extensions/MCPManager';

export function ExtensionsPage() {
  const [activeTab, setActiveTab] = useState('skills');

  return (
    <div className="h-full flex flex-col bg-white">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
        <div className="border-b border-gray-200 px-4 pt-4">
          <TabsList>
            <TabsTrigger value="skills">Skills</TabsTrigger>
            <TabsTrigger value="commands">Commands</TabsTrigger>
            <TabsTrigger value="mcp">MCP Servers</TabsTrigger>
          </TabsList>
        </div>

        <div className="flex-1 overflow-hidden">
          <TabsContent value="skills" className="h-full">
            <SkillsManager />
          </TabsContent>

          <TabsContent value="commands" className="h-full">
            <CommandsManager />
          </TabsContent>

          <TabsContent value="mcp" className="h-full">
            <MCPManager />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
