/**
 * Workspace Store - Manages workspace selection and file tree
 * Uses Zustand for state management and calls window.api for IPC
 */

import { create } from 'zustand'

import type { FileNode, FileContentResponse } from '../../../shared/types'

interface WorkspaceStore {
  // State
  currentWorkspace: string | null
  fileTree: FileNode[]
  selectedFile: string | null
  fileContent: FileContentResponse | null
  isLoadingFile: boolean
  isLoading: boolean

  // Actions
  loadWorkspace: () => Promise<void>
  loadFileTree: () => Promise<void>
  selectFile: (path: string) => void
  getFileContent: (path: string) => Promise<string | null>
  loadFileContent: (path: string) => Promise<void>
  clearFileContent: () => void
  openWorkspaceInExplorer: () => Promise<void>

  // File watching
  setupFileWatcher: () => () => void
}

export const useWorkspaceStore = create<WorkspaceStore>((set, get) => ({
  // Initial state
  currentWorkspace: null,
  fileTree: [],
  selectedFile: null,
  fileContent: null,
  isLoadingFile: false,
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
    get().loadFileContent(path)
  },

  // Get file content (returns text only)
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

  // Load full file content response for preview
  loadFileContent: async (path: string) => {
    set({ isLoadingFile: true })
    try {
      const response = await window.api.workspace.getFileContent(path)
      if (response.success && response.data) {
        set({ fileContent: response.data, isLoadingFile: false })
      } else {
        set({ fileContent: null, isLoadingFile: false })
      }
    } catch (error) {
      console.error('Failed to load file content:', error)
      set({ fileContent: null, isLoadingFile: false })
    }
  },

  // Clear file content and selection
  clearFileContent: () => {
    set({ selectedFile: null, fileContent: null })
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
