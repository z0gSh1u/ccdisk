/**
 * Workspace Store - Manages workspace selection and file tree
 * Uses Zustand for state management and calls window.api for IPC
 */

import { create } from 'zustand'
import type { FileNode } from '../../../shared/types'

interface WorkspaceStore {
  // State
  currentWorkspace: string | null
  fileTree: FileNode[]
  selectedFile: string | null
  isLoading: boolean

  // Actions
  loadWorkspace: () => Promise<void>
  loadFileTree: () => Promise<void>
  selectFile: (path: string) => void
  getFileContent: (path: string) => Promise<string | null>
  openWorkspaceInExplorer: () => Promise<void>

  // File watching
  setupFileWatcher: () => () => void
}

export const useWorkspaceStore = create<WorkspaceStore>((set, get) => ({
  // Initial state
  currentWorkspace: null,
  fileTree: [],
  selectedFile: null,
  isLoading: false,

  // Load workspace path from backend
  loadWorkspace: async () => {
    try {
      const response = await window.api.workspace.getCurrent()
      if (response.success && response.data) {
        set({ currentWorkspace: response.data })
        await get().loadFileTree()
      }
    } catch (error) {
      console.error('Failed to load workspace:', error)
    }
  },

  // Open workspace in file explorer
  openWorkspaceInExplorer: async () => {
    try {
      await window.api.workspace.openInExplorer()
    } catch (error) {
      console.error('Failed to open workspace in explorer:', error)
    }
  },

  // Load file tree
  loadFileTree: async () => {
    set({ isLoading: true })
    try {
      const response = await window.api.workspace.getFileTree()
      if (response.success && response.data) {
        set({ fileTree: response.data })
      } else {
        console.error('Failed to load file tree:', response.error)
        set({ fileTree: [] })
      }
    } catch (error) {
      console.error('Failed to load file tree:', error)
      set({ fileTree: [] })
    } finally {
      set({ isLoading: false })
    }
  },

  // Select file in tree
  selectFile: (path: string) => {
    set({ selectedFile: path })
  },

  // Get file content
  getFileContent: async (path: string) => {
    try {
      const response = await window.api.workspace.getFileContent(path)
      if (response.success && response.data) {
        return response.data.content
      }
      return null
    } catch (error) {
      console.error('Failed to get file content:', error)
      return null
    }
  },

  // Setup file watcher
  setupFileWatcher: () => {
    return window.api.workspace.onFileChange((event) => {
      console.log('File changed:', event.path, event.type)
      // Reload file tree on changes
      get().loadFileTree()
    })
  }
}))
