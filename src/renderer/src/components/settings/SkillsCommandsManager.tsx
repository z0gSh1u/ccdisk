/**
 * SkillsCommandsManager - Merged Skills & Commands management
 * Split view: left sidebar (list) + right panel (detail/editor)
 * Three sections: Skills, Commands, SDK Commands (read-only, when session active)
 */

import { useEffect, useState, useCallback } from 'react'
import {
  FileCode,
  Trash2,
  Plus,
  AlertCircle,
  CheckCircle2,
  BookOpen,
  Terminal,
  Zap,
  Eye,
  Pencil,
  Save,
  X
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

import { useSkillsStore } from '../../stores/skills-store'
import { useCommandsStore } from '../../stores/commands-store'
import { useChatStore } from '../../stores/chat-store'
import { cn } from '../../lib/utils'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { Label } from '../ui/Label'
import { ScrollArea } from '../ui/ScrollArea'
import { Tabs, TabsList, TabsTrigger } from '../ui/Tabs'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription
} from '../ui/Dialog'

import type { Skill, Command, SlashCommand } from '../../../../shared/types'
import type { SkillScope } from '../../stores/skills-store'
import type { CommandScope } from '../../stores/commands-store'

type ItemType = 'skill' | 'command' | 'sdk-command'
type Scope = 'global' | 'workspace'

interface SelectedItem {
  type: ItemType
  skill?: Skill
  command?: Command
  sdkCommand?: SlashCommand
}

/**
 * SkillsCommandsManager - Unified view for Skills, Commands, and SDK Commands
 */
