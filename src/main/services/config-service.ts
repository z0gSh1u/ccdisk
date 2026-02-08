/**
 * Config service for managing Claude Code settings.json
 * Location: ~/.claude/settings.json
 */
import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import { Provider } from '../../shared/types'

export class ConfigService {
  private settingsPath: string

  constructor() {
    // Settings stored at ~/.claude/settings.json (Claude SDK standard location)
    this.settingsPath = path.join(os.homedir(), '.claude', 'settings.json')
  }

  /**
   * Read settings.json and return parsed object
   * Returns empty object if file doesn't exist or is invalid
   */
  async getSettings(): Promise<Record<string, unknown>> {
    try {
      const content = await fs.readFile(this.settingsPath, 'utf-8')
      return JSON.parse(content)
    } catch (error) {
      // File doesn't exist or invalid JSON - return empty object
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return {}
      }
      // Invalid JSON - log and return empty object
      console.error('Failed to parse settings.json:', error)
      return {}
    }
  }

  /**
   * Write settings to settings.json
   * Merges with existing settings (doesn't overwrite everything)
   * Creates ~/.claude/ directory if it doesn't exist
   */
  async updateSettings(settings: Record<string, unknown>): Promise<void> {
    try {
      // Ensure directory exists
      const dir = path.dirname(this.settingsPath)
      await fs.mkdir(dir, { recursive: true })

      // Read existing settings
      const existingSettings = await this.getSettings()

      // Deep merge settings
      const mergedSettings = this.mergeSettings(existingSettings, settings)

      // Write with pretty formatting
      await fs.writeFile(this.settingsPath, JSON.stringify(mergedSettings, null, 2), 'utf-8')
    } catch (error) {
      console.error('Failed to write settings.json:', error)
      throw error
    }
  }

  /**
   * Sync provider credentials to settings.json env variables
   * Maps:
   * - provider.apiKey → env.ANTHROPIC_AUTH_TOKEN
   * - provider.baseUrl → env.ANTHROPIC_BASE_URL (if not null)
   * - provider.extraEnv → merged into env object
   */
  async syncProviderToFile(provider: Provider): Promise<void> {
    try {
      // Build env object from provider
      const env: Record<string, string> = {
        ANTHROPIC_AUTH_TOKEN: provider.apiKey
      }

      // Add base URL if provided
      if (provider.baseUrl) {
        env.ANTHROPIC_BASE_URL = provider.baseUrl
      }

      // Parse and merge extraEnv if provided
      if (provider.extraEnv) {
        try {
          const extraEnv = JSON.parse(provider.extraEnv)
          if (typeof extraEnv === 'object' && extraEnv !== null) {
            Object.assign(env, extraEnv)
          }
        } catch (error) {
          console.error('Failed to parse provider.extraEnv:', error)
          // Continue without extraEnv
        }
      }

      // Update settings with env
      await this.updateSettings({ env })
    } catch (error) {
      console.error('Failed to sync provider to settings.json:', error)
      throw error
    }
  }

  /**
   * Deep merge two settings objects
   * Second object takes precedence for conflicts
   */
  private mergeSettings(
    existing: Record<string, unknown>,
    updates: Record<string, unknown>
  ): Record<string, unknown> {
    const result = { ...existing }

    for (const [key, value] of Object.entries(updates)) {
      if (
        value &&
        typeof value === 'object' &&
        !Array.isArray(value) &&
        result[key] &&
        typeof result[key] === 'object' &&
        !Array.isArray(result[key])
      ) {
        // Recursively merge objects
        result[key] = this.mergeSettings(
          result[key] as Record<string, unknown>,
          value as Record<string, unknown>
        )
      } else {
        // Overwrite primitives, arrays, and nulls
        result[key] = value
      }
    }

    return result
  }
}
