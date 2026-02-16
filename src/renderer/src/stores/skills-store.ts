/**
 * Skills Store - Manages skills CRUD operations
 * Uses Zustand for state management and calls window.api for IPC
 */

import { create } from 'zustand';
import type { Skill } from '../../../shared/types';

export type SkillScope = 'global' | 'workspace';

interface SkillsStore {
  // State
  skills: Skill[];
  currentScope: SkillScope;
  selectedSkill: Skill | null;
  isLoading: boolean;
  error: string | null;

  // Actions
  setScope: (scope: SkillScope) => void;
  loadSkills: () => Promise<void>;
  selectSkill: (skill: Skill | null) => void;
  createSkill: (name: string, content: string) => Promise<void>;
  updateSkill: (name: string, content: string) => Promise<void>;
  deleteSkill: (name: string, scope: SkillScope) => Promise<void>;

  // Helpers
  getSkillsByScope: (scope: SkillScope) => Skill[];
  setupSkillsWatcher: () => () => void;
}

export const useSkillsStore = create<SkillsStore>((set, get) => ({
  // Initial state
  skills: [],
  currentScope: 'global',
  selectedSkill: null,
  isLoading: false,
  error: null,

  // Set current scope
  setScope: (scope: SkillScope) => {
    set({ currentScope: scope, selectedSkill: null });
    get().loadSkills();
  },

  // Load skills from both scopes
  loadSkills: async () => {
    set({ isLoading: true, error: null });
    try {
      // The backend listSkills() returns skills from both scopes
      const response = await window.api.skills.list();
      if (response.success && response.data) {
        set({ skills: response.data, isLoading: false });
      } else {
        set({ error: response.error || 'Failed to load skills', isLoading: false, skills: [] });
      }
    } catch (error) {
      console.error('Failed to load skills:', error);
      set({ error: (error as Error).message, isLoading: false, skills: [] });
    }
  },

  // Select a skill for editing
  selectSkill: (skill: Skill | null) => {
    set({ selectedSkill: skill });
  },

  // Create new skill
  createSkill: async (name: string, content: string) => {
    const { currentScope } = get();
    set({ isLoading: true, error: null });
    try {
      const response = await window.api.skills.create(name, content, currentScope);
      if (response.success) {
        await get().loadSkills();
        set({ isLoading: false });
      } else {
        set({ error: response.error || 'Failed to create skill', isLoading: false });
        throw new Error(response.error || 'Failed to create skill');
      }
    } catch (error) {
      console.error('Failed to create skill:', error);
      set({ error: (error as Error).message, isLoading: false });
      throw error;
    }
  },

  // Update existing skill
  updateSkill: async (name: string, content: string) => {
    const { currentScope } = get();
    set({ isLoading: true, error: null });
    try {
      const response = await window.api.skills.update(name, content, currentScope);
      if (response.success) {
        await get().loadSkills();
        set({ isLoading: false });
      } else {
        set({ error: response.error || 'Failed to update skill', isLoading: false });
        throw new Error(response.error || 'Failed to update skill');
      }
    } catch (error) {
      console.error('Failed to update skill:', error);
      set({ error: (error as Error).message, isLoading: false });
      throw error;
    }
  },

  // Delete skill
  deleteSkill: async (name: string, scope: SkillScope) => {
    set({ isLoading: true, error: null });
    try {
      const response = await window.api.skills.delete(name, scope);
      if (response.success) {
        await get().loadSkills();
        // Clear selection if deleted skill was selected
        if (get().selectedSkill?.name === name && get().selectedSkill?.scope === scope) {
          set({ selectedSkill: null });
        }
        set({ isLoading: false });
      } else {
        set({ error: response.error || 'Failed to delete skill', isLoading: false });
        throw new Error(response.error || 'Failed to delete skill');
      }
    } catch (error) {
      console.error('Failed to delete skill:', error);
      set({ error: (error as Error).message, isLoading: false });
      throw error;
    }
  },

  // Get skills filtered by scope
  getSkillsByScope: (scope: SkillScope) => {
    return get().skills.filter((skill) => skill.scope === scope);
  },

  // Setup file watcher for skills
  setupSkillsWatcher: () => {
    return window.api.skills.onSkillsChange(() => {
      console.log('Skills changed, reloading...');
      get().loadSkills();
    });
  }
}));
