/**
 * File Watcher Service for monitoring workspace file changes
 * Uses chokidar to watch for file system events and debounce notifications
 */
import chokidar from 'chokidar'
import type { FSWatcher } from 'chokidar'

export class FileWatcherService {
  private workspacePath: string | null
  private watcher: FSWatcher | null
  private debounceTimers: Map<string, NodeJS.Timeout>
  private onChange: ((filePath: string) => void) | null

  constructor(workspacePath?: string | null, onChange?: (filePath: string) => void) {
    this.workspacePath = workspacePath ?? null
    this.watcher = null
    this.debounceTimers = new Map()
    this.onChange = onChange ?? null
  }

  /**
   * Set workspace path (stops old watcher, doesn't start new one)
   */
  setWorkspacePath(workspacePath: string | null): void {
    // Stop watching old workspace if any
    if (this.watcher) {
      this.stopWatching()
    }
    this.workspacePath = workspacePath
  }

  /**
   * Get current workspace path
   */
  getWorkspacePath(): string | null {
    return this.workspacePath
  }

  /**
   * Set change callback
   */
  setOnChange(onChange: (filePath: string) => void): void {
    this.onChange = onChange
  }

  /**
   * Start watching workspace
   * Throws error if no workspace path set
   */
  async startWatching(): Promise<void> {
    if (!this.workspacePath) {
      throw new Error('Cannot start watching: no workspace path set')
    }

    // If already watching, stop first
    if (this.watcher) {
      await this.stopWatching()
    }

    // Initialize chokidar watcher
    this.watcher = chokidar.watch(this.workspacePath, {
      ignored: [
        /(^|[\/\\])\../, // Ignore hidden files
        '**/node_modules/**',
        '**/.git/**',
        '**/.ccdisk/**',
        '**/.codepilot-uploads/**'
      ],
      persistent: true,
      ignoreInitial: true, // Don't emit events for initial scan
      awaitWriteFinish: {
        stabilityThreshold: 100,
        pollInterval: 100
      }
    })

    // Set up event handlers
    this.watcher
      .on('add', (path) => this.handleChange(path))
      .on('change', (path) => this.handleChange(path))
      .on('unlink', (path) => this.handleChange(path))
      .on('error', (error) => {
        console.error('File watcher error:', error)
      })

    // Wait for watcher to be ready
    return new Promise((resolve) => {
      if (this.watcher) {
        this.watcher.on('ready', () => resolve())
      } else {
        resolve()
      }
    })
  }

  /**
   * Stop watching
   * Safe to call multiple times
   */
  async stopWatching(timeoutMs = 0): Promise<void> {
    // Clear all pending debounce timers
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer)
    }
    this.debounceTimers.clear()

    // Close watcher if it exists
    if (this.watcher) {
      try {
        const watcher = this.watcher
        const closePromise = watcher.close()
        if (timeoutMs > 0) {
          let timedOut = false
          await Promise.race([
            closePromise,
            new Promise<void>((resolve) => {
              setTimeout(() => {
                timedOut = true
                resolve()
              }, timeoutMs)
            })
          ])
          if (timedOut) {
            console.warn('File watcher close timed out, continuing shutdown')
          }
        } else {
          await closePromise
        }
      } catch (error) {
        console.error('Error closing file watcher:', error)
      }
      this.watcher = null
    }
  }

  /**
   * Handle file change event with debouncing
   * Debounces per-file (300ms delay)
   */
  private handleChange(filePath: string): void {
    // Clear existing timer for this file
    const existingTimer = this.debounceTimers.get(filePath)
    if (existingTimer) {
      clearTimeout(existingTimer)
    }

    // Start new timer
    const timer = setTimeout(() => {
      this.debounceTimers.delete(filePath)

      // Call onChange callback if set
      if (this.onChange) {
        this.onChange(filePath)
      }
    }, 300)

    this.debounceTimers.set(filePath, timer)
  }
}
