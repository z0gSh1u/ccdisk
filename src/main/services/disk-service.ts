/**
 * Disk Service - Manages Disk (盘片) definitions and switching
 *
 * Disks are stored as directories under ~/.ccdisk/disks/{diskId}/disk.json
 * Skills, Commands, and MCP servers live in central pools.
 * The Default Disk transparently passes through to ~/.claude/ paths.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, rmSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

import { DatabaseService } from './db-service';

import type { DiskDefinition, Skill, MCPConfig, MCPServerConfig } from '../../shared/types';

export class DiskService {
  private baseDir: string;
  private disksDir: string;
  private skillsPoolDir: string;
  private commandsPoolDir: string;
  private mcpPoolPath: string;
  private dbService: DatabaseService;

  constructor(dbService: DatabaseService) {
    this.baseDir = join(homedir(), '.ccdisk');
    this.disksDir = join(this.baseDir, 'disks');
    this.skillsPoolDir = join(this.baseDir, 'skills');
    this.commandsPoolDir = join(this.baseDir, 'commands');
    this.mcpPoolPath = join(this.baseDir, 'mcp-servers.json');
    this.dbService = dbService;
  }

  /**
   * Initialize disk directories and write built-in disks on first run
   */
  async initialize(): Promise<void> {
    // Ensure directories exist
    for (const dir of [this.disksDir, this.skillsPoolDir, this.commandsPoolDir]) {
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
    }

    // Create MCP pool file if not exists
    if (!existsSync(this.mcpPoolPath)) {
      writeFileSync(this.mcpPoolPath, JSON.stringify({}, null, 2), 'utf-8');
    }

    // Write built-in disks if they don't exist
    for (const disk of BUILTIN_DISKS) {
      const diskDir = join(this.disksDir, disk.id);
      if (!existsSync(diskDir)) {
        mkdirSync(diskDir, { recursive: true });
        writeFileSync(join(diskDir, 'disk.json'), JSON.stringify(disk, null, 2), 'utf-8');
      }
    }

    // Set default currentDiskId if not set
    const current = await this.dbService.getSetting('currentDiskId');
    if (!current) {
      await this.dbService.setSetting('currentDiskId', 'default');
    }
  }

  async listDisks(): Promise<DiskDefinition[]> {
    const disks: DiskDefinition[] = [];

    if (!existsSync(this.disksDir)) return disks;

    const entries = readdirSync(this.disksDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const diskJsonPath = join(this.disksDir, entry.name, 'disk.json');
      if (!existsSync(diskJsonPath)) continue;

      try {
        const raw = readFileSync(diskJsonPath, 'utf-8');
        const disk = JSON.parse(raw) as DiskDefinition;
        disk.id = entry.name;
        disks.push(disk);
      } catch (error) {
        console.error(`Failed to read disk ${entry.name}:`, error);
      }
    }

    // Sort: default first, then built-in, then custom
    return disks.sort((a, b) => {
      if (a.isDefault) return -1;
      if (b.isDefault) return 1;
      if (a.builtIn && !b.builtIn) return -1;
      if (!a.builtIn && b.builtIn) return 1;
      return a.name.localeCompare(b.name);
    });
  }

  async getDisk(diskId: string): Promise<DiskDefinition> {
    const diskDir = this.resolveDiskDir(diskId);
    const diskJsonPath = join(diskDir, 'disk.json');
    if (!existsSync(diskJsonPath)) {
      throw new Error(`Disk not found: ${diskId}`);
    }
    const raw = readFileSync(diskJsonPath, 'utf-8');
    const disk = JSON.parse(raw) as DiskDefinition;
    disk.id = diskId;
    return disk;
  }

  /**
   * Resolve and validate disk directory path to prevent path traversal
   */
  private resolveDiskDir(diskId: string): string {
    const resolved = join(this.disksDir, diskId);
    if (!resolved.startsWith(this.disksDir + '/')) {
      throw new Error(`Invalid disk ID: ${diskId}`);
    }
    return resolved;
  }

  async getCurrentDisk(): Promise<DiskDefinition> {
    const currentId = (await this.dbService.getSetting('currentDiskId')) || 'default';
    return this.getDisk(currentId);
  }

  async getCurrentDiskId(): Promise<string> {
    return (await this.dbService.getSetting('currentDiskId')) || 'default';
  }

  async switchDisk(diskId: string): Promise<DiskDefinition> {
    // Verify disk exists
    const disk = await this.getDisk(diskId);
    await this.dbService.setSetting('currentDiskId', diskId);
    return disk;
  }

  async createDisk(input: Omit<DiskDefinition, 'id' | 'builtIn'>): Promise<DiskDefinition> {
    const id = input.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

    if (!id) throw new Error('Invalid disk name');

    const diskDir = join(this.disksDir, id);
    if (existsSync(diskDir)) {
      throw new Error(`Disk already exists: ${id}`);
    }

    const disk: DiskDefinition = {
      ...input,
      id,
      builtIn: false,
      isDefault: undefined // Only the built-in default disk should have isDefault
    };

    mkdirSync(diskDir, { recursive: true });
    writeFileSync(join(diskDir, 'disk.json'), JSON.stringify(disk, null, 2), 'utf-8');

    return disk;
  }

  async updateDisk(diskId: string, updates: Partial<DiskDefinition>): Promise<DiskDefinition> {
    const existing = await this.getDisk(diskId);

    // Don't allow changing id, builtIn, or isDefault status
    const updated: DiskDefinition = {
      ...existing,
      ...updates,
      id: diskId,
      builtIn: existing.builtIn,
      isDefault: existing.isDefault
    };

    const diskJsonPath = join(this.resolveDiskDir(diskId), 'disk.json');
    writeFileSync(diskJsonPath, JSON.stringify(updated, null, 2), 'utf-8');

    return updated;
  }

  async deleteDisk(diskId: string): Promise<void> {
    const disk = await this.getDisk(diskId);
    if (disk.builtIn) {
      throw new Error('Cannot delete built-in disk');
    }

    // If this is the current disk, switch to default
    const currentId = await this.getCurrentDiskId();
    if (currentId === diskId) {
      await this.dbService.setSetting('currentDiskId', 'default');
    }

    const diskDir = this.resolveDiskDir(diskId);
    rmSync(diskDir, { recursive: true, force: true });
  }

  async duplicateDisk(diskId: string, newName: string): Promise<DiskDefinition> {
    const source = await this.getDisk(diskId);
    return this.createDisk({
      name: newName,
      description: source.description,
      icon: source.icon,
      systemPrompt: source.systemPrompt,
      model: source.model,
      skills: [...source.skills],
      commands: [...source.commands],
      mcpServers: [...source.mcpServers]
    });
  }

  // --- Pool queries ---

  /**
   * List all skills in the pool (~/.ccdisk/skills/)
   */
  async listPoolSkills(): Promise<Skill[]> {
    return this.readPoolSkills();
  }

  private readPoolSkills(): Skill[] {
    const skills: Skill[] = [];
    if (!existsSync(this.skillsPoolDir)) return skills;

    const entries = readdirSync(this.skillsPoolDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const skillMdPath = join(this.skillsPoolDir, entry.name, 'SKILL.md');
      if (!existsSync(skillMdPath)) continue;

      try {
        const content = readFileSync(skillMdPath, 'utf-8');
        skills.push({
          name: entry.name,
          content,
          scope: 'global',
          path: skillMdPath
        });
      } catch (error) {
        console.error(`Failed to read pool skill ${entry.name}:`, error);
      }
    }
    return skills;
  }

  /**
   * List all commands in the pool (~/.ccdisk/commands/)
   */
  async listPoolCommands(): Promise<Array<{ name: string; path: string }>> {
    const commands: Array<{ name: string; path: string }> = [];
    if (!existsSync(this.commandsPoolDir)) return commands;

    const entries = readdirSync(this.commandsPoolDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      if (entry.name.startsWith('.')) continue;
      commands.push({
        name: entry.name.replace(/\.md$/, ''),
        path: join(this.commandsPoolDir, entry.name)
      });
    }
    return commands;
  }

  /**
   * Read the MCP server pool (~/.ccdisk/mcp-servers.json)
   */
  async listPoolMCPServers(): Promise<Record<string, MCPServerConfig>> {
    if (!existsSync(this.mcpPoolPath)) return {};
    try {
      const raw = readFileSync(this.mcpPoolPath, 'utf-8');
      return JSON.parse(raw) as Record<string, MCPServerConfig>;
    } catch {
      return {};
    }
  }

  /**
   * Get the active Skills for the current disk.
   * Default disk: reads from ~/.claude/skills/ (existing behavior)
   * Other disks: reads from pool, filtered by disk's skills[] references
   */
  async getActiveSkillsForDisk(diskId: string): Promise<Skill[]> {
    const disk = await this.getDisk(diskId);

    if (disk.isDefault) {
      // Transparent pass-through — return empty, let existing SkillsService handle it
      return [];
    }

    const allPoolSkills = this.readPoolSkills();
    return allPoolSkills.filter((s) => disk.skills.includes(s.name));
  }

  /**
   * Get active MCP config for the current disk.
   * Default disk: returns empty (let existing MCPService handle it)
   * Other disks: returns filtered pool entries
   */
  async getActiveMCPForDisk(diskId: string): Promise<MCPConfig> {
    const disk = await this.getDisk(diskId);

    if (disk.isDefault) {
      return { mcpServers: {} };
    }

    const allServers = await this.listPoolMCPServers();
    const filtered: Record<string, MCPServerConfig> = {};
    for (const name of disk.mcpServers) {
      if (allServers[name]) {
        filtered[name] = allServers[name];
      }
    }
    return { mcpServers: filtered };
  }
}

