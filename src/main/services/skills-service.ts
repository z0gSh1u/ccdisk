/**
 * Skills service for managing Claude Code skill markdown files
 * Global skills: ~/.claude/skills/
 * Workspace skills: <workspace>/.claude/skills/
 */
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { Skill } from '../../shared/types';

export class SkillsService {
  private globalSkillsDir: string;
  private workspaceSkillsDir: string | null;

  constructor(workspacePath?: string | null) {
    // Global skills directory
    this.globalSkillsDir = path.join(os.homedir(), '.claude', 'skills');

    // Workspace skills directory (if workspace is set)
    this.workspaceSkillsDir = workspacePath ? path.join(workspacePath, '.claude', 'skills') : null;
  }

  /**
   * Update workspace path (when user changes workspace)
   */
  setWorkspacePath(workspacePath: string | null): void {
    this.workspaceSkillsDir = workspacePath ? path.join(workspacePath, '.claude', 'skills') : null;
  }

  /**
   * List all skills from both global and workspace scopes
   * Returns global skills first, then workspace skills
   */
  async listSkills(): Promise<Skill[]> {
    const skills: Skill[] = [];

    const readSkillFile = async (skillPath: string, name: string, scope: 'global' | 'workspace') => {
      try {
        const content = await fs.readFile(skillPath, 'utf-8');
        const { frontmatter, body } = this.parseFrontmatter(content);
        skills.push({
          name,
          content,
          scope,
          path: skillPath,
          frontmatter,
          body
        });
      } catch (error) {
        console.error(`Failed to read skill file ${skillPath}:`, error);
      }
    };

    const collectSkillsFromDir = async (dir: string, scope: 'global' | 'workspace') => {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const entryPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          const skillPath = path.join(entryPath, 'SKILL.md');
          await readSkillFile(skillPath, entry.name, scope);
          continue;
        }

        if (entry.isSymbolicLink()) {
          try {
            const targetStats = await fs.stat(entryPath);
            if (targetStats.isDirectory()) {
              const skillPath = path.join(entryPath, 'SKILL.md');
              await readSkillFile(skillPath, entry.name, scope);
            }
          } catch (error) {
            console.error(`Failed to resolve skill link ${entryPath}:`, error);
          }
        }
      }
    };

    // Read global skills
    try {
      await collectSkillsFromDir(this.globalSkillsDir, 'global');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.error('Failed to read global skills directory:', error);
      }
    }

    // Read workspace skills (if workspace is set)
    if (this.workspaceSkillsDir) {
      try {
        await collectSkillsFromDir(this.workspaceSkillsDir, 'workspace');
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          console.error('Failed to read workspace skills directory:', error);
        }
      }
    }

    return skills;
  }

  private parseFrontmatter(content: string): { frontmatter?: Record<string, unknown>; body?: string } {
    const trimmed = content.trimStart();
    if (!trimmed.startsWith('---\n') && !trimmed.startsWith('---\r\n')) {
      return { body: content };
    }

    const endIndex = trimmed.indexOf('\n---', 4);
    const endIndexCrlf = trimmed.indexOf('\r\n---', 4);
    const endMarkerIndex = endIndex === -1 ? endIndexCrlf : endIndex;
    if (endMarkerIndex === -1) {
      return { body: content };
    }

    const frontmatterRaw = trimmed.slice(4, endMarkerIndex).trim();
    const bodyStart = trimmed.slice(endMarkerIndex + 4);
    const body = bodyStart.replace(/^\r?\n/, '');

    return {
      frontmatter: this.parseYamlFrontmatter(frontmatterRaw),
      body
    };
  }

  private parseYamlFrontmatter(raw: string): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    if (!raw) return result;

    const lines = raw.split(/\r?\n/);
    let currentKey: string | null = null;
    let currentList: string[] = [];

    const flushList = () => {
      if (currentKey) {
        result[currentKey] = [...currentList];
      }
      currentKey = null;
      currentList = [];
    };

    for (const line of lines) {
      const trimmedLine = line.trim();
      if (!trimmedLine) continue;

      if (trimmedLine.startsWith('- ')) {
        if (!currentKey) continue;
        currentList.push(trimmedLine.slice(2).trim());
        continue;
      }

      if (currentKey) {
        flushList();
      }

      const separatorIndex = trimmedLine.indexOf(':');
      if (separatorIndex === -1) continue;

      const key = trimmedLine.slice(0, separatorIndex).trim();
      const value = trimmedLine.slice(separatorIndex + 1).trim();

      if (!key) continue;

      if (value === '') {
        currentKey = key;
        currentList = [];
      } else {
        const normalizedValue = value.replace(/^['"]|['"]$/g, '');
        if (normalizedValue === 'true') result[key] = true;
        else if (normalizedValue === 'false') result[key] = false;
        else if (!Number.isNaN(Number(normalizedValue)) && normalizedValue !== '') {
          result[key] = Number(normalizedValue);
        } else {
          result[key] = normalizedValue;
        }
      }
    }

    if (currentKey) {
      flushList();
    }

    return result;
  }

  /**
   * Get specific skill by name and scope
   */
  async getSkill(name: string, scope: 'global' | 'workspace'): Promise<Skill | null> {
    const dir = this.getSkillsDir(scope);
    const fileName = this.ensureMdExtension(name);
    const skillPath = path.join(dir, fileName);

    try {
      const content = await fs.readFile(skillPath, 'utf-8');
      const skillName = fileName.replace(/\.md$/, '');
      return {
        name: skillName,
        content,
        scope,
        path: skillPath
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      console.error(`Failed to read skill ${name} from ${scope}:`, error);
      throw error;
    }
  }

  /**
   * Create new skill
   * Throws if skill already exists
   */
  async createSkill(name: string, content: string, scope: 'global' | 'workspace'): Promise<Skill> {
    const dir = this.getSkillsDir(scope);
    const fileName = this.ensureMdExtension(name);
    const skillPath = path.join(dir, fileName);

    // Check if skill already exists
    try {
      await fs.access(skillPath);
      throw new Error(`Skill "${name}" already exists in ${scope} scope`);
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
      console.error(`Failed to create skills directory ${dir}:`, error);
      throw new Error(`Failed to create skills directory: ${error}`);
    }

    // Write skill file
    try {
      await fs.writeFile(skillPath, content, 'utf-8');
      const skillName = fileName.replace(/\.md$/, '');
      return {
        name: skillName,
        content,
        scope,
        path: skillPath
      };
    } catch (error) {
      console.error(`Failed to create skill ${name}:`, error);
      throw new Error(`Failed to create skill: ${error}`);
    }
  }

  /**
   * Update existing skill
   * Throws if skill doesn't exist
   */
  async updateSkill(name: string, content: string, scope: 'global' | 'workspace'): Promise<Skill> {
    const dir = this.getSkillsDir(scope);
    const fileName = this.ensureMdExtension(name);
    const skillPath = path.join(dir, fileName);

    // Check if skill exists
    try {
      await fs.access(skillPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new Error(`Skill "${name}" not found in ${scope} scope`);
      }
      throw error;
    }

    // Write updated content
    try {
      await fs.writeFile(skillPath, content, 'utf-8');
      const skillName = fileName.replace(/\.md$/, '');
      return {
        name: skillName,
        content,
        scope,
        path: skillPath
      };
    } catch (error) {
      console.error(`Failed to update skill ${name}:`, error);
      throw new Error(`Failed to update skill: ${error}`);
    }
  }

  /**
   * Delete skill
   * Throws if skill doesn't exist
   */
  async deleteSkill(name: string, scope: 'global' | 'workspace'): Promise<void> {
    const dir = this.getSkillsDir(scope);
    const fileName = this.ensureMdExtension(name);
    const skillPath = path.join(dir, fileName);

    try {
      await fs.unlink(skillPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new Error(`Skill "${name}" not found in ${scope} scope`);
      }
      console.error(`Failed to delete skill ${name}:`, error);
      throw new Error(`Failed to delete skill: ${error}`);
    }
  }

  /**
   * Get skills directory for given scope
   * Throws if workspace scope is requested but no workspace path is set
   */
  private getSkillsDir(scope: 'global' | 'workspace'): string {
    if (scope === 'global') {
      return this.globalSkillsDir;
    } else if (scope === 'workspace') {
      if (!this.workspaceSkillsDir) {
        throw new Error('No workspace path set');
      }
      return this.workspaceSkillsDir;
    } else {
      throw new Error(`Invalid scope: ${scope}`);
    }
  }

  /**
   * Ensure filename has .md extension
   */
  private ensureMdExtension(name: string): string {
    return name.endsWith('.md') ? name : `${name}.md`;
  }
}
