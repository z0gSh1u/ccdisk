/**
 * Tests for SkillsService
 * 
 * Run with: npx tsx --test src/main/__tests__/skills-service.test.ts
 */
import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { SkillsService } from '../services/skills-service'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'

describe('SkillsService', () => {
  let skillsService: SkillsService
  let tempDir: string
  let globalSkillsDir: string
  let workspaceSkillsDir: string
  let originalHome: string

  beforeEach(async () => {
    // Create temporary test directories
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'skills-test-'))
    originalHome = process.env.HOME || os.homedir()
    
    // Override HOME for testing
    process.env.HOME = tempDir
    
    globalSkillsDir = path.join(tempDir, '.claude', 'skills')
    const workspacePath = path.join(tempDir, 'workspace')
    workspaceSkillsDir = path.join(workspacePath, '.claude', 'skills')
    
    skillsService = new SkillsService(workspacePath)
  })

  afterEach(async () => {
    // Restore original HOME
    process.env.HOME = originalHome
    
    // Clean up test files
    try {
      await fs.rm(tempDir, { recursive: true, force: true })
    } catch (error) {
      // Ignore cleanup errors
    }
  })

  describe('constructor', () => {
    it('should initialize with workspace path', () => {
      const workspacePath = '/test/workspace'
      const service = new SkillsService(workspacePath)
      assert.ok(service)
    })

    it('should initialize without workspace path', () => {
      const service = new SkillsService(null)
      assert.ok(service)
    })

    it('should initialize with undefined workspace path', () => {
      const service = new SkillsService()
      assert.ok(service)
    })
  })

  describe('setWorkspacePath', () => {
    it('should update workspace path', () => {
      const newPath = '/new/workspace'
      skillsService.setWorkspacePath(newPath)
      // Method should not throw
      assert.ok(true)
    })

    it('should accept null workspace path', () => {
      skillsService.setWorkspacePath(null)
      // Method should not throw
      assert.ok(true)
    })
  })

  describe('listSkills', () => {
    it('should return empty array when no directories exist', async () => {
      const skills = await skillsService.listSkills()
      assert.deepEqual(skills, [])
    })

    it('should list global skills', async () => {
      // Create global skills
      await fs.mkdir(globalSkillsDir, { recursive: true })
      await fs.writeFile(path.join(globalSkillsDir, 'skill1.md'), '# Skill 1', 'utf-8')
      await fs.writeFile(path.join(globalSkillsDir, 'skill2.md'), '# Skill 2', 'utf-8')

      const skills = await skillsService.listSkills()
      assert.equal(skills.length, 2)
      assert.equal(skills[0].name, 'skill1')
      assert.equal(skills[0].content, '# Skill 1')
      assert.equal(skills[0].scope, 'global')
      assert.equal(skills[0].path, path.join(globalSkillsDir, 'skill1.md'))
      assert.equal(skills[1].name, 'skill2')
      assert.equal(skills[1].content, '# Skill 2')
      assert.equal(skills[1].scope, 'global')
    })

    it('should list workspace skills', async () => {
      // Create workspace skills
      await fs.mkdir(workspaceSkillsDir, { recursive: true })
      await fs.writeFile(path.join(workspaceSkillsDir, 'workspace-skill.md'), '# Workspace Skill', 'utf-8')

      const skills = await skillsService.listSkills()
      assert.equal(skills.length, 1)
      assert.equal(skills[0].name, 'workspace-skill')
      assert.equal(skills[0].content, '# Workspace Skill')
      assert.equal(skills[0].scope, 'workspace')
      assert.equal(skills[0].path, path.join(workspaceSkillsDir, 'workspace-skill.md'))
    })

    it('should list both global and workspace skills', async () => {
      // Create both global and workspace skills
      await fs.mkdir(globalSkillsDir, { recursive: true })
      await fs.mkdir(workspaceSkillsDir, { recursive: true })
      await fs.writeFile(path.join(globalSkillsDir, 'global-skill.md'), '# Global', 'utf-8')
      await fs.writeFile(path.join(workspaceSkillsDir, 'workspace-skill.md'), '# Workspace', 'utf-8')

      const skills = await skillsService.listSkills()
      assert.equal(skills.length, 2)
      // Global skills should come first
      assert.equal(skills[0].name, 'global-skill')
      assert.equal(skills[0].scope, 'global')
      assert.equal(skills[1].name, 'workspace-skill')
      assert.equal(skills[1].scope, 'workspace')
    })

    it('should skip non-markdown files', async () => {
      await fs.mkdir(globalSkillsDir, { recursive: true })
      await fs.writeFile(path.join(globalSkillsDir, 'skill.md'), '# Skill', 'utf-8')
      await fs.writeFile(path.join(globalSkillsDir, 'readme.txt'), 'Not a skill', 'utf-8')
      await fs.writeFile(path.join(globalSkillsDir, 'config.json'), '{}', 'utf-8')

      const skills = await skillsService.listSkills()
      assert.equal(skills.length, 1)
      assert.equal(skills[0].name, 'skill')
    })

    it('should handle skill with frontmatter', async () => {
      const content = `---
title: Test Skill
author: Test
---

# Skill Content

This is the skill body.`

      await fs.mkdir(globalSkillsDir, { recursive: true })
      await fs.writeFile(path.join(globalSkillsDir, 'frontmatter-skill.md'), content, 'utf-8')

      const skills = await skillsService.listSkills()
      assert.equal(skills.length, 1)
      assert.equal(skills[0].content, content)
    })

    it('should not list workspace skills when no workspace path is set', async () => {
      // Create service without workspace
      const serviceWithoutWorkspace = new SkillsService(null)
      
      await fs.mkdir(globalSkillsDir, { recursive: true })
      await fs.writeFile(path.join(globalSkillsDir, 'global.md'), '# Global', 'utf-8')

      const skills = await serviceWithoutWorkspace.listSkills()
      assert.equal(skills.length, 1)
      assert.equal(skills[0].scope, 'global')
    })
  })

  describe('getSkill', () => {
    it('should return null when skill does not exist', async () => {
      const skill = await skillsService.getSkill('nonexistent', 'global')
      assert.equal(skill, null)
    })

    it('should get global skill', async () => {
      await fs.mkdir(globalSkillsDir, { recursive: true })
      await fs.writeFile(path.join(globalSkillsDir, 'test-skill.md'), '# Test Skill', 'utf-8')

      const skill = await skillsService.getSkill('test-skill', 'global')
      assert.ok(skill)
      assert.equal(skill.name, 'test-skill')
      assert.equal(skill.content, '# Test Skill')
      assert.equal(skill.scope, 'global')
      assert.equal(skill.path, path.join(globalSkillsDir, 'test-skill.md'))
    })

    it('should get workspace skill', async () => {
      await fs.mkdir(workspaceSkillsDir, { recursive: true })
      await fs.writeFile(path.join(workspaceSkillsDir, 'ws-skill.md'), '# Workspace Skill', 'utf-8')

      const skill = await skillsService.getSkill('ws-skill', 'workspace')
      assert.ok(skill)
      assert.equal(skill.name, 'ws-skill')
      assert.equal(skill.content, '# Workspace Skill')
      assert.equal(skill.scope, 'workspace')
    })

    it('should handle skill name with .md extension', async () => {
      await fs.mkdir(globalSkillsDir, { recursive: true })
      await fs.writeFile(path.join(globalSkillsDir, 'skill.md'), '# Skill', 'utf-8')

      const skill = await skillsService.getSkill('skill.md', 'global')
      assert.ok(skill)
      assert.equal(skill.name, 'skill')
    })

    it('should throw when workspace scope is used without workspace path', async () => {
      const serviceWithoutWorkspace = new SkillsService(null)
      
      await assert.rejects(
        async () => await serviceWithoutWorkspace.getSkill('test', 'workspace'),
        { message: 'No workspace path set' }
      )
    })
  })

  describe('createSkill', () => {
    it('should create global skill', async () => {
      const skill = await skillsService.createSkill('new-skill', '# New Skill', 'global')
      
      assert.equal(skill.name, 'new-skill')
      assert.equal(skill.content, '# New Skill')
      assert.equal(skill.scope, 'global')
      assert.equal(skill.path, path.join(globalSkillsDir, 'new-skill.md'))

      // Verify file was created
      const content = await fs.readFile(path.join(globalSkillsDir, 'new-skill.md'), 'utf-8')
      assert.equal(content, '# New Skill')
    })

    it('should create workspace skill', async () => {
      const skill = await skillsService.createSkill('ws-skill', '# Workspace', 'workspace')
      
      assert.equal(skill.name, 'ws-skill')
      assert.equal(skill.scope, 'workspace')

      // Verify file was created
      const content = await fs.readFile(path.join(workspaceSkillsDir, 'ws-skill.md'), 'utf-8')
      assert.equal(content, '# Workspace')
    })

    it('should create directory if it does not exist', async () => {
      const skill = await skillsService.createSkill('test', '# Test', 'global')
      
      assert.ok(skill)
      const dirExists = await fs.access(globalSkillsDir).then(() => true).catch(() => false)
      assert.equal(dirExists, true)
    })

    it('should throw when skill already exists', async () => {
      await fs.mkdir(globalSkillsDir, { recursive: true })
      await fs.writeFile(path.join(globalSkillsDir, 'existing.md'), '# Existing', 'utf-8')

      await assert.rejects(
        async () => await skillsService.createSkill('existing', '# New', 'global'),
        { message: 'Skill "existing" already exists in global scope' }
      )
    })

    it('should handle name with .md extension', async () => {
      const skill = await skillsService.createSkill('skill.md', '# Skill', 'global')
      
      assert.equal(skill.name, 'skill')
      
      // Verify only one .md extension
      const files = await fs.readdir(globalSkillsDir)
      assert.deepEqual(files, ['skill.md'])
    })

    it('should throw when workspace scope is used without workspace path', async () => {
      const serviceWithoutWorkspace = new SkillsService(null)
      
      await assert.rejects(
        async () => await serviceWithoutWorkspace.createSkill('test', '# Test', 'workspace'),
        { message: 'No workspace path set' }
      )
    })

    it('should create skill with frontmatter', async () => {
      const content = `---
title: Frontmatter Skill
---

# Content`

      const skill = await skillsService.createSkill('frontmatter', content, 'global')
      assert.equal(skill.content, content)
      
      const fileContent = await fs.readFile(path.join(globalSkillsDir, 'frontmatter.md'), 'utf-8')
      assert.equal(fileContent, content)
    })
  })

  describe('updateSkill', () => {
    it('should update existing global skill', async () => {
      // Create initial skill
      await fs.mkdir(globalSkillsDir, { recursive: true })
      await fs.writeFile(path.join(globalSkillsDir, 'skill.md'), '# Old Content', 'utf-8')

      const skill = await skillsService.updateSkill('skill', '# New Content', 'global')
      
      assert.equal(skill.name, 'skill')
      assert.equal(skill.content, '# New Content')
      assert.equal(skill.scope, 'global')

      // Verify file was updated
      const content = await fs.readFile(path.join(globalSkillsDir, 'skill.md'), 'utf-8')
      assert.equal(content, '# New Content')
    })

    it('should update existing workspace skill', async () => {
      // Create initial skill
      await fs.mkdir(workspaceSkillsDir, { recursive: true })
      await fs.writeFile(path.join(workspaceSkillsDir, 'skill.md'), '# Old', 'utf-8')

      const skill = await skillsService.updateSkill('skill', '# New', 'workspace')
      
      assert.equal(skill.content, '# New')
      assert.equal(skill.scope, 'workspace')
    })

    it('should throw when skill does not exist', async () => {
      await assert.rejects(
        async () => await skillsService.updateSkill('nonexistent', '# New', 'global'),
        { message: 'Skill "nonexistent" not found in global scope' }
      )
    })

    it('should handle name with .md extension', async () => {
      await fs.mkdir(globalSkillsDir, { recursive: true })
      await fs.writeFile(path.join(globalSkillsDir, 'skill.md'), '# Old', 'utf-8')

      const skill = await skillsService.updateSkill('skill.md', '# New', 'global')
      assert.equal(skill.name, 'skill')
      assert.equal(skill.content, '# New')
    })

    it('should throw when workspace scope is used without workspace path', async () => {
      const serviceWithoutWorkspace = new SkillsService(null)
      
      await assert.rejects(
        async () => await serviceWithoutWorkspace.updateSkill('test', '# New', 'workspace'),
        { message: 'No workspace path set' }
      )
    })
  })

  describe('deleteSkill', () => {
    it('should delete global skill', async () => {
      // Create skill
      await fs.mkdir(globalSkillsDir, { recursive: true })
      await fs.writeFile(path.join(globalSkillsDir, 'to-delete.md'), '# Delete Me', 'utf-8')

      await skillsService.deleteSkill('to-delete', 'global')

      // Verify file was deleted
      const exists = await fs.access(path.join(globalSkillsDir, 'to-delete.md'))
        .then(() => true)
        .catch(() => false)
      assert.equal(exists, false)
    })

    it('should delete workspace skill', async () => {
      // Create skill
      await fs.mkdir(workspaceSkillsDir, { recursive: true })
      await fs.writeFile(path.join(workspaceSkillsDir, 'to-delete.md'), '# Delete', 'utf-8')

      await skillsService.deleteSkill('to-delete', 'workspace')

      // Verify file was deleted
      const exists = await fs.access(path.join(workspaceSkillsDir, 'to-delete.md'))
        .then(() => true)
        .catch(() => false)
      assert.equal(exists, false)
    })

    it('should throw when skill does not exist', async () => {
      await assert.rejects(
        async () => await skillsService.deleteSkill('nonexistent', 'global'),
        { message: 'Skill "nonexistent" not found in global scope' }
      )
    })

    it('should handle name with .md extension', async () => {
      await fs.mkdir(globalSkillsDir, { recursive: true })
      await fs.writeFile(path.join(globalSkillsDir, 'skill.md'), '# Skill', 'utf-8')

      await skillsService.deleteSkill('skill.md', 'global')

      const exists = await fs.access(path.join(globalSkillsDir, 'skill.md'))
        .then(() => true)
        .catch(() => false)
      assert.equal(exists, false)
    })

    it('should throw when workspace scope is used without workspace path', async () => {
      const serviceWithoutWorkspace = new SkillsService(null)
      
      await assert.rejects(
        async () => await serviceWithoutWorkspace.deleteSkill('test', 'workspace'),
        { message: 'No workspace path set' }
      )
    })
  })

  describe('edge cases', () => {
    it('should handle skill names with special characters', async () => {
      const name = 'my-skill_v2.0'
      const skill = await skillsService.createSkill(name, '# Skill', 'global')
      
      assert.equal(skill.name, name)
      
      const retrieved = await skillsService.getSkill(name, 'global')
      assert.ok(retrieved)
      assert.equal(retrieved.name, name)
    })

    it('should handle empty skill content', async () => {
      const skill = await skillsService.createSkill('empty', '', 'global')
      assert.equal(skill.content, '')
      
      const content = await fs.readFile(path.join(globalSkillsDir, 'empty.md'), 'utf-8')
      assert.equal(content, '')
    })

    it('should handle large skill content', async () => {
      const largeContent = '# Large Skill\n\n' + 'x'.repeat(10000)
      const skill = await skillsService.createSkill('large', largeContent, 'global')
      
      assert.equal(skill.content, largeContent)
      
      const retrieved = await skillsService.getSkill('large', 'global')
      assert.ok(retrieved)
      assert.equal(retrieved.content, largeContent)
    })

    it('should handle Unicode content', async () => {
      const unicodeContent = '# 技能 Skill 🚀\n\nこんにちは 世界'
      const skill = await skillsService.createSkill('unicode', unicodeContent, 'global')
      
      assert.equal(skill.content, unicodeContent)
      
      const retrieved = await skillsService.getSkill('unicode', 'global')
      assert.ok(retrieved)
      assert.equal(retrieved.content, unicodeContent)
    })

    it('should handle newlines in content', async () => {
      const content = 'Line 1\n\nLine 2\n\n\nLine 3'
      const skill = await skillsService.createSkill('newlines', content, 'global')
      
      assert.equal(skill.content, content)
    })
  })
})
