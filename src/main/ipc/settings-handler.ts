/**
 * Settings IPC Handlers  
 * Wires settings and provider management to database and config services
 */

import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '../../shared/ipc-channels'
import type { IPCResponse, Provider } from '../../shared/types'
import { DatabaseService } from '../services/db-service'
import { ConfigService } from '../services/config-service'

export function registerSettingsHandlers(
  dbService: DatabaseService,
  configService: ConfigService
) {
  // List providers
  ipcMain.handle(IPC_CHANNELS.SETTINGS_PROVIDERS_LIST, async () => {
    try {
      const providers = await dbService.listProviders()
      return { success: true, data: providers } as IPCResponse
    } catch (error) {
      console.error('SETTINGS_PROVIDERS_LIST error:', error)
      return { success: false, error: (error as Error).message } as IPCResponse
    }
  })

  // Create provider
  ipcMain.handle(IPC_CHANNELS.SETTINGS_PROVIDERS_CREATE, async (_event, provider: Omit<Provider, 'id' | 'createdAt' | 'updatedAt'>) => {
    try {
      const newProvider = await dbService.createProvider({
        ...provider,
        createdAt: new Date(),
        updatedAt: new Date()
      })
      return { success: true, data: newProvider } as IPCResponse
    } catch (error) {
      console.error('SETTINGS_PROVIDERS_CREATE error:', error)
      return { success: false, error: (error as Error).message } as IPCResponse
    }
  })

  // Update provider
  ipcMain.handle(IPC_CHANNELS.SETTINGS_PROVIDERS_UPDATE, async (_event, id: string, updates: Partial<Provider>) => {
    try {
      const provider = await dbService.updateProvider(id, {
        ...updates,
        updatedAt: new Date()
      })
      return { success: true, data: provider } as IPCResponse
    } catch (error) {
      console.error('SETTINGS_PROVIDERS_UPDATE error:', error)
      return { success: false, error: (error as Error).message } as IPCResponse
    }
  })

  // Delete provider
  ipcMain.handle(IPC_CHANNELS.SETTINGS_PROVIDERS_DELETE, async (_event, id: string) => {
    try {
      await dbService.deleteProvider(id)
      return { success: true } as IPCResponse
    } catch (error) {
      console.error('SETTINGS_PROVIDERS_DELETE error:', error)
      return { success: false, error: (error as Error).message } as IPCResponse
    }
  })

  // Activate provider
  ipcMain.handle(IPC_CHANNELS.SETTINGS_PROVIDERS_ACTIVATE, async (_event, id: string) => {
    try {
      await dbService.activateProvider(id)
      const provider = await dbService.getActiveProvider()
      if (provider) {
        await configService.syncProviderToFile(provider)
      }
      return { success: true, data: provider } as IPCResponse
    } catch (error) {
      console.error('SETTINGS_PROVIDERS_ACTIVATE error:', error)
      return { success: false, error: (error as Error).message } as IPCResponse
    }
  })

  // Sync settings to file
  ipcMain.handle(IPC_CHANNELS.SETTINGS_SYNC_TO_FILE, async () => {
    try {
      const provider = await dbService.getActiveProvider()
      if (provider) {
        await configService.syncProviderToFile(provider)
      }
      return { success: true } as IPCResponse
    } catch (error) {
      console.error('SETTINGS_SYNC_TO_FILE error:', error)
      return { success: false, error: (error as Error).message } as IPCResponse
    }
  })
}
