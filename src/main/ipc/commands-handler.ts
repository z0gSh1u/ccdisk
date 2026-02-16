/**
 * Commands IPC Handlers
 * Wires commands CRUD operations to commands service
 */

import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../shared/ipc-channels';
import type { IPCResponse } from '../../shared/types';
import { CommandsService } from '../services/commands-service';

export function registerCommandsHandlers(commandsService: CommandsService) {
  // List commands
  ipcMain.handle(IPC_CHANNELS.COMMANDS_LIST, async () => {
    try {
      const commands = await commandsService.listCommands();
      return { success: true, data: commands } as IPCResponse;
    } catch (error) {
      console.error('COMMANDS_LIST error:', error);
      return { success: false, error: (error as Error).message } as IPCResponse;
    }
  });

  // Get command
  ipcMain.handle(IPC_CHANNELS.COMMANDS_GET, async (_event, name: string, scope: 'global' | 'workspace') => {
    try {
      const result = await commandsService.getCommand(name, scope);
      return { success: true, data: result } as IPCResponse;
    } catch (error) {
      console.error('COMMANDS_GET error:', error);
      return { success: false, error: (error as Error).message } as IPCResponse;
    }
  });

  // Create command
  ipcMain.handle(
    IPC_CHANNELS.COMMANDS_CREATE,
    async (_event, name: string, content: string, scope: 'global' | 'workspace') => {
      try {
        const command = await commandsService.createCommand(name, content, scope);
        return { success: true, data: command } as IPCResponse;
      } catch (error) {
        console.error('COMMANDS_CREATE error:', error);
        return { success: false, error: (error as Error).message } as IPCResponse;
      }
    }
  );

  // Delete command
  ipcMain.handle(IPC_CHANNELS.COMMANDS_DELETE, async (_event, name: string, scope: 'global' | 'workspace') => {
    try {
      await commandsService.deleteCommand(name, scope);
      return { success: true } as IPCResponse;
    } catch (error) {
      console.error('COMMANDS_DELETE error:', error);
      return { success: false, error: (error as Error).message } as IPCResponse;
    }
  });
}
