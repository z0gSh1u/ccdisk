/**
 * MCP Manager Component - Manages MCP server configurations
 * Allows users to add, edit, and delete MCP servers in global or workspace scope
 */

import { useEffect, useState } from 'react'
import { useMCPStore } from '../../stores/mcp-store'
import { Tabs, TabsList, TabsTrigger } from '../ui/Tabs'
import { Button } from '../ui/Button'
import type { MCPServerConfig } from '../../../../shared/types'
import { ServerList } from './ServerList'
import { ServerEditor } from './ServerEditor'

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
    deleteServer
  } = useMCPStore()

  const [isAddingNew, setIsAddingNew] = useState(false)

  // Load config on mount
  useEffect(() => {
    loadConfig()
  }, [loadConfig])

  // Get current scope's config
  const currentConfig = scope === 'global' ? globalConfig : workspaceConfig
  const servers = Object.entries(currentConfig.mcpServers)

  const handleAddNew = () => {
    selectServer(null)
    setIsAddingNew(true)
    setIsEditing(true)
  }

  const handleCancelAdd = () => {
    setIsAddingNew(false)
    setIsEditing(false)
  }

  const handleSaveNew = async (name: string, config: MCPServerConfig) => {
    try {
      await addServer(name, config)
      setIsAddingNew(false)
      setIsEditing(false)
      selectServer(name)
    } catch (error) {
      console.error('Failed to add server:', error)
      throw error
    }
  }

  const handleEdit = (serverName: string) => {
    selectServer(serverName)
    setIsAddingNew(false)
    setIsEditing(true)
  }

  const handleSaveEdit = async (name: string, config: MCPServerConfig) => {
    try {
      await updateServer(name, config)
      setIsEditing(false)
    } catch (error) {
      console.error('Failed to update server:', error)
      throw error
    }
  }

  const handleCancelEdit = () => {
    setIsEditing(false)
  }

  const handleDelete = async (serverName: string) => {
    if (window.confirm(`Are you sure you want to delete server "${serverName}"?`)) {
      try {
        await deleteServer(serverName)
      } catch (error) {
        console.error('Failed to delete server:', error)
      }
    }
  }

  const handleViewDetails = (serverName: string) => {
    selectServer(serverName)
    setIsAddingNew(false)
    setIsEditing(false)
  }

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
            <Button
              onClick={handleAddNew}
              variant="primary"
              className="w-full mb-4"
              disabled={isEditing}
            >
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
    </div>
  )
}
