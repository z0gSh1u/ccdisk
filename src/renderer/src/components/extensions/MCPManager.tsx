/**
 * MCP Manager Component - Manages MCP server configurations
 * Allows users to add, edit, and delete MCP servers in global or workspace scope
 */

import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';

import { useMCPStore } from '../../stores/mcp-store';
import { useChatStore } from '../../stores/chat-store';
import { Tabs, TabsList, TabsTrigger } from '../ui/Tabs';
import { Button } from '../ui/Button';
import { ServerList } from './ServerList';
import { ServerEditor } from './ServerEditor';

import type { MCPServerConfig } from '../../../../shared/types';

export function MCPManager() {
  const {
    scope,
    setScope,
    loadConfig,
    globalConfig,
    workspaceConfig,
    selectedServer,
    selectServer,
    isEditing,
    setIsEditing,
    addServer,
    updateServer,
    deleteServer,
    liveStatuses,
    isStatusLoading,
    loadLiveStatus,
    reconnectServer,
    toggleServer
  } = useMCPStore();

  const currentSessionId = useChatStore((s) => s.currentSessionId);

  const [isAddingNew, setIsAddingNew] = useState(false);

  // Load config on mount
  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  // Load live status when session is active
  useEffect(() => {
    if (currentSessionId) {
      loadLiveStatus(currentSessionId);
    }
  }, [currentSessionId, loadLiveStatus]);

  // Get current scope's config
  const currentConfig = scope === 'global' ? globalConfig : workspaceConfig;
  const servers = Object.entries(currentConfig.mcpServers);

  const handleAddNew = () => {
    selectServer(null);
    setIsAddingNew(true);
    setIsEditing(true);
  };

  const handleCancelAdd = () => {
    setIsAddingNew(false);
    setIsEditing(false);
  };

  const handleSaveNew = async (name: string, config: MCPServerConfig) => {
    try {
      await addServer(name, config);
      setIsAddingNew(false);
      setIsEditing(false);
      selectServer(name);
    } catch (error) {
      console.error('Failed to add server:', error);
      throw error;
    }
  };

  const handleEdit = (serverName: string) => {
    selectServer(serverName);
    setIsAddingNew(false);
    setIsEditing(true);
  };

  const handleSaveEdit = async (name: string, config: MCPServerConfig) => {
    try {
      await updateServer(name, config);
      setIsEditing(false);
    } catch (error) {
      console.error('Failed to update server:', error);
      throw error;
    }
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
  };

  const handleDelete = async (serverName: string) => {
    if (window.confirm(`Are you sure you want to delete server "${serverName}"?`)) {
      try {
        await deleteServer(serverName);
      } catch (error) {
        console.error('Failed to delete server:', error);
      }
    }
  };

  const handleViewDetails = (serverName: string) => {
    selectServer(serverName);
    setIsAddingNew(false);
    setIsEditing(false);
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
            <Button onClick={handleAddNew} variant="primary" className="w-full mb-4" disabled={isEditing}>
              Add New Server
            </Button>

            <ServerList
              servers={servers}
              selectedServer={selectedServer}
              onSelect={handleViewDetails}
              onEdit={handleEdit}
              onDelete={handleDelete}
              isEditing={isEditing}
            />
          </div>
        </div>

        {/* Server Editor / Details */}
        <div className="flex-1 overflow-y-auto p-6">
          {isAddingNew ? (
            <ServerEditor mode="create" onSave={handleSaveNew} onCancel={handleCancelAdd} />
          ) : selectedServer ? (
            <ServerEditor
              mode={isEditing ? 'edit' : 'view'}
              serverName={selectedServer}
              serverConfig={currentConfig.mcpServers[selectedServer]}
              onSave={handleSaveEdit}
              onCancel={handleCancelEdit}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-gray-500">
              <div className="text-center">
                <p className="text-lg mb-2">No server selected</p>
                <p className="text-sm">Select a server from the list or add a new one</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Live Status Section */}
      {currentSessionId && (
        <div className="border-t border-gray-200 dark:border-gray-700 p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Live Status</h2>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => loadLiveStatus(currentSessionId)}
              disabled={isStatusLoading}
              className="h-7 w-7 p-0"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isStatusLoading ? 'animate-spin' : ''}`} />
            </Button>
          </div>

          {liveStatuses.length === 0 && !isStatusLoading && (
            <p className="text-xs text-gray-500">No MCP servers active in current session</p>
          )}

          {isStatusLoading && liveStatuses.length === 0 && <p className="text-xs text-gray-500">Loading status...</p>}

          <div className="space-y-2">
            {liveStatuses.map((server) => {
              const dotColor =
                server.status === 'connected'
                  ? 'bg-green-500'
                  : server.status === 'failed'
                    ? 'bg-red-500'
                    : server.status === 'disabled'
                      ? 'bg-gray-400'
                      : 'bg-yellow-500';

              return (
                <div
                  key={server.name}
                  className="flex items-center justify-between rounded-md border border-gray-200 px-3 py-2 dark:border-gray-700"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`h-2 w-2 shrink-0 rounded-full ${dotColor}`} />
                    <span className="truncate text-sm text-gray-900 dark:text-white">{server.name}</span>
                    <span className="text-xs text-gray-500">
                      {server.tools.length} tool{server.tools.length !== 1 ? 's' : ''}
                    </span>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    {server.status === 'failed' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 text-xs px-2"
                        onClick={() => reconnectServer(currentSessionId, server.name)}
                      >
                        Reconnect
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 text-xs px-2"
                      onClick={() => toggleServer(currentSessionId, server.name, server.status === 'disabled')}
                    >
                      {server.status === 'disabled' ? 'Enable' : 'Disable'}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
