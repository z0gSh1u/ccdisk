/**
 * Skills service for managing Claude Code skill markdown files
 * Global skills: ~/.claude/skills/
 * Workspace skills: <workspace>/.claude/skills/
 */
import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import { Skill } from '../../shared/types'

export class SkillsService {
  private globalSkillsDir: string
  private workspaceSkillsDir: string | null

  constructor(workspacePath?: string | null) {
    // Global skills directory
    this.globalSkillsDir = path.join(os.homedir(), '.claude', 'skills')
    
    // Workspace skills directory (if workspace is set)
    this.workspaceSkillsDir = workspacePath 
      ? path.join(workspacePath, '.claude', 'skills')
      : null
  }

  /**
   * Update workspace path (when user changes workspace)
   */
  setWorkspacePath(workspacePath: string | null): void {
    this.workspaceSkillsDir = workspacePath
      ? path.join(workspacePath, '.claude', 'skills')
      : null
  }

  /**
   * List all skills from both global and workspace scopes
   * Returns global skills first, then workspace skills
   */
  async listSkills(): Promise<Skill[]> {
    const skills: Skill[] = []

    // Read global skills
    try {
      const globalFiles = await fs.readdir(this.globalSkillsDir)
      for (const file of globalFiles) {
        if (file.endsWith('.md')) {
          const skillPath = path.join(this.globalSkillsDir, file)
          try {
            const content = await fs.readFile(skillPath, 'utf-8')
            const name = file.replace(/\.md$/, '')
            skills.push({
              name,
              content,
              scope: 'global',
              path: skillPath
            })
          } catch (error) {
            console.error(`Failed to read skill file ${skillPath}:`, error)
            // Skip this file and continue
          }
        }
      }
    } catch (error) {
      // Directory doesn't exist - that's fine, just skip
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.error('Failed to read global skills directory:', error)
      }
    }

    // Read workspace skills (if workspace is set)
    if (this.workspaceSkillsDir) {
      try {
        const workspaceFiles = await fs.readdir(this.workspaceSkillsDir)
        for (const file of workspaceFiles) {
          if (file.endsWith('.md')) {
            const skillPath = path.join(this.workspaceSkillsDir, file)
            try {
              const content = await fs.readFile(skillPath, 'utf-8')
              const name = file.replace(/\.md$/, '')
              skills.push({
                name,
                content,
                scope: 'workspace',
                path: skillPath
              })
            } catch (error) {
              console.error(`Failed to read skill file ${skillPath}:`, error)
              // Skip this file and continue
            }
          }
        }
      } catch (error) {
        // Directory doesn't exist - that's fine, just skip
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          console.error('Failed to read workspace skills directory:', error)
        }
      }
    }

    return skills
  }

  /**
   * Get specific skill by name and scope
   */
  async getSkill(name: string, scope: 'global' | 'workspace'): Promise<Skill | null> {
    const dir = this.getSkillsDir(scope)
    const fileName = this.ensureMdExtension(name)
    const skillPath = path.join(dir, fileName)

    try {
      const content = await fs.readFile(skillPath, 'utf-8')
      const skillName = fileName.replace(/\.md$/, '')
      return {
        name: skillName,
        content,
        scope,
        path: skillPath
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null
      }
      console.error(`Failed to read skill ${name} from ${scope}:`, error)
      throw error
    }
  }

  /**
   * Create new skill
   * Throws if skill already exists
   */
  async createSkill(name: string, content: string, scope: 'global' | 'workspace'): Promise<Skill> {
    const dir = this.getSkillsDir(scope)
    const fileName = this.ensureMdExtension(name)
    const skillPath = path.join(dir, fileName)

    // Check if skill already exists
    try {
      await fs.access(skillPath)
      throw new Error(`Skill "${name}" already exists in ${scope} scope`)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error
      }
      // File doesn't exist - good, we can create it
    }

    // Ensure directory exists
    try {
      await fs.mkdir(dir, { recursive: true })
    } catch (error) {
      console.error(`Failed to create skills directory ${dir}:`, error)
      throw new Error(`Failed to create skills directory: ${error}`)
    }

    // Write skill file
    try {
      await fs.writeFile(skillPath, content, 'utf-8')
      const skillName = fileName.replace(/\.md$/, '')
      return {
        name: skillName,
        content,
        scope,
        path: skillPath
      }
    } catch (error) {
      console.error(`Failed to create skill ${name}:`, error)
      throw new Error(`Failed to create skill: ${error}`)
    }
  }

  /**
   * Update existing skill
   * Throws if skill doesn't exist
   */
  async updateSkill(name: string, content: string, scope: 'global' | 'workspace'): Promise<Skill> {
    const dir = this.getSkillsDir(scope)
    const fileName = this.ensureMdExtension(name)
    const skillPath = path.join(dir, fileName)

    // Check if skill exists
    try {
      await fs.access(skillPath)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new Error(`Skill "${name}" not found in ${scope} scope`)
      }
      throw error
    }

    // Write updated content
    try {
      await fs.writeFile(skillPath, content, 'utf-8')
      const skillName = fileName.replace(/\.md$/, '')
      return {
        name: skillName,
        content,
        scope,
        path: skillPath
      }
    } catch (error) {
      console.error(`Failed to update skill ${name}:`, error)
      throw new Error(`Failed to update skill: ${error}`)
    }
  }

  /**
   * Delete skill
   * Throws if skill doesn't exist
   */
  async deleteSkill(name: string, scope: 'global' | 'workspace'): Promise<void> {
    const dir = this.getSkillsDir(scope)
    const fileName = this.ensureMdExtension(name)
    const skillPath = path.join(dir, fileName)

    try {
      await fs.unlink(skillPath)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new Error(`Skill "${name}" not found in ${scope} scope`)
      }
      console.error(`Failed to delete skill ${name}:`, error)
      throw new Error(`Failed to delete skill: ${error}`)
    }
  }

  /**
   * Get skills directory for given scope
   * Throws if workspace scope is requested but no workspace path is set
   */
  private getSkillsDir(scope: 'global' | 'workspace'): string {
    if (scope === 'global') {
      return this.globalSkillsDir
    } else if (scope === 'workspace') {
      if (!this.workspaceSkillsDir) {
        throw new Error('No workspace path set')
      }
      return this.workspaceSkillsDir
    } else {
      throw new Error(`Invalid scope: ${scope}`)
    }
  }

  /**
   * Ensure filename has .md extension
   */
  private ensureMdExtension(name: string): string {
    return name.endsWith('.md') ? name : `${name}.md`
  }
}
