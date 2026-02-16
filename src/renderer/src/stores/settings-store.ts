/**
 * Settings Store - Manages providers, skills, commands, and MCP configs
 * Uses Zustand for state management and calls window.api for IPC
 */

import { create } from 'zustand';
import type { Provider, Skill, Command, MCPConfig } from '../../../shared/types';

interface SettingsStore {
  // State - Providers
  providers: Provider[];
  activeProvider: Provider | null;

  // State - Claude Env
  claudeEnv: Record<string, string>;

  // State - Skills
  skills: Skill[];

  // State - Commands
  commands: Command[];

  // State - MCP Config
  mcpConfig: MCPConfig | null;

  // Actions - Providers
  loadProviders: () => Promise<void>;
  createProvider: (provider: Omit<Provider, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  updateProvider: (id: string, provider: Partial<Provider>) => Promise<void>;
  deleteProvider: (id: string) => Promise<void>;
  activateProvider: (id: string) => Promise<void>;

  // Actions - Claude Env
  loadClaudeEnv: () => Promise<Record<string, string>>;
  updateClaudeEnv: (envUpdates: Record<string, string>) => Promise<void>;

  // Actions - Skills
  loadSkills: () => Promise<void>;
  createSkill: (name: string, content: string, scope: 'global' | 'workspace') => Promise<void>;
  updateSkill: (name: string, content: string, scope: 'global' | 'workspace') => Promise<void>;
  deleteSkill: (name: string, scope: 'global' | 'workspace') => Promise<void>;

  // Actions - Commands
  loadCommands: () => Promise<void>;
  createCommand: (name: string, content: string, scope: 'global' | 'workspace') => Promise<void>;
  deleteCommand: (name: string, scope: 'global' | 'workspace') => Promise<void>;

  // Actions - MCP Config
  loadMCPConfig: (scope: 'global' | 'workspace') => Promise<void>;
  updateMCPConfig: (config: MCPConfig, scope: 'global' | 'workspace') => Promise<void>;
}

export const useSettingsStore = create<SettingsStore>((set) => ({
  // Initial state
  providers: [],
  activeProvider: null,
  claudeEnv: {},
  skills: [],
  commands: [],
  mcpConfig: null,

  // Load providers
  loadProviders: async () => {
    try {
      const response = await window.api.settings.getProviders();
      if (response.success && response.data) {
        set({ providers: response.data });

        // Load active provider
        const activeResponse = await window.api.settings.getActiveProvider();
        if (activeResponse.success && activeResponse.data) {
          set({ activeProvider: activeResponse.data });
        }
      }
    } catch (error) {
      console.error('Failed to load providers:', error);
    }
  },

  // Create provider
  createProvider: async (provider) => {
    try {
      const response = await window.api.settings.createProvider(provider);
      if (response.success && response.data) {
        set((state) => ({ providers: [...state.providers, response.data!] }));
      }
    } catch (error) {
      console.error('Failed to create provider:', error);
      throw error;
    }
  },

  // Update provider
  updateProvider: async (id, provider) => {
    try {
      const response = await window.api.settings.updateProvider(id, provider);
      if (response.success) {
        set((state) => ({
          providers: state.providers.map((p) => (p.id === id ? { ...p, ...provider } : p))
        }));
      }
    } catch (error) {
      console.error('Failed to update provider:', error);
      throw error;
    }
  },

  // Delete provider
  deleteProvider: async (id) => {
    try {
      const response = await window.api.settings.deleteProvider(id);
      if (response.success) {
        set((state) => ({
          providers: state.providers.filter((p) => p.id !== id),
          activeProvider: state.activeProvider?.id === id ? null : state.activeProvider
        }));
      }
    } catch (error) {
      console.error('Failed to delete provider:', error);
      throw error;
    }
  },

  // Activate provider
  activateProvider: async (id) => {
    try {
      const response = await window.api.settings.activateProvider(id);
      if (response.success) {
        set((state) => {
          const p = state.providers.find((p) => p.id === id);
          if (p) {
            return {
              providers: state.providers.map((p) => ({ ...p, isActive: p.id === id })),
              activeProvider: p
            };
          }
          return state;
        });
      }
    } catch (error) {
      console.error('Failed to activate provider:', error);
      throw error;
    }
  },

  // Load Claude env
  loadClaudeEnv: async () => {
    try {
      const response = await window.api.settings.getClaudeEnv();
      if (response.success && response.data) {
        set({ claudeEnv: response.data });
        return response.data;
      }
      return {};
    } catch (error) {
      console.error('Failed to load Claude env:', error);
      return {};
    }
  },

  // Update Claude env
  updateClaudeEnv: async (envUpdates) => {
    try {
      const response = await window.api.settings.updateClaudeEnv(envUpdates);
      if (response.success) {
        set({ claudeEnv: envUpdates });
      }
    } catch (error) {
      console.error('Failed to update Claude env:', error);
      throw error;
    }
  },

  // Load skills
  loadSkills: async () => {
    try {
      const response = await window.api.skills.list();
      if (response.success && response.data) {
        set({ skills: response.data });
      }
    } catch (error) {
      console.error('Failed to load skills:', error);
    }
  },

  // Create skill
  createSkill: async (name, content, scope) => {
    try {
      const response = await window.api.skills.create(name, content, scope);
      if (response.success) {
        // Reload skills
        const listResponse = await window.api.skills.list();
        if (listResponse.success && listResponse.data) {
          set({ skills: listResponse.data });
        }
      }
    } catch (error) {
      console.error('Failed to create skill:', error);
      throw error;
    }
  },

  // Update skill
  updateSkill: async (name, content, scope) => {
    try {
      const response = await window.api.skills.update(name, content, scope);
      if (response.success) {
        // Reload skills
        const listResponse = await window.api.skills.list();
        if (listResponse.success && listResponse.data) {
          set({ skills: listResponse.data });
        }
      }
    } catch (error) {
      console.error('Failed to update skill:', error);
      throw error;
    }
  },

  // Delete skill
  deleteSkill: async (name, scope) => {
    try {
      const response = await window.api.skills.delete(name, scope);
      if (response.success) {
        set((state) => ({
          skills: state.skills.filter((s) => s.name !== name || s.scope !== scope)
        }));
      }
    } catch (error) {
      console.error('Failed to delete skill:', error);
      throw error;
    }
  },

  // Load commands
  loadCommands: async () => {
    try {
      const response = await window.api.commands.list();
      if (response.success && response.data) {
        set({ commands: response.data });
      }
    } catch (error) {
      console.error('Failed to load commands:', error);
    }
  },

  // Create command
  createCommand: async (name, content, scope) => {
    try {
      const response = await window.api.commands.create(name, content, scope);
      if (response.success) {
        // Reload commands
        const listResponse = await window.api.commands.list();
        if (listResponse.success && listResponse.data) {
          set({ commands: listResponse.data });
        }
      }
    } catch (error) {
      console.error('Failed to create command:', error);
      throw error;
    }
  },

  // Delete command
  deleteCommand: async (name, scope) => {
    try {
      const response = await window.api.commands.delete(name, scope);
      if (response.success) {
        set((state) => ({
          commands: state.commands.filter((c) => c.name !== name || c.scope !== scope)
        }));
      }
    } catch (error) {
      console.error('Failed to delete command:', error);
      throw error;
    }
  },

  // Load MCP config
  loadMCPConfig: async (scope) => {
    try {
      const response = await window.api.mcp.getConfigByScope(scope);
      if (response.success && response.data) {
        set({ mcpConfig: response.data });
      }
    } catch (error) {
      console.error('Failed to load MCP config:', error);
    }
  },

  // Update MCP config
  updateMCPConfig: async (config, scope) => {
    try {
      const response = await window.api.mcp.updateConfig(config, scope);
      if (response.success) {
        set({ mcpConfig: config });
      }
    } catch (error) {
      console.error('Failed to update MCP config:', error);
      throw error;
    }
  }
}));
