/**
 * SDK IPC Handlers
 * Wires SDK commands to ClaudeService
 */

import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../shared/ipc-channels';
import type { IPCResponse } from '../../shared/types';
import { ClaudeService } from '../services/claude-service';

export function registerSdkHandlers(claudeService: ClaudeService) {
  // Get supported SDK commands
  ipcMain.handle(IPC_CHANNELS.SDK_GET_COMMANDS, async (_event, sessionId: string): Promise<IPCResponse> => {
    try {
      if (!claudeService.hasActiveSession(sessionId)) {
        return { success: true, data: null };
      }
      const commands = await claudeService.getSupportedCommands(sessionId);
      return { success: true, data: commands };
    } catch (error) {
      console.error('SDK_GET_COMMANDS error:', error);
      return { success: false, error: (error as Error).message };
    }
  });
}
