/**
 * Workspace IPC Handlers
 * Wires workspace-related IPC channels to file system and file watcher service
 */
import { ipcMain, dialog } from 'electron'
import type { BrowserWindow } from 'electron'
import * as fs from 'fs/promises'
import * as path from 'path'
import { IPC_CHANNELS } from '../../shared/ipc-channels'
import type { IPCResponse, FileNode } from '../../shared/types'
import { FileWatcherService } from '../services/file-watcher'

const MAX_FILE_SIZE = 1024 * 1024 // 1MB
const MAX_DEPTH = 5
const IGNORED_DIRS = new Set(['.git', 'node_modules', '.ccdisk', '.codepilot-uploads'])

/**
 * Build file tree recursively
 */
async function buildFileTree(
  dirPath: string,
  depth: number = 0,
  basePath?: string
): Promise<FileNode[]> {
  if (depth >= MAX_DEPTH) {
    return []
  }

  const base = basePath || dirPath
  const entries = await fs.readdir(dirPath, { withFileTypes: true })
  const nodes: FileNode[] = []

  for (const entry of entries) {
    // Skip ignored directories
    if (IGNORED_DIRS.has(entry.name)) {
      continue
    }

    const fullPath = path.join(dirPath, entry.name)
    const relativePath = path.relative(base, fullPath)

    if (entry.isDirectory()) {
      const children = await buildFileTree(fullPath, depth + 1, base)
      nodes.push({
        name: entry.name,
        path: relativePath,
        type: 'directory',
        children
      })
    } else if (entry.isFile()) {
      nodes.push({
        name: entry.name,
        path: relativePath,
        type: 'file'
      })
    }
  }

  // Sort: directories first, then files, alphabetically
  return nodes.sort((a, b) => {
    if (a.type !== b.type) {
      return a.type === 'directory' ? -1 : 1
    }
    return a.name.localeCompare(b.name)
  })
}

/**
 * Register workspace IPC handlers
 */
export function registerWorkspaceHandlers(win: BrowserWindow, fileWatcher: FileWatcherService) {
  // Select directory dialog (utility)
  ipcMain.handle(IPC_CHANNELS.SELECT_DIRECTORY, async (): Promise<string | null> => {
    try {
      const result = await dialog.showOpenDialog(win, {
        properties: ['openDirectory']
      })

      if (result.canceled || result.filePaths.length === 0) {
        return null
      }

      return result.filePaths[0]
    } catch (error) {
      console.error('SELECT_DIRECTORY error:', error)
      return null
    }
  })

  // Select workspace directory
  ipcMain.handle(
    IPC_CHANNELS.WORKSPACE_SELECT,
    async (_event, path?: string): Promise<IPCResponse<string | null>> => {
      try {
        let selectedPath: string | null = null

        // If path is provided, use it directly
        if (path) {
          selectedPath = path
        } else {
          // Otherwise, show dialog to select directory
          const result = await dialog.showOpenDialog(win, {
            properties: ['openDirectory']
          })

          if (result.canceled) {
            return { success: true, data: null }
          }

          selectedPath = result.filePaths[0]
        }

        fileWatcher.setWorkspacePath(selectedPath)
        await fileWatcher.startWatching()

        return { success: true, data: selectedPath }
      } catch (error) {
        console.error('WORKSPACE_SELECT error:', error)
        return { success: false, error: (error as Error).message }
      }
    }
  )

  // Get current workspace path
  ipcMain.handle(
    IPC_CHANNELS.WORKSPACE_GET_CURRENT,
    async (): Promise<IPCResponse<string | null>> => {
      try {
        const workspacePath = fileWatcher.getWorkspacePath()
        return { success: true, data: workspacePath }
      } catch (error) {
        console.error('WORKSPACE_GET_CURRENT error:', error)
        return { success: false, error: (error as Error).message }
      }
    }
  )

  // Get file tree
  ipcMain.handle(
    IPC_CHANNELS.WORKSPACE_GET_FILE_TREE,
    async (): Promise<IPCResponse<FileNode[]>> => {
      try {
        const workspacePath = fileWatcher.getWorkspacePath()

        if (!workspacePath) {
          return { success: false, error: 'No workspace selected' }
        }

        const tree = await buildFileTree(workspacePath)
        return { success: true, data: tree }
      } catch (error) {
        console.error('WORKSPACE_GET_FILE_TREE error:', error)
        return { success: false, error: (error as Error).message }
      }
    }
  )

  // Get file content
  ipcMain.handle(
    IPC_CHANNELS.WORKSPACE_GET_FILE_CONTENT,
    async (
      _event,
      filePath: string
    ): Promise<IPCResponse<{ content: string; size: number; type: string }>> => {
      try {
        const workspacePath = fileWatcher.getWorkspacePath()

        if (!workspacePath) {
          return { success: false, error: 'No workspace selected' }
        }

        // Resolve full path and ensure it's within workspace
        const fullPath = path.resolve(workspacePath, filePath)
        if (!fullPath.startsWith(workspacePath)) {
          return { success: false, error: 'Invalid file path: outside workspace' }
        }

        // Check file size
        const stats = await fs.stat(fullPath)
        if (stats.size > MAX_FILE_SIZE) {
          return {
            success: false,
            error: `File too large: ${stats.size} bytes (max ${MAX_FILE_SIZE} bytes)`
          }
        }

        // Read file content
        const content = await fs.readFile(fullPath, 'utf-8')
        const ext = path.extname(fullPath)

        return {
          success: true,
          data: {
            content,
            size: stats.size,
            type: ext || 'unknown'
          }
        }
      } catch (error) {
        console.error('WORKSPACE_GET_FILE_CONTENT error:', error)
        return { success: false, error: (error as Error).message }
      }
    }
  )

  // Set up file watcher callback to emit changes to renderer
  fileWatcher.setOnChange((filePath: string) => {
    win.webContents.send(IPC_CHANNELS.WORKSPACE_FILE_CHANGED, filePath)
  })
}
