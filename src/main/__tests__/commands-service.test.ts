/**
 * Tests for CommandsService
 * 
 * Run with: npx tsx --test src/main/__tests__/commands-service.test.ts
 */
import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { CommandsService } from '../services/commands-service'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'

describe('CommandsService', () => {
  let commandsService: CommandsService
  let tempDir: string
  let globalCommandsDir: string
  let workspaceCommandsDir: string
  let originalHome: string

  beforeEach(async () => {
    // Create temporary test directories
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'commands-test-'))
    originalHome = process.env.HOME || os.homedir()
    
    // Override HOME for testing
    process.env.HOME = tempDir
    
    globalCommandsDir = path.join(tempDir, '.claude', 'commands')
    const workspacePath = path.join(tempDir, 'workspace')
    workspaceCommandsDir = path.join(workspacePath, '.claude', 'commands')
    
    commandsService = new CommandsService(workspacePath)
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
      const service = new CommandsService(workspacePath)
      assert.ok(service)
    })

    it('should initialize without workspace path', () => {
      const service = new CommandsService(null)
      assert.ok(service)
    })

    it('should initialize with undefined workspace path', () => {
      const service = new CommandsService()
      assert.ok(service)
    })
  })

  describe('setWorkspacePath', () => {
    it('should update workspace path', () => {
      const newPath = '/new/workspace'
      commandsService.setWorkspacePath(newPath)
      // Method should not throw
      assert.ok(true)
    })

    it('should accept null workspace path', () => {
      commandsService.setWorkspacePath(null)
      // Method should not throw
      assert.ok(true)
    })
  })

  describe('listCommands', () => {
    it('should return empty array when no directories exist', async () => {
      const commands = await commandsService.listCommands()
      assert.deepEqual(commands, [])
    })

    it('should list global commands', async () => {
      // Create global commands
      await fs.mkdir(globalCommandsDir, { recursive: true })
      await fs.writeFile(path.join(globalCommandsDir, 'deploy.sh'), '#!/bin/bash\necho "deploying"', 'utf-8')
      await fs.chmod(path.join(globalCommandsDir, 'deploy.sh'), 0o755)
      await fs.writeFile(path.join(globalCommandsDir, 'test.py'), '#!/usr/bin/env python3\nprint("testing")', 'utf-8')
      await fs.chmod(path.join(globalCommandsDir, 'test.py'), 0o755)

      const commands = await commandsService.listCommands()
      assert.equal(commands.length, 2)
      assert.equal(commands[0].name, 'deploy.sh')
      assert.equal(commands[0].scope, 'global')
      assert.equal(commands[0].path, path.join(globalCommandsDir, 'deploy.sh'))
      assert.equal(commands[0].isExecutable, true)
      assert.equal(commands[1].name, 'test.py')
      assert.equal(commands[1].scope, 'global')
      assert.equal(commands[1].isExecutable, true)
    })

    it('should list workspace commands', async () => {
      // Create workspace commands
      await fs.mkdir(workspaceCommandsDir, { recursive: true })
      await fs.writeFile(path.join(workspaceCommandsDir, 'build.sh'), '#!/bin/bash\necho "building"', 'utf-8')
      await fs.chmod(path.join(workspaceCommandsDir, 'build.sh'), 0o755)

      const commands = await commandsService.listCommands()
      assert.equal(commands.length, 1)
      assert.equal(commands[0].name, 'build.sh')
      assert.equal(commands[0].scope, 'workspace')
      assert.equal(commands[0].path, path.join(workspaceCommandsDir, 'build.sh'))
      assert.equal(commands[0].isExecutable, true)
    })

    it('should list both global and workspace commands', async () => {
      // Create both global and workspace commands
      await fs.mkdir(globalCommandsDir, { recursive: true })
      await fs.mkdir(workspaceCommandsDir, { recursive: true })
      await fs.writeFile(path.join(globalCommandsDir, 'global.sh'), '#!/bin/bash\necho "global"', 'utf-8')
      await fs.chmod(path.join(globalCommandsDir, 'global.sh'), 0o755)
      await fs.writeFile(path.join(workspaceCommandsDir, 'workspace.sh'), '#!/bin/bash\necho "workspace"', 'utf-8')
      await fs.chmod(path.join(workspaceCommandsDir, 'workspace.sh'), 0o755)

      const commands = await commandsService.listCommands()
      assert.equal(commands.length, 2)
      // Global commands should come first
      assert.equal(commands[0].name, 'global.sh')
      assert.equal(commands[0].scope, 'global')
      assert.equal(commands[1].name, 'workspace.sh')
      assert.equal(commands[1].scope, 'workspace')
    })

    it('should detect non-executable files', async () => {
      await fs.mkdir(globalCommandsDir, { recursive: true })
      await fs.writeFile(path.join(globalCommandsDir, 'executable.sh'), '#!/bin/bash', 'utf-8')
      await fs.chmod(path.join(globalCommandsDir, 'executable.sh'), 0o755)
      await fs.writeFile(path.join(globalCommandsDir, 'not-executable.sh'), '#!/bin/bash', 'utf-8')
      await fs.chmod(path.join(globalCommandsDir, 'not-executable.sh'), 0o644)

      const commands = await commandsService.listCommands()
      assert.equal(commands.length, 2)
      
      const executable = commands.find(c => c.name === 'executable.sh')
      const notExecutable = commands.find(c => c.name === 'not-executable.sh')
      
      assert.ok(executable)
      assert.equal(executable.isExecutable, true)
      assert.ok(notExecutable)
      assert.equal(notExecutable.isExecutable, false)
    })

    it('should filter out hidden files', async () => {
      await fs.mkdir(globalCommandsDir, { recursive: true })
      await fs.writeFile(path.join(globalCommandsDir, 'visible.sh'), '#!/bin/bash', 'utf-8')
      await fs.chmod(path.join(globalCommandsDir, 'visible.sh'), 0o755)
      await fs.writeFile(path.join(globalCommandsDir, '.hidden'), '#!/bin/bash', 'utf-8')
      await fs.chmod(path.join(globalCommandsDir, '.hidden'), 0o755)
      await fs.writeFile(path.join(globalCommandsDir, '.DS_Store'), 'binary data', 'utf-8')

      const commands = await commandsService.listCommands()
      assert.equal(commands.length, 1)
      assert.equal(commands[0].name, 'visible.sh')
    })

    it('should filter out directories', async () => {
      await fs.mkdir(globalCommandsDir, { recursive: true })
      await fs.writeFile(path.join(globalCommandsDir, 'command.sh'), '#!/bin/bash', 'utf-8')
      await fs.chmod(path.join(globalCommandsDir, 'command.sh'), 0o755)
      await fs.mkdir(path.join(globalCommandsDir, 'subdir'))

      const commands = await commandsService.listCommands()
      assert.equal(commands.length, 1)
      assert.equal(commands[0].name, 'command.sh')
    })

    it('should filter out symlinks', async () => {
      await fs.mkdir(globalCommandsDir, { recursive: true })
      await fs.writeFile(path.join(globalCommandsDir, 'real-command.sh'), '#!/bin/bash', 'utf-8')
      await fs.chmod(path.join(globalCommandsDir, 'real-command.sh'), 0o755)
      await fs.symlink(
        path.join(globalCommandsDir, 'real-command.sh'),
        path.join(globalCommandsDir, 'symlink-command')
      )

      const commands = await commandsService.listCommands()
      assert.equal(commands.length, 1)
      assert.equal(commands[0].name, 'real-command.sh')
    })

    it('should preserve file extensions in command names', async () => {
      await fs.mkdir(globalCommandsDir, { recursive: true })
      await fs.writeFile(path.join(globalCommandsDir, 'script.sh'), '#!/bin/bash', 'utf-8')
      await fs.writeFile(path.join(globalCommandsDir, 'script.py'), '#!/usr/bin/env python3', 'utf-8')
      await fs.writeFile(path.join(globalCommandsDir, 'script.js'), '#!/usr/bin/env node', 'utf-8')
      await fs.chmod(path.join(globalCommandsDir, 'script.sh'), 0o755)
      await fs.chmod(path.join(globalCommandsDir, 'script.py'), 0o755)
      await fs.chmod(path.join(globalCommandsDir, 'script.js'), 0o755)

      const commands = await commandsService.listCommands()
      assert.equal(commands.length, 3)
      
      const names = commands.map(c => c.name).sort()
      assert.deepEqual(names, ['script.js', 'script.py', 'script.sh'])
    })

    it('should not list workspace commands when no workspace path is set', async () => {
      // Create service without workspace
      const serviceWithoutWorkspace = new CommandsService(null)
      
      await fs.mkdir(globalCommandsDir, { recursive: true })
      await fs.writeFile(path.join(globalCommandsDir, 'global.sh'), '#!/bin/bash', 'utf-8')
      await fs.chmod(path.join(globalCommandsDir, 'global.sh'), 0o755)

      const commands = await serviceWithoutWorkspace.listCommands()
      assert.equal(commands.length, 1)
      assert.equal(commands[0].scope, 'global')
    })
  })

  describe('createCommand', () => {
    it('should create global command', async () => {
      const content = '#!/bin/bash\necho "Hello World"'
      const command = await commandsService.createCommand('hello.sh', content, 'global')
      
      assert.equal(command.name, 'hello.sh')
      assert.equal(command.scope, 'global')
      assert.equal(command.path, path.join(globalCommandsDir, 'hello.sh'))
      assert.equal(command.isExecutable, true)

      // Verify file was created
      const fileContent = await fs.readFile(path.join(globalCommandsDir, 'hello.sh'), 'utf-8')
      assert.equal(fileContent, content)
      
      // Verify executable permissions
      const stats = await fs.stat(path.join(globalCommandsDir, 'hello.sh'))
      assert.equal((stats.mode & 0o111) !== 0, true)
    })

    it('should create workspace command', async () => {
      const content = '#!/usr/bin/env python3\nprint("Hello")'
      const command = await commandsService.createCommand('hello.py', content, 'workspace')
      
      assert.equal(command.name, 'hello.py')
      assert.equal(command.scope, 'workspace')
      assert.equal(command.isExecutable, true)

      // Verify file was created
      const fileContent = await fs.readFile(path.join(workspaceCommandsDir, 'hello.py'), 'utf-8')
      assert.equal(fileContent, content)
      
      // Verify executable permissions
      const stats = await fs.stat(path.join(workspaceCommandsDir, 'hello.py'))
      assert.equal((stats.mode & 0o111) !== 0, true)
    })

    it('should create directory if it does not exist', async () => {
      const command = await commandsService.createCommand('test.sh', '#!/bin/bash', 'global')
      
      assert.ok(command)
      const dirExists = await fs.access(globalCommandsDir).then(() => true).catch(() => false)
      assert.equal(dirExists, true)
    })

    it('should throw when command already exists', async () => {
      await fs.mkdir(globalCommandsDir, { recursive: true })
      await fs.writeFile(path.join(globalCommandsDir, 'existing.sh'), '#!/bin/bash', 'utf-8')

      await assert.rejects(
        async () => await commandsService.createCommand('existing.sh', '#!/bin/bash\necho "new"', 'global'),
        { message: 'Command "existing.sh" already exists in global scope' }
      )
    })

    it('should throw when workspace scope is used without workspace path', async () => {
      const serviceWithoutWorkspace = new CommandsService(null)
      
      await assert.rejects(
        async () => await serviceWithoutWorkspace.createCommand('test.sh', '#!/bin/bash', 'workspace'),
        { message: 'No workspace path set' }
      )
    })

    it('should handle commands with different extensions', async () => {
      await commandsService.createCommand('script.sh', '#!/bin/bash', 'global')
      await commandsService.createCommand('script.py', '#!/usr/bin/env python3', 'global')
      await commandsService.createCommand('script.js', '#!/usr/bin/env node', 'global')

      const files = await fs.readdir(globalCommandsDir)
      assert.equal(files.length, 3)
      assert.ok(files.includes('script.sh'))
      assert.ok(files.includes('script.py'))
      assert.ok(files.includes('script.js'))
    })

    it('should set correct executable permissions (0o755)', async () => {
      await commandsService.createCommand('check-perms.sh', '#!/bin/bash', 'global')
      
      const stats = await fs.stat(path.join(globalCommandsDir, 'check-perms.sh'))
      // Check that the file has 0o755 permissions
      const perms = stats.mode & 0o777
      assert.equal(perms, 0o755)
    })

    it('should handle command names without extensions', async () => {
      const command = await commandsService.createCommand('deploy', '#!/bin/bash\necho "deploying"', 'global')
      
      assert.equal(command.name, 'deploy')
      const exists = await fs.access(path.join(globalCommandsDir, 'deploy')).then(() => true).catch(() => false)
      assert.equal(exists, true)
    })
  })

  describe('deleteCommand', () => {
    it('should delete global command', async () => {
      // Create command
      await fs.mkdir(globalCommandsDir, { recursive: true })
      await fs.writeFile(path.join(globalCommandsDir, 'to-delete.sh'), '#!/bin/bash', 'utf-8')

      await commandsService.deleteCommand('to-delete.sh', 'global')

      // Verify file was deleted
      const exists = await fs.access(path.join(globalCommandsDir, 'to-delete.sh'))
        .then(() => true)
        .catch(() => false)
      assert.equal(exists, false)
    })

    it('should delete workspace command', async () => {
      // Create command
      await fs.mkdir(workspaceCommandsDir, { recursive: true })
      await fs.writeFile(path.join(workspaceCommandsDir, 'to-delete.sh'), '#!/bin/bash', 'utf-8')

      await commandsService.deleteCommand('to-delete.sh', 'workspace')

      // Verify file was deleted
      const exists = await fs.access(path.join(workspaceCommandsDir, 'to-delete.sh'))
        .then(() => true)
        .catch(() => false)
      assert.equal(exists, false)
    })

    it('should throw when command does not exist', async () => {
      await assert.rejects(
        async () => await commandsService.deleteCommand('nonexistent.sh', 'global'),
        { message: 'Command "nonexistent.sh" not found in global scope' }
      )
    })

    it('should throw when workspace scope is used without workspace path', async () => {
      const serviceWithoutWorkspace = new CommandsService(null)
      
      await assert.rejects(
        async () => await serviceWithoutWorkspace.deleteCommand('test.sh', 'workspace'),
        { message: 'No workspace path set' }
      )
    })

    it('should handle command names with various extensions', async () => {
      await fs.mkdir(globalCommandsDir, { recursive: true })
      await fs.writeFile(path.join(globalCommandsDir, 'script.sh'), '#!/bin/bash', 'utf-8')
      await fs.writeFile(path.join(globalCommandsDir, 'script.py'), '#!/usr/bin/env python3', 'utf-8')

      await commandsService.deleteCommand('script.sh', 'global')
      await commandsService.deleteCommand('script.py', 'global')

      const files = await fs.readdir(globalCommandsDir)
      assert.equal(files.length, 0)
    })
  })

  describe('edge cases', () => {
    it('should handle command names with special characters', async () => {
      const name = 'my-command_v2.0.sh'
      const command = await commandsService.createCommand(name, '#!/bin/bash', 'global')
      
      assert.equal(command.name, name)
      
      const commands = await commandsService.listCommands()
      const found = commands.find(c => c.name === name)
      assert.ok(found)
      assert.equal(found.name, name)
    })

    it('should handle empty command content', async () => {
      const command = await commandsService.createCommand('empty.sh', '', 'global')
      assert.equal(command.name, 'empty.sh')
      
      const content = await fs.readFile(path.join(globalCommandsDir, 'empty.sh'), 'utf-8')
      assert.equal(content, '')
    })

    it('should handle large command content', async () => {
      const largeContent = '#!/bin/bash\n\n' + '# Comment\n'.repeat(1000)
      const command = await commandsService.createCommand('large.sh', largeContent, 'global')
      
      assert.equal(command.name, 'large.sh')
      
      const content = await fs.readFile(path.join(globalCommandsDir, 'large.sh'), 'utf-8')
      assert.equal(content, largeContent)
    })

    it('should handle Unicode content', async () => {
      const unicodeContent = '#!/bin/bash\n# 部署脚本 Deployment Script 🚀\necho "こんにちは 世界"'
      const command = await commandsService.createCommand('unicode.sh', unicodeContent, 'global')
      
      assert.equal(command.name, 'unicode.sh')
      
      const content = await fs.readFile(path.join(globalCommandsDir, 'unicode.sh'), 'utf-8')
      assert.equal(content, unicodeContent)
    })

    it('should handle newlines in content', async () => {
      const content = '#!/bin/bash\n\necho "Line 1"\n\necho "Line 2"\n\n\necho "Line 3"'
      await commandsService.createCommand('newlines.sh', content, 'global')
      
      const fileContent = await fs.readFile(path.join(globalCommandsDir, 'newlines.sh'), 'utf-8')
      assert.equal(fileContent, content)
    })

    it('should handle switching workspace paths', async () => {
      // Create command in first workspace
      await commandsService.createCommand('ws1.sh', '#!/bin/bash', 'workspace')
      
      let commands = await commandsService.listCommands()
      assert.equal(commands.filter(c => c.scope === 'workspace').length, 1)
      
      // Switch to new workspace
      const newWorkspacePath = path.join(tempDir, 'workspace2')
      commandsService.setWorkspacePath(newWorkspacePath)
      
      // Old workspace commands should not appear
      commands = await commandsService.listCommands()
      assert.equal(commands.filter(c => c.scope === 'workspace').length, 0)
      
      // Create command in new workspace
      await commandsService.createCommand('ws2.sh', '#!/bin/bash', 'workspace')
      
      commands = await commandsService.listCommands()
      const workspaceCommands = commands.filter(c => c.scope === 'workspace')
      assert.equal(workspaceCommands.length, 1)
      assert.equal(workspaceCommands[0].name, 'ws2.sh')
    })

    it('should handle files with multiple dots in name', async () => {
      const name = 'deploy.v2.0.sh'
      await commandsService.createCommand(name, '#!/bin/bash', 'global')
      
      const commands = await commandsService.listCommands()
      const found = commands.find(c => c.name === name)
      assert.ok(found)
      assert.equal(found.name, name)
    })
  })

  describe('error handling', () => {
    it('should handle invalid scope in createCommand', async () => {
      await assert.rejects(
        async () => await commandsService.createCommand('test.sh', '#!/bin/bash', 'invalid' as any),
        { message: 'Invalid scope: invalid' }
      )
    })

    it('should handle invalid scope in deleteCommand', async () => {
      await assert.rejects(
        async () => await commandsService.deleteCommand('test.sh', 'invalid' as any),
        { message: 'Invalid scope: invalid' }
      )
    })
  })
})
