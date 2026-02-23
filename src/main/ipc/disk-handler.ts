/**
 * Disk IPC Handlers
 * Handles Disk CRUD, switching, and pool resource queries
 */
import { ipcMain, type BrowserWindow } from 'electron';
import { IPC_CHANNELS } from '../../shared/ipc-channels';
import type { IPCResponse, DiskDefinition } from '../../shared/types';
import { DiskService } from '../services/disk-service';

export function registerDiskHandlers(win: BrowserWindow, diskService: DiskService): void {
  // List all disks
  ipcMain.handle(IPC_CHANNELS.DISK_LIST, async (): Promise<IPCResponse<DiskDefinition[]>> => {
    try {
      const disks = await diskService.listDisks();
      return { success: true, data: disks };
    } catch (error) {
      console.error('DISK_LIST error:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  // Get a specific disk
  ipcMain.handle(IPC_CHANNELS.DISK_GET, async (_event, diskId: string): Promise<IPCResponse<DiskDefinition>> => {
    try {
      const disk = await diskService.getDisk(diskId);
      return { success: true, data: disk };
    } catch (error) {
      console.error('DISK_GET error:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  // Get current disk
  ipcMain.handle(IPC_CHANNELS.DISK_GET_CURRENT, async (): Promise<IPCResponse<DiskDefinition>> => {
    try {
      const disk = await diskService.getCurrentDisk();
      return { success: true, data: disk };
    } catch (error) {
      console.error('DISK_GET_CURRENT error:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  // Switch disk
  ipcMain.handle(IPC_CHANNELS.DISK_SWITCH, async (_event, diskId: string): Promise<IPCResponse<DiskDefinition>> => {
    try {
      const disk = await diskService.switchDisk(diskId);
      // Notify renderer of disk switch
      win.webContents.send(IPC_CHANNELS.DISK_SWITCHED, disk);
      return { success: true, data: disk };
    } catch (error) {
      console.error('DISK_SWITCH error:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  // Create custom disk
  ipcMain.handle(
    IPC_CHANNELS.DISK_CREATE,
    async (_event, input: Omit<DiskDefinition, 'id' | 'builtIn'>): Promise<IPCResponse<DiskDefinition>> => {
      try {
        const disk = await diskService.createDisk(input);
        return { success: true, data: disk };
      } catch (error) {
        console.error('DISK_CREATE error:', error);
        return { success: false, error: (error as Error).message };
      }
    }
  );

  // Update disk
  ipcMain.handle(
    IPC_CHANNELS.DISK_UPDATE,
    async (_event, diskId: string, updates: Partial<DiskDefinition>): Promise<IPCResponse<DiskDefinition>> => {
      try {
        const disk = await diskService.updateDisk(diskId, updates);
        return { success: true, data: disk };
      } catch (error) {
        console.error('DISK_UPDATE error:', error);
        return { success: false, error: (error as Error).message };
      }
    }
  );

  // Delete disk
  ipcMain.handle(IPC_CHANNELS.DISK_DELETE, async (_event, diskId: string): Promise<IPCResponse<void>> => {
    try {
      await diskService.deleteDisk(diskId);
      return { success: true };
    } catch (error) {
      console.error('DISK_DELETE error:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  // Duplicate disk
  ipcMain.handle(
    IPC_CHANNELS.DISK_DUPLICATE,
    async (_event, diskId: string, newName: string): Promise<IPCResponse<DiskDefinition>> => {
      try {
        const disk = await diskService.duplicateDisk(diskId, newName);
        return { success: true, data: disk };
      } catch (error) {
        console.error('DISK_DUPLICATE error:', error);
        return { success: false, error: (error as Error).message };
      }
    }
  );

  // Pool queries
  ipcMain.handle(IPC_CHANNELS.DISK_LIST_POOL_SKILLS, async () => {
    try {
      const skills = await diskService.listPoolSkills();
      return { success: true, data: skills };
    } catch (error) {
      console.error('DISK_LIST_POOL_SKILLS error:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle(IPC_CHANNELS.DISK_LIST_POOL_COMMANDS, async () => {
    try {
      const commands = await diskService.listPoolCommands();
      return { success: true, data: commands };
    } catch (error) {
      console.error('DISK_LIST_POOL_COMMANDS error:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle(IPC_CHANNELS.DISK_LIST_POOL_MCP, async () => {
    try {
      const servers = await diskService.listPoolMCPServers();
      return { success: true, data: servers };
    } catch (error) {
      console.error('DISK_LIST_POOL_MCP error:', error);
      return { success: false, error: (error as Error).message };
    }
  });
}