// --- Built-in Disk Templates ---

const BUILTIN_DISKS: DiskDefinition[] = [
  {
    id: 'default',
    name: 'Default',
    description: 'General purpose mode using your global configuration',
    icon: 'disc',
    builtIn: true,
    isDefault: true,
    systemPrompt: null,
    model: null,
    skills: [],
    commands: [],
    mcpServers: []
  },
  {
    id: 'coding',
    name: 'Coding',
    description: 'Software development and debugging',
    icon: 'code',
    builtIn: true,
    systemPrompt:
      'You are an expert software engineer. Follow clean code principles, write tests first when possible, and explain your reasoning clearly. Prefer simple solutions over complex ones.',
    model: null,
    skills: ['frontend-design', 'react-best-practices', 'mcp-builder', 'playwright'],
    commands: [],
    mcpServers: ['filesystem', 'github']
  },
  {
    id: 'data',
    name: 'Data',
    description: 'Data processing and analysis',
    icon: 'database',
    builtIn: true,
    systemPrompt:
      'You are a data analyst and engineer. Focus on data quality, clear visualizations, and reproducible analysis. Explain statistical methods and assumptions.',
    model: null,
    skills: ['csv-data-summarizer', 'xlsx', 'postgres-best-practices'],
    commands: [],
    mcpServers: ['filesystem']
  },
  {
    id: 'writing',
    name: 'Writing',
    description: 'Professional document creation and editing',
    icon: 'pen-tool',
    builtIn: true,
    systemPrompt:
      'You are a professional writer and editor. Focus on clarity, structure, and precision. Use active voice. Eliminate unnecessary words. Adapt tone to the audience.',
    model: null,
    skills: ['docx', 'pdf', 'pptx', 'markdown-to-epub'],
    commands: [],
    mcpServers: ['filesystem']
  }
];