export function SkillsCommandsManager() {
  // Store hooks
  const {
    skills,
    currentScope: skillsScope,
    isLoading: skillsLoading,
    error: skillsError,
    setScope: setSkillsScope,
    loadSkills,
    selectSkill,
    createSkill,
    updateSkill,
    deleteSkill,
    getSkillsByScope,
    setupSkillsWatcher
  } = useSkillsStore()

  const {
    currentScope: commandsScope,
    commandContent,
    isLoading: commandsLoading,
    error: commandsError,
    setScope: setCommandsScope,
    loadCommands,
    selectCommand,
    createCommand,
    deleteCommand,
    getCommandsByScope,
    setupCommandsWatcher
  } = useCommandsStore()

  const { sessions, currentSessionId } = useChatStore()

  // Local state
  const [scope, setScope] = useState<Scope>('global')
  const [selected, setSelected] = useState<SelectedItem | null>(null)
  const [sdkCommands, setSdkCommands] = useState<SlashCommand[]>([])
  const [sdkLoading, setSdkLoading] = useState(false)

  // Edit state for skills
  const [isEditing, setIsEditing] = useState(false)
  const [editContent, setEditContent] = useState('')
  const [showPreview, setShowPreview] = useState(false)

  // Create dialog state
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [createType, setCreateType] = useState<'skill' | 'command'>('skill')
  const [newName, setNewName] = useState('')
  const [newCommandContent, setNewCommandContent] = useState('#!/bin/bash\n\n')
  const [newCommandExtension, setNewCommandExtension] = useState('.sh')

  // Derived state
  const currentSession = sessions.find((s) => s.id === currentSessionId) || null
  const sdkSessionId = currentSession?.sdkSessionId
  const isLoading = skillsLoading || commandsLoading
  const error = skillsError || commandsError

  const currentSkills = getSkillsByScope(scope)
  const currentCommands = getCommandsByScope(scope)

  // Scope change handler - sync both stores
  const handleScopeChange = useCallback(
    (newScope: Scope) => {
      setScope(newScope)
      setSelected(null)
      setIsEditing(false)
      setEditContent('')
      // Only update stores if scope actually changed
      if (newScope !== skillsScope) setSkillsScope(newScope as SkillScope)
      if (newScope !== commandsScope) setCommandsScope(newScope as CommandScope)
    },
    [skillsScope, commandsScope, setSkillsScope, setCommandsScope]
  )

  // Load data on mount
  useEffect(() => {
    loadSkills()
    loadCommands()
    const cleanupSkills = setupSkillsWatcher()
    const cleanupCommands = setupCommandsWatcher()
    return () => {
      cleanupSkills()
      cleanupCommands()
    }
  }, [loadSkills, loadCommands, setupSkillsWatcher, setupCommandsWatcher])

  // Load SDK commands when session is active
  useEffect(() => {
    if (!sdkSessionId) {
      setSdkCommands([])
      return
    }

    const loadSdkCommands = async () => {
      setSdkLoading(true)
      try {
        const response = await window.api.sdk.getCommands(sdkSessionId)
        if (response.success && response.data) {
          setSdkCommands(response.data)
        }
      } catch (err) {
        console.error('Failed to load SDK commands:', err)
      } finally {
        setSdkLoading(false)
      }
    }

    loadSdkCommands()
  }, [sdkSessionId])

  // Selection handlers
  const handleSelectSkill = (skill: Skill) => {
    setSelected({ type: 'skill', skill })
    setIsEditing(false)
    setEditContent('')
    setShowPreview(false)
    selectSkill(skill)
  }

  const handleSelectCommand = async (command: Command) => {
    setSelected({ type: 'command', command })
    setIsEditing(false)
    await selectCommand(command)
  }

  const handleSelectSdkCommand = (sdkCommand: SlashCommand) => {
    setSelected({ type: 'sdk-command', sdkCommand })
    setIsEditing(false)
  }

  // Skill editing
  const handleEditSkill = (skill: Skill) => {
    setSelected({ type: 'skill', skill })
    setEditContent(skill.content)
    setIsEditing(true)
    setShowPreview(false)
    selectSkill(skill)
  }

  const handleSaveSkill = async () => {
    if (!selected?.skill) return
    try {
      await updateSkill(selected.skill.name, editContent)
      setIsEditing(false)
    } catch (err) {
      console.error('Failed to save skill:', err)
      alert(`Failed to save skill: ${(err as Error).message}`)
    }
  }

  const handleCancelEdit = () => {
    setIsEditing(false)
    setEditContent('')
    setShowPreview(false)
  }

  // Delete handlers
  const handleDeleteSkill = async (skill: Skill) => {
    if (!confirm(`Are you sure you want to delete skill "${skill.name}"?`)) return
    try {
      await deleteSkill(skill.name, skill.scope as SkillScope)
      if (selected?.skill?.name === skill.name) {
        setSelected(null)
        setIsEditing(false)
      }
    } catch (err) {
      console.error('Failed to delete skill:', err)
      alert(`Failed to delete skill: ${(err as Error).message}`)
    }
  }

  const handleDeleteCommand = async (command: Command) => {
    if (!confirm(`Are you sure you want to delete command "${command.name}"?`)) return
    try {
      await deleteCommand(command.name, command.scope as CommandScope)
      if (selected?.command?.name === command.name) {
        setSelected(null)
      }
    } catch (err) {
      console.error('Failed to delete command:', err)
      alert(`Failed to delete command: ${(err as Error).message}`)
    }
  }

  // Create handlers
  const handleExtensionChange = (ext: string) => {
    setNewCommandExtension(ext)
    if (ext === '.sh') setNewCommandContent('#!/bin/bash\n\n')
    else if (ext === '.js') setNewCommandContent('#!/usr/bin/env node\n\n')
    else if (ext === '.py') setNewCommandContent('#!/usr/bin/env python3\n\n')
    else if (ext === '.rb') setNewCommandContent('#!/usr/bin/env ruby\n\n')
    else setNewCommandContent('')
  }

  const handleCreate = async () => {
    if (!newName.trim()) return

    try {
      if (createType === 'skill') {
        await createSkill(newName.trim(), '# New Skill\n\nAdd your skill content here...')
        // Try to select the newly created skill
        const created = skills.find((s) => s.name === newName.trim() && s.scope === scope)
        if (created) {
          handleEditSkill(created)
        }
      } else {
        const fullName = newName.trim() + newCommandExtension
        await createCommand(fullName, newCommandContent)
      }

      resetCreateDialog()
    } catch (err) {
      console.error(`Failed to create ${createType}:`, err)
      alert(`Failed to create ${createType}: ${(err as Error).message}`)
    }
  }

  const resetCreateDialog = () => {
    setCreateDialogOpen(false)
    setNewName('')
    setNewCommandContent('#!/bin/bash\n\n')
    setNewCommandExtension('.sh')
  }

  const openCreateDialog = (type: 'skill' | 'command') => {
    setCreateType(type)
    setNewName('')
    setNewCommandContent('#!/bin/bash\n\n')
    setNewCommandExtension('.sh')
    setCreateDialogOpen(true)
  }

  // Render sidebar section
  const renderSectionHeader = (
    title: string,
    icon: React.ReactNode,
    count: number,
    onAdd?: () => void
  ) => (
    <div className="flex items-center justify-between px-3 py-2 mt-2 first:mt-0">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
        {icon}
        <span>{title}</span>
        <span className="rounded-full bg-gray-200 px-1.5 py-0.5 text-[10px] dark:bg-gray-700">
          {count}
        </span>
      </div>
      {onAdd && (
        <button
          onClick={onAdd}
          className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-300"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  )

  // Render skill list item
  const renderSkillItem = (skill: Skill) => {
    const isSelected =
      selected?.type === 'skill' &&
      selected.skill?.name === skill.name &&
      selected.skill?.scope === skill.scope

    return (
      <div
        key={`skill-${skill.scope}-${skill.name}`}
        className={cn(
          'group flex items-center justify-between rounded-md px-3 py-2 text-sm cursor-pointer',
          'transition-colors hover:bg-gray-100 dark:hover:bg-gray-800',
          isSelected ? 'bg-blue-50 text-blue-900 dark:bg-blue-900/20 dark:text-blue-200' : ''
        )}
        onClick={() => handleSelectSkill(skill)}
      >
        <div className="flex items-center gap-2 min-w-0">
          <BookOpen className="h-3.5 w-3.5 flex-shrink-0 text-gray-400" />
          <span className="truncate font-medium">{skill.name}</span>
        </div>
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 flex-shrink-0">
          <button
            onClick={(e) => {
              e.stopPropagation()
              handleEditSkill(skill)
            }}
            className="rounded p-1 hover:bg-gray-200 dark:hover:bg-gray-700"
          >
            <Pencil className="h-3 w-3 text-gray-500" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation()
              handleDeleteSkill(skill)
            }}
            className="rounded p-1 hover:bg-red-100 dark:hover:bg-red-900/20"
          >
            <Trash2 className="h-3 w-3 text-red-500" />
          </button>
        </div>
      </div>
    )
  }

  // Render command list item
  const renderCommandItem = (command: Command) => {
    const isSelected =
      selected?.type === 'command' &&
      selected.command?.name === command.name &&
      selected.command?.scope === command.scope

    return (
      <div
        key={`cmd-${command.scope}-${command.name}`}
        className={cn(
          'group flex items-center justify-between rounded-md px-3 py-2 text-sm cursor-pointer',
          'transition-colors hover:bg-gray-100 dark:hover:bg-gray-800',
          isSelected ? 'bg-blue-50 text-blue-900 dark:bg-blue-900/20 dark:text-blue-200' : ''
        )}
        onClick={() => handleSelectCommand(command)}
      >
        <div className="flex items-center gap-2 min-w-0">
          <FileCode className="h-3.5 w-3.5 flex-shrink-0 text-gray-400" />
          <span className="truncate font-medium">{command.name}</span>
          {command.isExecutable ? (
            <CheckCircle2 className="h-3 w-3 flex-shrink-0 text-green-500" />
          ) : (
            <AlertCircle className="h-3 w-3 flex-shrink-0 text-yellow-500" />
          )}
        </div>
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 flex-shrink-0">
          <button
            onClick={(e) => {
              e.stopPropagation()
              handleDeleteCommand(command)
            }}
            className="rounded p-1 hover:bg-red-100 dark:hover:bg-red-900/20"
          >
            <Trash2 className="h-3 w-3 text-red-500" />
          </button>
        </div>
      </div>
    )
  }

  // Render SDK command list item
  const renderSdkCommandItem = (cmd: SlashCommand) => {
    const isSelected = selected?.type === 'sdk-command' && selected.sdkCommand?.name === cmd.name

    return (
      <div
        key={`sdk-${cmd.name}`}
        className={cn(
          'flex items-center gap-2 rounded-md px-3 py-2 text-sm cursor-pointer',
          'transition-colors hover:bg-gray-100 dark:hover:bg-gray-800',
          isSelected ? 'bg-blue-50 text-blue-900 dark:bg-blue-900/20 dark:text-blue-200' : ''
        )}
        onClick={() => handleSelectSdkCommand(cmd)}
      >
        <Zap className="h-3.5 w-3.5 flex-shrink-0 text-amber-500" />
        <span className="truncate font-medium">/{cmd.name}</span>
      </div>
    )
  }

  // Render detail panel content
  const renderDetailPanel = () => {
    if (!selected) {
      return (
        <div className="flex flex-1 items-center justify-center text-gray-500 dark:text-gray-400">
          <div className="text-center">
            <BookOpen className="mx-auto mb-3 h-12 w-12 opacity-20" />
            <p className="text-sm font-medium">No item selected</p>
            <p className="mt-1 text-xs">Select a skill, command, or SDK command from the list</p>
          </div>
        </div>
      )
    }

    if (selected.type === 'skill' && selected.skill) {
      return renderSkillDetail(selected.skill)
    }

    if (selected.type === 'command' && selected.command) {
      return renderCommandDetail(selected.command)
    }

    if (selected.type === 'sdk-command' && selected.sdkCommand) {
      return renderSdkCommandDetail(selected.sdkCommand)
    }

    return null
  }

  // Skill detail panel
  const renderSkillDetail = (skill: Skill) => (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-700">
        <div>
          <h3 className="flex items-center gap-2 text-lg font-semibold">
            <BookOpen className="h-4 w-4" />
            {skill.name}
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {skill.scope === 'global' ? 'Global' : 'Workspace'} Skill
          </p>
        </div>
        <div className="flex gap-2">
          {isEditing ? (
            <>
              <Button variant="ghost" size="sm" onClick={() => setShowPreview(!showPreview)}>
                {showPreview ? (
                  <>
                    <Pencil className="mr-1.5 h-3.5 w-3.5" />
                    Edit
                  </>
                ) : (
                  <>
                    <Eye className="mr-1.5 h-3.5 w-3.5" />
                    Preview
                  </>
                )}
              </Button>
              <Button variant="ghost" size="sm" onClick={handleCancelEdit}>
                <X className="mr-1.5 h-3.5 w-3.5" />
                Cancel
              </Button>
              <Button variant="primary" size="sm" onClick={handleSaveSkill}>
                <Save className="mr-1.5 h-3.5 w-3.5" />
                Save
              </Button>
            </>
          ) : (
            <Button variant="primary" size="sm" onClick={() => handleEditSkill(skill)}>
              <Pencil className="mr-1.5 h-3.5 w-3.5" />
              Edit
            </Button>
          )}
        </div>
      </div>

      {/* Content */}
      <ScrollArea className="flex-1 p-4">
        {isEditing && !showPreview ? (
          <textarea
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            className={cn(
              'h-full min-h-[400px] w-full resize-none rounded-md border border-gray-300 p-4',
              'font-mono text-sm',
              'focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500',
              'dark:border-gray-600 dark:bg-gray-900 dark:text-white'
            )}
            placeholder="Enter skill content in Markdown..."
          />
        ) : (
          <div className="prose prose-sm max-w-none dark:prose-invert">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {isEditing ? editContent : skill.content}
            </ReactMarkdown>
          </div>
        )}
      </ScrollArea>
    </div>
  )

  // Command detail panel
  const renderCommandDetail = (command: Command) => (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Header */}
      <div className="border-b border-gray-200 px-4 py-3 dark:border-gray-700">
        <h3 className="flex items-center gap-2 text-lg font-semibold">
          <FileCode className="h-4 w-4" />
          {command.name}
        </h3>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{command.path}</p>
        <div className="mt-2">
          <span
            className={cn(
              'inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium',
              command.isExecutable
                ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400'
                : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400'
            )}
          >
            {command.isExecutable ? (
              <CheckCircle2 className="h-3 w-3" />
            ) : (
              <AlertCircle className="h-3 w-3" />
            )}
            {command.isExecutable ? 'Executable' : 'Not Executable'}
          </span>
        </div>
      </div>

      {/* Content */}
      <ScrollArea className="flex-1 p-4">
        <div className="rounded-md border border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-900">
          <pre className="overflow-x-auto p-4 text-sm font-mono">
            <code className="text-gray-900 dark:text-gray-100">
              {commandContent || 'Loading...'}
            </code>
          </pre>
        </div>

        {!command.isExecutable && (
          <div className="mt-4 flex items-start gap-2 rounded-md border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-800 dark:border-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-200">
            <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <span>
              This file is not executable. Commands must have executable permissions to run.
            </span>
          </div>
        )}
      </ScrollArea>
    </div>
  )

  // SDK command detail panel
  const renderSdkCommandDetail = (cmd: SlashCommand) => (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Header */}
      <div className="border-b border-gray-200 px-4 py-3 dark:border-gray-700">
        <h3 className="flex items-center gap-2 text-lg font-semibold">
          <Zap className="h-4 w-4 text-amber-500" />/{cmd.name}
        </h3>
        <span className="mt-1 inline-block rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600 dark:bg-gray-800 dark:text-gray-400">
          SDK Command (read-only)
        </span>
      </div>

      {/* Content */}
      <ScrollArea className="flex-1 p-4">
        <div className="space-y-4">
          <div>
            <Label className="text-xs uppercase tracking-wider text-gray-500">Description</Label>
            <p className="mt-1 text-sm text-gray-900 dark:text-gray-100">
              {cmd.description || 'No description available'}
            </p>
          </div>

          {cmd.argumentHint && (
            <div>
              <Label className="text-xs uppercase tracking-wider text-gray-500">Usage</Label>
              <div className="mt-1 rounded-md border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-900">
                <code className="text-sm font-mono text-gray-900 dark:text-gray-100">
                  /{cmd.name} {cmd.argumentHint}
                </code>
              </div>
            </div>
          )}

          <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-200">
            SDK commands are provided by the Claude SDK and cannot be modified. They are available
            when a chat session is active.
          </div>
        </div>
      </ScrollArea>
    </div>
  )

  return (
    <div className="flex h-[500px] flex-col">
      {/* Header with scope tabs and create button */}
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-700">
        <Tabs value={scope} onValueChange={(v) => handleScopeChange(v as Scope)}>
          <TabsList>
            <TabsTrigger value="global">Global</TabsTrigger>
            <TabsTrigger value="workspace">Workspace</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => openCreateDialog('skill')}
            disabled={isLoading}
          >
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Skill
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => openCreateDialog('command')}
            disabled={isLoading}
          >
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Command
          </Button>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="mx-4 mt-3 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-900/20 dark:text-red-200">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Split view */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left sidebar - list */}
        <ScrollArea className="w-64 border-r border-gray-200 dark:border-gray-700">
          <div className="py-1">
            {/* Skills section */}
            {renderSectionHeader(
              'Skills',
              <BookOpen className="h-3 w-3" />,
              currentSkills.length,
              () => openCreateDialog('skill')
            )}
            {currentSkills.length === 0 ? (
              <p className="px-3 py-2 text-xs text-gray-400">No skills in {scope} scope</p>
            ) : (
              currentSkills.map(renderSkillItem)
            )}

            {/* Commands section */}
            {renderSectionHeader(
              'Commands',
              <Terminal className="h-3 w-3" />,
              currentCommands.length,
              () => openCreateDialog('command')
            )}
            {currentCommands.length === 0 ? (
              <p className="px-3 py-2 text-xs text-gray-400">No commands in {scope} scope</p>
            ) : (
              currentCommands.map(renderCommandItem)
            )}

            {/* SDK Commands section (only when session active) */}
            {sdkSessionId && (
              <>
                {renderSectionHeader(
                  'SDK Commands',
                  <Zap className="h-3 w-3" />,
                  sdkCommands.length
                )}
                {sdkLoading ? (
                  <p className="px-3 py-2 text-xs text-gray-400">Loading...</p>
                ) : sdkCommands.length === 0 ? (
                  <p className="px-3 py-2 text-xs text-gray-400">No SDK commands available</p>
                ) : (
                  sdkCommands.map(renderSdkCommandItem)
                )}
              </>
            )}
          </div>
        </ScrollArea>

        {/* Right panel - detail/editor */}
        {renderDetailPanel()}
      </div>

      {/* Create Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New {createType === 'skill' ? 'Skill' : 'Command'}</DialogTitle>
            <DialogDescription>
              Create in the <strong>{scope}</strong> scope
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Type selector */}
            <div>
              <Label className="mb-2 block">Type</Label>
              <Tabs
                value={createType}
                onValueChange={(v) => setCreateType(v as 'skill' | 'command')}
              >
                <TabsList className="w-full">
                  <TabsTrigger value="skill" className="flex-1">
                    <BookOpen className="mr-1.5 h-3.5 w-3.5" />
                    Skill
                  </TabsTrigger>
                  <TabsTrigger value="command" className="flex-1">
                    <Terminal className="mr-1.5 h-3.5 w-3.5" />
                    Command
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>

            {/* Name input */}
            <div>
              <Label className="mb-2 block">Name</Label>
              {createType === 'command' ? (
                <div className="flex gap-2">
                  <Input
                    placeholder="my-command"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    className="flex-1"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleCreate()
                    }}
                  />
                  <select
                    value={newCommandExtension}
                    onChange={(e) => handleExtensionChange(e.target.value)}
                    className={cn(
                      'rounded-md border border-gray-300 bg-white px-3 py-2 text-sm',
                      'dark:border-gray-600 dark:bg-gray-700 dark:text-white'
                    )}
                  >
                    <option value=".sh">.sh (Bash)</option>
                    <option value=".js">.js (Node.js)</option>
                    <option value=".py">.py (Python)</option>
                    <option value=".rb">.rb (Ruby)</option>
                    <option value="">(no ext)</option>
                  </select>
                </div>
              ) : (
                <Input
                  placeholder="my-skill"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleCreate()
                  }}
                />
              )}
              <p className="mt-1 text-xs text-gray-500">
                {createType === 'skill'
                  ? 'Lowercase with hyphens (e.g., "my-custom-skill")'
                  : 'Lowercase with hyphens (e.g., "deploy-app")'}
              </p>
            </div>

            {/* Command content editor (only for commands) */}
            {createType === 'command' && (
              <div>
                <Label className="mb-2 block">Script Content</Label>
                <textarea
                  value={newCommandContent}
                  onChange={(e) => setNewCommandContent(e.target.value)}
                  className={cn(
                    'h-40 w-full rounded-md border border-gray-300 p-3 font-mono text-sm',
                    'dark:border-gray-600 dark:bg-gray-700 dark:text-white'
                  )}
                  placeholder="#!/bin/bash"
                />
                <p className="mt-1 text-xs text-gray-500">
                  The command will be created with executable permissions in the{' '}
                  <strong>{scope}</strong> commands directory.
                </p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={resetCreateDialog}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleCreate} disabled={!newName.trim()}>
              Create {createType === 'skill' ? 'Skill' : 'Command'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
