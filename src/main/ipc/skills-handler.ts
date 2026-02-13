/**
 * Skills IPC Handlers
 * Wires skills CRUD operations to skills service
 */

import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '../../shared/ipc-channels'
import type { IPCResponse } from '../../shared/types'
import { SkillsService } from '../services/skills-service'

export function registerSkillsHandlers(skillsService: SkillsService) {
  // List skills
  ipcMain.handle(IPC_CHANNELS.SKILLS_LIST, async () => {
    try {
      const skills = await skillsService.listSkills()
      return { success: true, data: skills } as IPCResponse
    } catch (error) {
      console.error('SKILLS_LIST error:', error)
      return { success: false, error: (error as Error).message } as IPCResponse
    }
  })

  // Get skill
  ipcMain.handle(
    IPC_CHANNELS.SKILLS_GET,
    async (_event, name: string, scope: 'global' | 'workspace') => {
      try {
        const skill = await skillsService.getSkill(name, scope)
        return { success: true, data: skill } as IPCResponse
      } catch (error) {
        console.error('SKILLS_GET error:', error)
        return { success: false, error: (error as Error).message } as IPCResponse
      }
    }
  )

  // Create skill
  ipcMain.handle(
    IPC_CHANNELS.SKILLS_CREATE,
    async (_event, name: string, content: string, scope: 'global' | 'workspace') => {
      try {
        const skill = await skillsService.createSkill(name, content, scope)
        return { success: true, data: skill } as IPCResponse
      } catch (error) {
        console.error('SKILLS_CREATE error:', error)
        return { success: false, error: (error as Error).message } as IPCResponse
      }
    }
  )

  // Update skill
  ipcMain.handle(
    IPC_CHANNELS.SKILLS_UPDATE,
    async (_event, name: string, content: string, scope: 'global' | 'workspace') => {
      try {
        const skill = await skillsService.updateSkill(name, content, scope)
        return { success: true, data: skill } as IPCResponse
      } catch (error) {
        console.error('SKILLS_UPDATE error:', error)
        return { success: false, error: (error as Error).message } as IPCResponse
      }
    }
  )

  // Delete skill
  ipcMain.handle(
    IPC_CHANNELS.SKILLS_DELETE,
    async (_event, name: string, scope: 'global' | 'workspace') => {
      try {
        await skillsService.deleteSkill(name, scope)
        return { success: true } as IPCResponse
      } catch (error) {
        console.error('SKILLS_DELETE error:', error)
        return { success: false, error: (error as Error).message } as IPCResponse
      }
    }
  )
}
