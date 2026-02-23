/**
 * Disk Store - Manages Disk state in the renderer process
 * Uses Zustand for state management and calls window.api for IPC
 */

import { create } from 'zustand';

import type { DiskDefinition, Skill, MCPServerConfig } from '../../../shared/types';

interface DiskStore {
  // State
  disks: DiskDefinition[];
  currentDisk: DiskDefinition | null;
  isLoading: boolean;

  // Pool state
  poolSkills: Skill[];
  poolCommands: Array<{ name: string; path: string }>;
  poolMCPServers: Record<string, MCPServerConfig>;

  // Actions
  loadDisks: () => Promise<void>;
  loadCurrentDisk: () => Promise<void>;
  switchDisk: (diskId: string) => Promise<void>;
  createDisk: (input: Omit<DiskDefinition, 'id' | 'builtIn'>) => Promise<void>;
  updateDisk: (diskId: string, updates: Partial<DiskDefinition>) => Promise<void>;
  deleteDisk: (diskId: string) => Promise<void>;
  duplicateDisk: (diskId: string, newName: string) => Promise<void>;
  loadPoolResources: () => Promise<void>;
}

export const useDiskStore = create<DiskStore>((set) => ({
  disks: [],
  currentDisk: null,
  isLoading: false,
  poolSkills: [],
  poolCommands: [],
  poolMCPServers: {},

  loadDisks: async () => {
    try {
      const result = await window.api.disk.list();
      if (result.success && result.data) {
        set({ disks: result.data });
      }
    } catch (error) {
      console.error('Failed to load disks:', error);
    }
  },

  loadCurrentDisk: async () => {
    try {
      const result = await window.api.disk.getCurrent();
      if (result.success && result.data) {
        set({ currentDisk: result.data });
      }
    } catch (error) {
      console.error('Failed to load current disk:', error);
    }
  },

  switchDisk: async (diskId: string) => {
    set({ isLoading: true });
    try {
      const result = await window.api.disk.switch(diskId);
      if (result.success && result.data) {
        set({ currentDisk: result.data });
      }
    } catch (error) {
      console.error('Failed to switch disk:', error);
    } finally {
      set({ isLoading: false });
    }
  },

  createDisk: async (input) => {
    try {
      const result = await window.api.disk.create(input);
      if (result.success) {
        // Reload disk list
        const listResult = await window.api.disk.list();
        if (listResult.success && listResult.data) {
          set({ disks: listResult.data });
        }
      }
    } catch (error) {
      console.error('Failed to create disk:', error);
    }
  },

  updateDisk: async (diskId, updates) => {
    try {
      const result = await window.api.disk.update(diskId, updates);
      if (result.success) {
        const listResult = await window.api.disk.list();
        if (listResult.success && listResult.data) {
          set({ disks: listResult.data });
        }
        // If updating the current disk, refresh it
        const currentResult = await window.api.disk.getCurrent();
        if (currentResult.success && currentResult.data) {
          set({ currentDisk: currentResult.data });
        }
      }
    } catch (error) {
      console.error('Failed to update disk:', error);
    }
  },

  deleteDisk: async (diskId) => {
    try {
      const result = await window.api.disk.delete(diskId);
      if (result.success) {
        const listResult = await window.api.disk.list();
        if (listResult.success && listResult.data) {
          set({ disks: listResult.data });
        }
        // Refresh current disk (may have switched to default)
        const currentResult = await window.api.disk.getCurrent();
        if (currentResult.success && currentResult.data) {
          set({ currentDisk: currentResult.data });
        }
      }
    } catch (error) {
      console.error('Failed to delete disk:', error);
    }
  },

  duplicateDisk: async (diskId, newName) => {
    try {
      const result = await window.api.disk.duplicate(diskId, newName);
      if (result.success) {
        const listResult = await window.api.disk.list();
        if (listResult.success && listResult.data) {
          set({ disks: listResult.data });
        }
      }
    } catch (error) {
      console.error('Failed to duplicate disk:', error);
    }
  },

  loadPoolResources: async () => {
    try {
      const [skillsResult, commandsResult, mcpResult] = await Promise.all([
        window.api.disk.listPoolSkills(),
        window.api.disk.listPoolCommands(),
        window.api.disk.listPoolMCP()
      ]);

      set({
        poolSkills: skillsResult.success ? skillsResult.data || [] : [],
        poolCommands: commandsResult.success ? commandsResult.data || [] : [],
        poolMCPServers: mcpResult.success ? mcpResult.data || {} : {}
      });
    } catch (error) {
      console.error('Failed to load pool resources:', error);
    }
  }
}));

/**
 * Setup listener for disk-switched events from main process
 */
export function setupDiskSwitchedListener(): () => void {
  return window.api.disk.onSwitched((disk) => {
    useDiskStore.setState({ currentDisk: disk });
  });
}
