/**
 * Chat IPC Handlers
 * Wires Claude Agent SDK streaming integration to IPC channels
 *
 * This is the most critical IPC handler as it:
 * - Streams AI responses from Claude SDK to the renderer
 * - Handles permission requests/responses for tool usage
 * - Manages session lifecycle (send, abort)
 * - Emits stream events via webContents for real-time UI updates
 */

import { ipcMain, type BrowserWindow } from 'electron';
import { randomUUID } from 'crypto';
import { IPC_CHANNELS } from '../../shared/ipc-channels';
import type { IPCResponse, StreamEvent } from '../../shared/types';
import { ClaudeService } from '../services/claude-service';
import { DatabaseService } from '../services/db-service';

export function registerChatHandlers(_win: BrowserWindow, claudeService: ClaudeService, dbService: DatabaseService) {
  // Send message and start streaming
  ipcMain.handle(
    IPC_CHANNELS.CHAT_SEND,
    async (
      _event,
      sessionId: string,
      message: string,
      files?: Array<{ path: string; content: string }>,
      sdkSessionId?: string
    ) => {
      try {
        // Send message to Claude service (returns immediately)
        await claudeService.sendMessage(sessionId, message, files, sdkSessionId);

        // Save user message to database
        await dbService.createMessage({
          id: randomUUID(),
          sessionId,
          role: 'user',
          content: JSON.stringify([{ type: 'text', text: message }]),
          createdAt: new Date()
        });

        return { success: true } as IPCResponse;
      } catch (error) {
        console.error('CHAT_SEND error:', error);
        return { success: false, error: (error as Error).message } as IPCResponse;
      }
    }
  );

  // Respond to permission request
  ipcMain.handle(
    IPC_CHANNELS.CHAT_PERMISSION_RESPONSE,
    async (_event, permissionRequestId: string, approved: boolean, input?: Record<string, unknown>) => {
      try {
        claudeService.respondToPermission(permissionRequestId, approved, input);
        return { success: true } as IPCResponse;
      } catch (error) {
        console.error('CHAT_PERMISSION_RESPONSE error:', error);
        return { success: false, error: (error as Error).message } as IPCResponse;
      }
    }
  );

  // Abort session
  ipcMain.handle(IPC_CHANNELS.CHAT_ABORT, async (_event, sessionId: string) => {
    try {
      claudeService.abortSession(sessionId);
      return { success: true } as IPCResponse;
    } catch (error) {
      console.error('CHAT_ABORT error:', error);
      return { success: false, error: (error as Error).message } as IPCResponse;
    }
  });
}

/**
 * Create stream event emitter for Claude service
 * This is passed to ClaudeService constructor to emit stream events to renderer
 */
export function createStreamEventEmitter(win: BrowserWindow, dbService: DatabaseService) {
  const assistantBuffers = new Map<string, string>();

  return (sessionId: string, event: StreamEvent) => {
    // Emit stream event to renderer via webContents
    win.webContents.send(IPC_CHANNELS.CHAT_STREAM, sessionId, event);

    if (event.type === 'text') {
      const current = assistantBuffers.get(sessionId) || '';
      assistantBuffers.set(sessionId, current + (event.data as string));
    }

    if (event.type === 'done') {
      const content = assistantBuffers.get(sessionId);
      if (content) {
        void dbService.createMessage({
          id: randomUUID(),
          sessionId,
          role: 'assistant',
          content: JSON.stringify([{ type: 'text', text: content }]),
          tokenUsage: null,
          createdAt: new Date()
        });
      }
      assistantBuffers.delete(sessionId);
    }

    // Log for debugging
    if (event.type === 'text') {
      console.log(`[Stream ${sessionId}] Text: ${(event.data as string).substring(0, 50)}...`);
    } else if (event.type === 'error') {
      console.error(`[Stream ${sessionId}] Error: ${event.data}`);
    } else {
      console.log(`[Stream ${sessionId}] ${event.type}`);
    }
  };
}
