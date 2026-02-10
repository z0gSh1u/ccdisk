/**
 * MCP IPC Handlers
 * Wires Model Context Protocol server config management to MCP service
 */

import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '../../shared/ipc-channels'
import type { IPCResponse, MCPConfig } from '../../shared/types'
import { MCPService } from '../services/mcp-service'

export function registerMcpHandlers(mcpService: MCPService) {
  // Get merged config (global + workspace, workspace overrides global)
  ipcMain.handle(IPC_CHANNELS.MCP_GET_CONFIG, async () => {
    try {
      const config = await mcpService.getConfig()
      return { success: true, data: config } as IPCResponse
    } catch (error) {
      console.error('MCP_GET_CONFIG error:', error)
      return { success: false, error: (error as Error).message } as IPCResponse
    }
  })

  // Get config for specific scope (without merging)
  ipcMain.handle(
    IPC_CHANNELS.MCP_GET_CONFIG_BY_SCOPE,
    async (_event, scope: 'global' | 'workspace') => {
      try {
        const config = await mcpService.getConfigByScope(scope)
        return { success: true, data: config } as IPCResponse
      } catch (error) {
        console.error('MCP_GET_CONFIG_BY_SCOPE error:', error)
        return { success: false, error: (error as Error).message } as IPCResponse
      }
    }
  )

  // Update config for specific scope
  ipcMain.handle(
    IPC_CHANNELS.MCP_UPDATE_CONFIG,
    async (_event, config: MCPConfig, scope: 'global' | 'workspace') => {
      try {
        await mcpService.updateConfig(config, scope)
        return { success: true } as IPCResponse
      } catch (error) {
        console.error('MCP_UPDATE_CONFIG error:', error)
        return { success: false, error: (error as Error).message } as IPCResponse
      }
    }
  )
}
