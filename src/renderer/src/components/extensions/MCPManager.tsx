/**
 * MCP Manager Component - Manages MCP server configurations
 * Allows users to add, edit, and delete MCP servers in global or workspace scope
 */

import { useEffect } from 'react';

import { useMCPStore } from '../../stores/mcp-store';
import { Tabs, TabsList, TabsTrigger } from '../ui/Tabs';
import { ServerList } from './ServerList';
import { ServerEditor } from './ServerEditor';

export function MCPManager() {
  const { scope, setScope, loadConfig, globalConfig, workspaceConfig, selectedServer, selectServer } = useMCPStore();

  // Load config on mount
  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  // Get current scope's config
  const currentConfig = scope === 'global' ? globalConfig : workspaceConfig;
  const servers = Object.entries(currentConfig.mcpServers);

  const handleViewDetails = (serverName: string) => {
    selectServer(serverName);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="border-b border-gray-200 dark:border-gray-700 p-4">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">MCP Servers</h1>

        {/* Scope Selector */}
        <Tabs value={scope} onValueChange={(value) => setScope(value as 'global' | 'workspace')}>
          <TabsList>
            <TabsTrigger value="global">Global</TabsTrigger>
            <TabsTrigger value="workspace">Workspace</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden flex">
        {/* Server List */}
        <div className="w-80 border-r border-gray-200 dark:border-gray-700 overflow-y-auto">
          <div className="p-4">
            <ServerList servers={servers} selectedServer={selectedServer} onSelect={handleViewDetails} />
          </div>
        </div>

        {/* Server Editor / Details */}
        <div className="flex-1 overflow-y-auto p-6">
          {selectedServer ? (
            <ServerEditor
              mode="view"
              serverName={selectedServer}
              serverConfig={currentConfig.mcpServers[selectedServer]}
              onSave={async () => {}}
              onCancel={() => {}}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-gray-500">
              <div className="text-center">
                <p className="text-lg mb-2">No server selected</p>
                <p className="text-sm">Select a server from the list to view details</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
