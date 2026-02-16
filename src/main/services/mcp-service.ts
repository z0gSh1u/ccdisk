/**
 * MCP service for managing Model Context Protocol server configurations
 * Manages both global (~/.claude/mcp.json) and workspace-specific (<workspace>/.claude/mcp.json) configs
 */
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { MCPConfig, MCPServerConfig } from '../../shared/types';

export class MCPService {
  private globalMcpConfigPath: string;
  private workspaceMcpConfigPath: string | null;

  constructor(workspacePath?: string | null) {
    // Global config at ~/.claude/mcp.json
    this.globalMcpConfigPath = path.join(os.homedir(), '.claude', 'mcp.json');

    // Workspace config at <workspace>/.claude/mcp.json
    this.workspaceMcpConfigPath = workspacePath ? path.join(workspacePath, '.claude', 'mcp.json') : null;
  }

  /**
   * Update workspace path (when user changes workspace)
   */
  setWorkspacePath(workspacePath: string | null): void {
    this.workspaceMcpConfigPath = workspacePath ? path.join(workspacePath, '.claude', 'mcp.json') : null;
  }

  /**
   * Get merged config from both scopes (workspace overrides global)
   * Returns empty config { mcpServers: {} } if no files exist
   */
  async getConfig(): Promise<MCPConfig> {
    const globalConfig = await this.readConfigFile(this.globalMcpConfigPath);
    const workspaceConfig = this.workspaceMcpConfigPath
      ? await this.readConfigFile(this.workspaceMcpConfigPath)
      : { mcpServers: {} };

    // Merge configs: workspace overrides global for same server names
    const mergedServers = {
      ...globalConfig.mcpServers,
      ...workspaceConfig.mcpServers
    };

    return { mcpServers: mergedServers };
  }

  /**
   * Get config for specific scope (without merging)
   * @param scope - 'global' or 'workspace'
   * @returns Config for the specified scope
   * @throws Error if workspace scope used without workspace path
   */
  async getConfigByScope(scope: 'global' | 'workspace'): Promise<MCPConfig> {
    if (scope === 'global') {
      return await this.readConfigFile(this.globalMcpConfigPath);
    } else {
      if (!this.workspaceMcpConfigPath) {
        throw new Error('Cannot get workspace config: no workspace path set');
      }
      return await this.readConfigFile(this.workspaceMcpConfigPath);
    }
  }

  /**
   * Update config for specific scope
   * @param config - MCPConfig object to write
   * @param scope - 'global' or 'workspace'
   * @throws Error if workspace scope used without workspace path
   * @throws Error if config validation fails
   */
  async updateConfig(config: MCPConfig, scope: 'global' | 'workspace'): Promise<void> {
    // Validate config structure
    this.validateConfig(config);

    // Determine target path
    let targetPath: string;
    if (scope === 'global') {
      targetPath = this.globalMcpConfigPath;
    } else {
      if (!this.workspaceMcpConfigPath) {
        throw new Error('Cannot update workspace config: no workspace path set');
      }
      targetPath = this.workspaceMcpConfigPath;
    }

    try {
      // Ensure directory exists
      const dir = path.dirname(targetPath);
      await fs.mkdir(dir, { recursive: true });

      // Write JSON with pretty formatting
      await fs.writeFile(targetPath, JSON.stringify(config, null, 2), 'utf-8');
    } catch (error) {
      console.error(`Failed to write MCP config to ${targetPath}:`, error);
      throw error;
    }
  }

  /**
   * Read and parse MCP config file
   * Returns empty config if file doesn't exist or is invalid JSON
   * @param configPath - Path to config file
   */
  private async readConfigFile(configPath: string): Promise<MCPConfig> {
    try {
      const content = await fs.readFile(configPath, 'utf-8');
      const parsed = JSON.parse(content);

      // Validate parsed config
      if (!this.isValidConfig(parsed)) {
        console.error(`Invalid MCP config structure in ${configPath}, skipping`);
        return { mcpServers: {} };
      }

      return parsed;
    } catch (error) {
      // File doesn't exist - return empty config
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return { mcpServers: {} };
      }

      // Invalid JSON - log and return empty config
      console.error(`Failed to parse MCP config from ${configPath}:`, error);
      return { mcpServers: {} };
    }
  }

  /**
   * Validate config structure before writing
   * @throws Error with descriptive message if validation fails
   */
  private validateConfig(config: MCPConfig): void {
    // Check config has mcpServers property
    if (!config || typeof config !== 'object') {
      throw new Error('Config must be an object');
    }

    if (!('mcpServers' in config)) {
      throw new Error('Config must have mcpServers property');
    }

    // Check mcpServers is an object (not array, not null)
    if (typeof config.mcpServers !== 'object' || config.mcpServers === null || Array.isArray(config.mcpServers)) {
      throw new Error('mcpServers must be an object (not array or null)');
    }

    // Validate each server config
    for (const [serverName, serverConfig] of Object.entries(config.mcpServers)) {
      this.validateServerConfig(serverName, serverConfig);
    }
  }

  /**
   * Validate individual server config
   * @throws Error with descriptive message if validation fails
   */
  private validateServerConfig(serverName: string, config: MCPServerConfig): void {
    if (!config || typeof config !== 'object') {
      throw new Error(`Server "${serverName}" config must be an object`);
    }

    // Check type field exists
    if (!('type' in config)) {
      throw new Error(`Server "${serverName}" must have a type field`);
    }

    // Check type is valid
    if (!['stdio', 'sse', 'http'].includes(config.type)) {
      throw new Error(`Server "${serverName}" has invalid type "${config.type}". Must be one of: stdio, sse, http`);
    }

    // Type-specific validation
    if (config.type === 'stdio') {
      if (!('command' in config) || typeof config.command !== 'string') {
        throw new Error(`Server "${serverName}" (stdio) must have a command field (string)`);
      }
    } else if (config.type === 'sse' || config.type === 'http') {
      if (!('url' in config) || typeof config.url !== 'string') {
        throw new Error(`Server "${serverName}" (${config.type}) must have a url field (string)`);
      }
    }
  }

  /**
   * Check if parsed config has valid basic structure (non-throwing version)
   * Used when reading files to decide whether to skip or use
   */
  private isValidConfig(config: unknown): config is MCPConfig {
    if (!config || typeof config !== 'object') {
      return false;
    }

    const configObj = config as Record<string, unknown>;
    if (!('mcpServers' in configObj)) {
      return false;
    }

    if (
      typeof configObj.mcpServers !== 'object' ||
      configObj.mcpServers === null ||
      Array.isArray(configObj.mcpServers)
    ) {
      return false;
    }

    return true;
  }
}
