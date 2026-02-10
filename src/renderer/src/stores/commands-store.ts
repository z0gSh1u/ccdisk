/**
 * Commands Store - Manages commands CRUD operations
 * Uses Zustand for state management and calls window.api for IPC
 */

import { create } from 'zustand'
import type { Command } from '../../../shared/types'

export type CommandScope = 'global' | 'workspace'

interface CommandsStore {
  // State
  commands: Command[]
  currentScope: CommandScope
  selectedCommand: Command | null
  commandContent: string
  isLoading: boolean
  error: string | null

  // Actions
  setScope: (scope: CommandScope) => void
  loadCommands: () => Promise<void>
  selectCommand: (command: Command | null) => Promise<void>
  createCommand: (name: string, content: string) => Promise<void>
  deleteCommand: (name: string, scope: CommandScope) => Promise<void>

  // Helpers
  getCommandsByScope: (scope: CommandScope) => Command[]
  setupCommandsWatcher: () => () => void
}

export const useCommandsStore = create<CommandsStore>((set, get) => ({
  // Initial state
  commands: [],
  currentScope: 'global',
  selectedCommand: null,
  commandContent: '',
  isLoading: false,
  error: null,

  // Set current scope
  setScope: (scope: CommandScope) => {
    set({ currentScope: scope, selectedCommand: null, commandContent: '' })
    get().loadCommands()
  },

  // Load commands from both scopes
  loadCommands: async () => {
    set({ isLoading: true, error: null })
    try {
      // The backend listCommands() returns commands from both scopes
      const response = await window.api.commands.list()
      if (response.success && response.data) {
        set({ commands: response.data, isLoading: false })
      } else {
        set({ error: response.error || 'Failed to load commands', isLoading: false, commands: [] })
      }
    } catch (error) {
      console.error('Failed to load commands:', error)
      set({ error: (error as Error).message, isLoading: false, commands: [] })
    }
  },

  // Select a command and load its content
  selectCommand: async (command: Command | null) => {
    set({ selectedCommand: command, commandContent: '' })
    if (command) {
      set({ isLoading: true, error: null })
      try {
        const response = await window.api.commands.get(command.name, command.scope)
        if (response.success && response.data) {
          set({ commandContent: response.data.content, isLoading: false })
        } else {
          set({ error: response.error || 'Failed to load command content', isLoading: false })
        }
      } catch (error) {
        console.error('Failed to load command content:', error)
        set({ error: (error as Error).message, isLoading: false })
      }
    }
  },

  // Create new command
  createCommand: async (name: string, content: string) => {
    const { currentScope } = get()
    set({ isLoading: true, error: null })
    try {
      const response = await window.api.commands.create(name, content, currentScope)
      if (response.success) {
        await get().loadCommands()
        set({ isLoading: false })
      } else {
        set({ error: response.error || 'Failed to create command', isLoading: false })
        throw new Error(response.error || 'Failed to create command')
      }
    } catch (error) {
      console.error('Failed to create command:', error)
      set({ error: (error as Error).message, isLoading: false })
      throw error
    }
  },

  // Delete command
  deleteCommand: async (name: string, scope: CommandScope) => {
    set({ isLoading: true, error: null })
    try {
      const response = await window.api.commands.delete(name, scope)
      if (response.success) {
        await get().loadCommands()
        // Clear selection if deleted command was selected
        if (get().selectedCommand?.name === name && get().selectedCommand?.scope === scope) {
          set({ selectedCommand: null, commandContent: '' })
        }
        set({ isLoading: false })
      } else {
        set({ error: response.error || 'Failed to delete command', isLoading: false })
        throw new Error(response.error || 'Failed to delete command')
      }
    } catch (error) {
      console.error('Failed to delete command:', error)
      set({ error: (error as Error).message, isLoading: false })
      throw error
    }
  },

  // Get commands filtered by scope
  getCommandsByScope: (scope: CommandScope) => {
    return get().commands.filter((command) => command.scope === scope)
  },

  // Setup file watcher for commands
  setupCommandsWatcher: () => {
    return window.api.commands.onCommandsChange(() => {
      console.log('Commands changed, reloading...')
      get().loadCommands()
    })
  }
}))
