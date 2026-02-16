/**
 * MCP Store - Manages MCP server configurations
 * Uses Zustand for state management and calls window.api for IPC
 */

import { create } from 'zustand';
import type { MCPConfig, MCPServerConfig } from '../../../shared/types';

type Scope = 'global' | 'workspace';

interface MCPStore {
  // State
  scope: Scope;
  globalConfig: MCPConfig;
  workspaceConfig: MCPConfig;
  selectedServer: string | null;
  isEditing: boolean;

  // Computed - merged config (workspace overrides global)
  getMergedConfig: () => MCPConfig;

  // Actions
  setScope: (scope: Scope) => void;
  loadConfig: () => Promise<void>;
  addServer: (name: string, config: MCPServerConfig) => Promise<void>;
  updateServer: (name: string, config: MCPServerConfig) => Promise<void>;
  deleteServer: (name: string) => Promise<void>;
  selectServer: (name: string | null) => void;
  setIsEditing: (isEditing: boolean) => void;
}

export const useMCPStore = create<MCPStore>((set, get) => ({
  // Initial state
  scope: 'global',
  globalConfig: { mcpServers: {} },
  workspaceConfig: { mcpServers: {} },
  selectedServer: null,
  isEditing: false,

  // Get merged config (workspace overrides global)
  getMergedConfig: () => {
    const state = get();
    return {
      mcpServers: {
        ...state.globalConfig.mcpServers,
        ...state.workspaceConfig.mcpServers
      }
    };
  },

  // Set current scope
  setScope: (scope) => {
    set({ scope, selectedServer: null, isEditing: false });
  },

  // Load configs from both scopes
  loadConfig: async () => {
    try {
      const [globalResponse, workspaceResponse] = await Promise.all([
        window.api.mcp.getConfigByScope('global'),
        window.api.mcp.getConfigByScope('workspace')
      ]);

      const updates: Partial<MCPStore> = {};

      if (globalResponse.success && globalResponse.data) {
        updates.globalConfig = globalResponse.data;
      }

      if (workspaceResponse.success && workspaceResponse.data) {
        updates.workspaceConfig = workspaceResponse.data;
      }

      set(updates);
    } catch (error) {
      console.error('Failed to load MCP config:', error);
    }
  },

  // Add new server to current scope
  addServer: async (name, config) => {
    const { scope, globalConfig, workspaceConfig } = get();

    try {
      const currentConfig = scope === 'global' ? globalConfig : workspaceConfig;
      const updatedConfig: MCPConfig = {
        mcpServers: {
          ...currentConfig.mcpServers,
          [name]: config
        }
      };

      const response = await window.api.mcp.updateConfig(updatedConfig, scope);

      if (response.success) {
        if (scope === 'global') {
          set({ globalConfig: updatedConfig });
        } else {
          set({ workspaceConfig: updatedConfig });
        }
      } else {
        throw new Error(response.error || 'Failed to add server');
      }
    } catch (error) {
      console.error('Failed to add server:', error);
      throw error;
    }
  },

  // Update existing server in current scope
  updateServer: async (name, config) => {
    const { scope, globalConfig, workspaceConfig } = get();

    try {
      const currentConfig = scope === 'global' ? globalConfig : workspaceConfig;
      const updatedConfig: MCPConfig = {
        mcpServers: {
          ...currentConfig.mcpServers,
          [name]: config
        }
      };

      const response = await window.api.mcp.updateConfig(updatedConfig, scope);

      if (response.success) {
        if (scope === 'global') {
          set({ globalConfig: updatedConfig });
        } else {
          set({ workspaceConfig: updatedConfig });
        }
      } else {
        throw new Error(response.error || 'Failed to update server');
      }
    } catch (error) {
      console.error('Failed to update server:', error);
      throw error;
    }
  },

  // Delete server from current scope
  deleteServer: async (name) => {
    const { scope, globalConfig, workspaceConfig, selectedServer } = get();

    try {
      const currentConfig = scope === 'global' ? globalConfig : workspaceConfig;
      const { [name]: _removed, ...remainingServers } = currentConfig.mcpServers;
      const updatedConfig: MCPConfig = { mcpServers: remainingServers };

      const response = await window.api.mcp.updateConfig(updatedConfig, scope);

      if (response.success) {
        const updates: Partial<MCPStore> = {};

        if (scope === 'global') {
          updates.globalConfig = updatedConfig;
        } else {
          updates.workspaceConfig = updatedConfig;
        }

        // Clear selection if deleted server was selected
        if (selectedServer === name) {
          updates.selectedServer = null;
          updates.isEditing = false;
        }

        set(updates);
      } else {
        throw new Error(response.error || 'Failed to delete server');
      }
    } catch (error) {
      console.error('Failed to delete server:', error);
      throw error;
    }
  },

  // Select server for viewing/editing
  selectServer: (name) => {
    set({ selectedServer: name, isEditing: false });
  },

  // Toggle editing mode
  setIsEditing: (isEditing) => {
    set({ isEditing });
  }
}));
