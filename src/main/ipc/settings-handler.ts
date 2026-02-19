/**
 * Settings IPC Handlers
 * Wires settings and provider management to database and config services
 */

import { ipcMain } from 'electron';
import { nanoid } from 'nanoid';
import { IPC_CHANNELS } from '../../shared/ipc-channels';
import type { IPCResponse, Provider } from '../../shared/types';
import { DatabaseService } from '../services/db-service';
import { ConfigService } from '../services/config-service';

export function registerSettingsHandlers(dbService: DatabaseService, configService: ConfigService) {
  // Get active provider
  ipcMain.handle(IPC_CHANNELS.SETTINGS_PROVIDERS_GET_ACTIVE, async () => {
    try {
      const provider = await dbService.getActiveProvider();
      return { success: true, data: provider } as IPCResponse;
    } catch (error) {
      console.error('SETTINGS_PROVIDERS_GET_ACTIVE error:', error);
      return { success: false, error: (error as Error).message } as IPCResponse;
    }
  });

  // List providers
  ipcMain.handle(IPC_CHANNELS.SETTINGS_PROVIDERS_LIST, async () => {
    try {
      const providers = await dbService.listProviders();
      return { success: true, data: providers } as IPCResponse;
    } catch (error) {
      console.error('SETTINGS_PROVIDERS_LIST error:', error);
      return { success: false, error: (error as Error).message } as IPCResponse;
    }
  });

  // Create provider
  ipcMain.handle(
    IPC_CHANNELS.SETTINGS_PROVIDERS_CREATE,
    async (_event, provider: Omit<Provider, 'id' | 'createdAt' | 'updatedAt'>) => {
      try {
        const newProvider = await dbService.createProvider({
          id: nanoid(),
          ...provider,
          createdAt: new Date(),
          updatedAt: new Date()
        });
        return { success: true, data: newProvider } as IPCResponse;
      } catch (error) {
        console.error('SETTINGS_PROVIDERS_CREATE error:', error);
        return { success: false, error: (error as Error).message } as IPCResponse;
      }
    }
  );

  // Update provider
  ipcMain.handle(IPC_CHANNELS.SETTINGS_PROVIDERS_UPDATE, async (_event, id: string, updates: Partial<Provider>) => {
    try {
      const provider = await dbService.updateProvider(id, {
        ...updates,
        updatedAt: new Date()
      });
      return { success: true, data: provider } as IPCResponse;
    } catch (error) {
      console.error('SETTINGS_PROVIDERS_UPDATE error:', error);
      return { success: false, error: (error as Error).message } as IPCResponse;
    }
  });

  // Delete provider
  ipcMain.handle(IPC_CHANNELS.SETTINGS_PROVIDERS_DELETE, async (_event, id: string) => {
    try {
      await dbService.deleteProvider(id);
      return { success: true } as IPCResponse;
    } catch (error) {
      console.error('SETTINGS_PROVIDERS_DELETE error:', error);
      return { success: false, error: (error as Error).message } as IPCResponse;
    }
  });

  // Activate provider
  ipcMain.handle(IPC_CHANNELS.SETTINGS_PROVIDERS_ACTIVATE, async (_event, id: string) => {
    try {
      await dbService.activateProvider(id);
      const provider = await dbService.getActiveProvider();
      if (provider) {
        await configService.syncProviderToFile(provider);
      }
      return { success: true, data: provider } as IPCResponse;
    } catch (error) {
      console.error('SETTINGS_PROVIDERS_ACTIVATE error:', error);
      return { success: false, error: (error as Error).message } as IPCResponse;
    }
  });

  // Sync settings to file
  ipcMain.handle(IPC_CHANNELS.SETTINGS_SYNC_TO_FILE, async () => {
    try {
      const provider = await dbService.getActiveProvider();
      if (provider) {
        await configService.syncProviderToFile(provider);
      }
      return { success: true } as IPCResponse;
    } catch (error) {
      console.error('SETTINGS_SYNC_TO_FILE error:', error);
      return { success: false, error: (error as Error).message } as IPCResponse;
    }
  });

  // Get Claude env variables from settings.json
  ipcMain.handle(IPC_CHANNELS.SETTINGS_GET_CLAUDE_ENV, async () => {
    try {
      const env = await configService.getClaudeEnv();
      return { success: true, data: env } as IPCResponse;
    } catch (error) {
      console.error('SETTINGS_GET_CLAUDE_ENV error:', error);
      return { success: false, error: (error as Error).message } as IPCResponse;
    }
  });

  // Update Claude env variables in settings.json
  ipcMain.handle(IPC_CHANNELS.SETTINGS_UPDATE_CLAUDE_ENV, async (_event, envUpdates: Record<string, string>) => {
    try {
      await configService.updateClaudeEnv(envUpdates);
      return { success: true } as IPCResponse;
    } catch (error) {
      console.error('SETTINGS_UPDATE_CLAUDE_ENV error:', error);
      return { success: false, error: (error as Error).message } as IPCResponse;
    }
  });

  // Get a setting by key
  ipcMain.handle(IPC_CHANNELS.SETTINGS_GET, async (_event, key: string) => {
    try {
      const value = await dbService.getSetting(key);
      return { success: true, data: value } as IPCResponse;
    } catch (error) {
      console.error('SETTINGS_GET error:', error);
      return { success: false, error: (error as Error).message } as IPCResponse;
    }
  });

  // Set a setting by key
  ipcMain.handle(IPC_CHANNELS.SETTINGS_SET, async (_event, key: string, value: string) => {
    try {
      await dbService.setSetting(key, value);
      return { success: true } as IPCResponse;
    } catch (error) {
      console.error('SETTINGS_SET error:', error);
      return { success: false, error: (error as Error).message } as IPCResponse;
    }
  });
}
