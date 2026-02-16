/**
 * Sessions IPC Handlers
 * Wires session CRUD operations to database service
 */

import { ipcMain } from 'electron';
import { nanoid } from 'nanoid';
import { IPC_CHANNELS } from '../../shared/ipc-channels';
import type { IPCResponse } from '../../shared/types';
import { DatabaseService } from '../services/db-service';

export function registerSessionsHandlers(dbService: DatabaseService) {
  // Create session
  ipcMain.handle(IPC_CHANNELS.SESSIONS_CREATE, async (_event, name: string) => {
    try {
      const session = await dbService.createSession({
        id: nanoid(),
        name,
        sdkSessionId: null,
        model: null,
        createdAt: new Date(),
        updatedAt: new Date()
      });
      return { success: true, data: session } as IPCResponse;
    } catch (error) {
      console.error('SESSIONS_CREATE error:', error);
      return { success: false, error: (error as Error).message } as IPCResponse;
    }
  });

  // List sessions
  ipcMain.handle(IPC_CHANNELS.SESSIONS_LIST, async () => {
    try {
      const sessions = await dbService.listSessions();
      return { success: true, data: sessions } as IPCResponse;
    } catch (error) {
      console.error('SESSIONS_LIST error:', error);
      return { success: false, error: (error as Error).message } as IPCResponse;
    }
  });

  // Get session
  ipcMain.handle(IPC_CHANNELS.SESSIONS_GET, async (_event, id: string) => {
    try {
      const session = await dbService.getSession(id);
      return { success: true, data: session } as IPCResponse;
    } catch (error) {
      console.error('SESSIONS_GET error:', error);
      return { success: false, error: (error as Error).message } as IPCResponse;
    }
  });

  // Delete session
  ipcMain.handle(IPC_CHANNELS.SESSIONS_DELETE, async (_event, id: string) => {
    try {
      await dbService.deleteSession(id);
      return { success: true } as IPCResponse;
    } catch (error) {
      console.error('SESSIONS_DELETE error:', error);
      return { success: false, error: (error as Error).message } as IPCResponse;
    }
  });

  // Update session (rename)
  ipcMain.handle(IPC_CHANNELS.SESSIONS_UPDATE, async (_event, id: string, updates: { name?: string }) => {
    try {
      const session = await dbService.updateSession(id, {
        ...updates,
        updatedAt: new Date()
      });
      return { success: true, data: session } as IPCResponse;
    } catch (error) {
      console.error('SESSIONS_UPDATE error:', error);
      return { success: false, error: (error as Error).message } as IPCResponse;
    }
  });

  // Get messages for session
  ipcMain.handle(IPC_CHANNELS.SESSIONS_GET_MESSAGES, async (_event, sessionId: string) => {
    try {
      const messages = await dbService.getMessages(sessionId);
      return { success: true, data: messages } as IPCResponse;
    } catch (error) {
      console.error('SESSIONS_GET_MESSAGES error:', error);
      return { success: false, error: (error as Error).message } as IPCResponse;
    }
  });
}
