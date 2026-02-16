/**
 * SDK IPC Handlers
 * Wires MCP live status and SDK commands to ClaudeService
 */

import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../shared/ipc-channels';
import type { IPCResponse } from '../../shared/types';
import { ClaudeService } from '../services/claude-service';

export function registerSdkHandlers(claudeService: ClaudeService) {
  // Get MCP server status for active session
  ipcMain.handle(IPC_CHANNELS.MCP_GET_STATUS, async (_event, sessionId: string): Promise<IPCResponse> => {
    try {
      if (!claudeService.hasActiveSession(sessionId)) {
        return { success: true, data: null };
      }
      const status = await claudeService.getMcpServerStatus(sessionId);
      return { success: true, data: status };
    } catch (error) {
      console.error('MCP_GET_STATUS error:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  // Reconnect MCP server
  ipcMain.handle(
    IPC_CHANNELS.MCP_RECONNECT,
    async (_event, sessionId: string, serverName: string): Promise<IPCResponse> => {
      try {
        const result = await claudeService.reconnectMcpServer(sessionId, serverName);
        return { success: true, data: result };
      } catch (error) {
        console.error('MCP_RECONNECT error:', error);
        return { success: false, error: (error as Error).message };
      }
    }
  );

  // Toggle MCP server
  ipcMain.handle(
    IPC_CHANNELS.MCP_TOGGLE,
    async (_event, sessionId: string, serverName: string, enabled: boolean): Promise<IPCResponse> => {
      try {
        const result = await claudeService.toggleMcpServer(sessionId, serverName, enabled);
        return { success: true, data: result };
      } catch (error) {
        console.error('MCP_TOGGLE error:', error);
        return { success: false, error: (error as Error).message };
      }
    }
  );

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
