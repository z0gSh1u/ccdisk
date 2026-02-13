/**
 * Workspace IPC Handlers
 * Wires workspace-related IPC channels to file system and file watcher service
 */
import { ipcMain, shell } from 'electron'
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

  // Open workspace directory in file manager
  ipcMain.handle(IPC_CHANNELS.WORKSPACE_OPEN_IN_EXPLORER, async (): Promise<IPCResponse<void>> => {
    try {
      const workspacePath = fileWatcher.getWorkspacePath()
      if (!workspacePath) {
        return { success: false, error: 'No workspace available' }
      }
      await shell.openPath(workspacePath)
      return { success: true, data: undefined }
    } catch (error) {
      console.error('WORKSPACE_OPEN_IN_EXPLORER error:', error)
      return { success: false, error: (error as Error).message }
    }
  })

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

  // Get file content (text or binary)
  ipcMain.handle(
    IPC_CHANNELS.WORKSPACE_GET_FILE_CONTENT,
    async (
      _event,
      filePath: string
    ): Promise<
      IPCResponse<{
        content: string
        size: number
        type: string
        encoding: string
        mimeType: string
      }>
    > => {
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

        // Check file size (10MB for binary, 1MB for text)
        const stats = await fs.stat(fullPath)
        const ext = path.extname(fullPath).toLowerCase()
        const binaryExtensions = new Set([
          '.png',
          '.jpg',
          '.jpeg',
          '.gif',
          '.bmp',
          '.webp',
          '.svg',
          '.ico',
          '.pdf',
          '.docx',
          '.xlsx',
          '.xls',
          '.pptx',
          '.ppt',
          '.zip',
          '.tar',
          '.gz',
          '.7z',
          '.mp3',
          '.mp4',
          '.wav',
          '.avi',
          '.mkv'
        ])
        const isBinary = binaryExtensions.has(ext)
        const maxSize = isBinary ? 10 * 1024 * 1024 : MAX_FILE_SIZE

        if (stats.size > maxSize) {
          return {
            success: false,
            error: `File too large: ${stats.size} bytes (max ${maxSize} bytes)`
          }
        }

        // Determine MIME type
        const mimeMap: Record<string, string> = {
          '.md': 'text/markdown',
          '.markdown': 'text/markdown',
          '.png': 'image/png',
          '.jpg': 'image/jpeg',
          '.jpeg': 'image/jpeg',
          '.gif': 'image/gif',
          '.webp': 'image/webp',
          '.svg': 'image/svg+xml',
          '.bmp': 'image/bmp',
          '.ico': 'image/x-icon',
          '.pdf': 'application/pdf',
          '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          '.xls': 'application/vnd.ms-excel',
          '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
          '.csv': 'text/csv',
          '.json': 'application/json',
          '.html': 'text/html',
          '.htm': 'text/html',
          '.css': 'text/css',
          '.js': 'text/javascript',
          '.ts': 'text/typescript',
          '.tsx': 'text/typescript',
          '.jsx': 'text/javascript',
          '.py': 'text/x-python',
          '.rb': 'text/x-ruby',
          '.go': 'text/x-go',
          '.rs': 'text/x-rust',
          '.sh': 'text/x-shellscript',
          '.bash': 'text/x-shellscript',
          '.yml': 'text/yaml',
          '.yaml': 'text/yaml',
          '.xml': 'text/xml',
          '.toml': 'text/toml'
        }
        const mimeType = mimeMap[ext] || (isBinary ? 'application/octet-stream' : 'text/plain')

        // Read file
        if (isBinary) {
          const buffer = await fs.readFile(fullPath)
          return {
            success: true,
            data: {
              content: buffer.toString('base64'),
              size: stats.size,
              type: ext || 'unknown',
              encoding: 'base64',
              mimeType
            }
          }
        } else {
          const content = await fs.readFile(fullPath, 'utf-8')
          return {
            success: true,
            data: {
              content,
              size: stats.size,
              type: ext || 'unknown',
              encoding: 'utf-8',
              mimeType
            }
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
