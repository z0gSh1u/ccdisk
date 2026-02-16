/**
 * Commands service for managing Claude Code executable command scripts
 * Global commands: ~/.claude/commands/
 * Workspace commands: <workspace>/.claude/commands/
 */
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { Command } from '../../shared/types';

export class CommandsService {
  private globalCommandsDir: string;
  private workspaceCommandsDir: string | null;

  constructor(workspacePath?: string | null) {
    // Global commands directory
    this.globalCommandsDir = path.join(os.homedir(), '.claude', 'commands');

    // Workspace commands directory (if workspace is set)
    this.workspaceCommandsDir = workspacePath ? path.join(workspacePath, '.claude', 'commands') : null;
  }

  /**
   * Update workspace path (when user changes workspace)
   */
  setWorkspacePath(workspacePath: string | null): void {
    this.workspaceCommandsDir = workspacePath ? path.join(workspacePath, '.claude', 'commands') : null;
  }

  /**
   * List all commands from both global and workspace scopes
   * Returns global commands first, then workspace commands
   */
  async listCommands(): Promise<Command[]> {
    const commands: Command[] = [];

    // Read global commands
    try {
      const globalFiles = await fs.readdir(this.globalCommandsDir);
      for (const file of globalFiles) {
        // Filter out hidden files
        if (file.startsWith('.')) {
          continue;
        }

        const commandPath = path.join(this.globalCommandsDir, file);
        try {
          // Use lstat instead of stat to not follow symlinks
          const stats = await fs.lstat(commandPath);

          // Only include regular files (not directories or symlinks)
          if (stats.isFile()) {
            // Check if file has executable permissions
            const isExecutable = (stats.mode & 0o111) !== 0;

            commands.push({
              name: file,
              path: commandPath,
              scope: 'global',
              isExecutable
            });
          }
        } catch (error) {
          console.error(`Failed to stat command file ${commandPath}:`, error);
          // Skip this file and continue
        }
      }
    } catch (error) {
      // Directory doesn't exist - that's fine, just skip
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.error('Failed to read global commands directory:', error);
      }
    }

    // Read workspace commands (if workspace is set)
    if (this.workspaceCommandsDir) {
      try {
        const workspaceFiles = await fs.readdir(this.workspaceCommandsDir);
        for (const file of workspaceFiles) {
          // Filter out hidden files
          if (file.startsWith('.')) {
            continue;
          }

          const commandPath = path.join(this.workspaceCommandsDir, file);
          try {
            // Use lstat instead of stat to not follow symlinks
            const stats = await fs.lstat(commandPath);

            // Only include regular files (not directories or symlinks)
            if (stats.isFile()) {
              // Check if file has executable permissions
              const isExecutable = (stats.mode & 0o111) !== 0;

              commands.push({
                name: file,
                path: commandPath,
                scope: 'workspace',
                isExecutable
              });
            }
          } catch (error) {
            console.error(`Failed to stat command file ${commandPath}:`, error);
            // Skip this file and continue
          }
        }
      } catch (error) {
        // Directory doesn't exist - that's fine, just skip
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          console.error('Failed to read workspace commands directory:', error);
        }
      }
    }

    return commands;
  }

  /**
   * Get command content by name
   * Throws if command doesn't exist
   */
  async getCommand(name: string, scope: 'global' | 'workspace'): Promise<{ command: Command; content: string }> {
    const dir = this.getCommandsDir(scope);
    const commandPath = path.join(dir, name);

    try {
      // Read command content
      const content = await fs.readFile(commandPath, 'utf-8');

      // Get file stats for executable check
      const stats = await fs.lstat(commandPath);
      const isExecutable = (stats.mode & 0o111) !== 0;

      const command: Command = {
        name,
        path: commandPath,
        scope,
        isExecutable
      };

      return { command, content };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new Error(`Command "${name}" not found in ${scope} scope`);
      }
      console.error(`Failed to read command ${name}:`, error);
      throw new Error(`Failed to read command: ${error}`);
    }
  }

  /**
   * Create new command
   * Throws if command already exists
   */
  async createCommand(name: string, content: string, scope: 'global' | 'workspace'): Promise<Command> {
    const dir = this.getCommandsDir(scope);
    const commandPath = path.join(dir, name);

    // Check if command already exists
    try {
      await fs.access(commandPath);
      throw new Error(`Command "${name}" already exists in ${scope} scope`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
      // File doesn't exist - good, we can create it
    }

    // Ensure directory exists
    try {
      await fs.mkdir(dir, { recursive: true });
    } catch (error) {
      console.error(`Failed to create commands directory ${dir}:`, error);
      throw new Error(`Failed to create commands directory: ${error}`);
    }

    // Write command file
    try {
      await fs.writeFile(commandPath, content, 'utf-8');
    } catch (error) {
      console.error(`Failed to create command ${name}:`, error);
      throw new Error(`Failed to create command: ${error}`);
    }

    // Set executable permissions
    try {
      await fs.chmod(commandPath, 0o755);
    } catch (error) {
      console.error(`Failed to set executable permissions on ${name}:`, error);
      throw new Error(`Failed to set executable permissions: ${error}`);
    }

    return {
      name,
      path: commandPath,
      scope,
      isExecutable: true
    };
  }

  /**
   * Delete command
   * Throws if command doesn't exist
   */
  async deleteCommand(name: string, scope: 'global' | 'workspace'): Promise<void> {
    const dir = this.getCommandsDir(scope);
    const commandPath = path.join(dir, name);

    try {
      await fs.unlink(commandPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new Error(`Command "${name}" not found in ${scope} scope`);
      }
      console.error(`Failed to delete command ${name}:`, error);
      throw new Error(`Failed to delete command: ${error}`);
    }
  }

  /**
   * Get commands directory for given scope
   * Throws if workspace scope is requested but no workspace path is set
   */
  private getCommandsDir(scope: 'global' | 'workspace'): string {
    if (scope === 'global') {
      return this.globalCommandsDir;
    } else if (scope === 'workspace') {
      if (!this.workspaceCommandsDir) {
        throw new Error('No workspace path set');
      }
      return this.workspaceCommandsDir;
    } else {
      throw new Error(`Invalid scope: ${scope}`);
    }
  }
}
