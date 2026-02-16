/**
 * Commands Manager Component
 * Manages executable command scripts in ~/.claude/commands/ (global) or workspace/.claude/commands/
 */

import { useEffect, useState } from 'react';
import { useCommandsStore } from '../../stores/commands-store';
import type { Command } from '../../../../shared/types';
import { Tabs, TabsList, TabsTrigger } from '../ui/Tabs';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { FileCode, Trash2, Plus, AlertCircle, CheckCircle2 } from 'lucide-react';

export function CommandsManager() {
  const {
    currentScope,
    selectedCommand,
    commandContent,
    isLoading,
    error,
    setScope,
    loadCommands,
    selectCommand,
    createCommand,
    deleteCommand,
    getCommandsByScope,
    setupCommandsWatcher
  } = useCommandsStore();

  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [newCommandName, setNewCommandName] = useState('');
  const [newCommandContent, setNewCommandContent] = useState('#!/bin/bash\n\n');
  const [newCommandExtension, setNewCommandExtension] = useState('.sh');

  // Load commands on mount and setup file watcher
  useEffect(() => {
    loadCommands();
    const cleanup = setupCommandsWatcher();
    return cleanup;
  }, [loadCommands, setupCommandsWatcher]);

  // Get commands for current scope
  const currentCommands = getCommandsByScope(currentScope);

  const handleCreateCommand = async () => {
    if (!newCommandName.trim()) {
      return;
    }

    try {
      const fullName = newCommandName + newCommandExtension;
      await createCommand(fullName, newCommandContent);
      setIsCreateDialogOpen(false);
      setNewCommandName('');
      setNewCommandContent('#!/bin/bash\n\n');
      setNewCommandExtension('.sh');
    } catch (err) {
      console.error('Failed to create command:', err);
    }
  };

  const handleDeleteCommand = async (command: Command) => {
    if (!confirm(`Are you sure you want to delete "${command.name}"?`)) {
      return;
    }

    try {
      await deleteCommand(command.name, command.scope);
    } catch (err) {
      console.error('Failed to delete command:', err);
    }
  };

  const handleExtensionChange = (ext: string) => {
    setNewCommandExtension(ext);
    // Update shebang based on extension
    if (ext === '.sh') {
      setNewCommandContent('#!/bin/bash\n\n');
    } else if (ext === '.js') {
      setNewCommandContent('#!/usr/bin/env node\n\n');
    } else if (ext === '.py') {
      setNewCommandContent('#!/usr/bin/env python3\n\n');
    } else if (ext === '.rb') {
      setNewCommandContent('#!/usr/bin/env ruby\n\n');
    } else {
      setNewCommandContent('');
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Commands Manager</h2>
        <Button variant="primary" size="sm" onClick={() => setIsCreateDialogOpen(true)}>
          <Plus className="w-4 h-4 mr-2" />
          New Command
        </Button>
      </div>

      {/* Error banner */}
      {error && (
        <div className="mx-4 mt-4 p-3 bg-red-50 border border-red-200 rounded-md text-red-800 text-sm flex items-center">
          <AlertCircle className="w-4 h-4 mr-2 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Scope Selector */}
      <div className="p-4">
        <Tabs value={currentScope} onValueChange={(value) => setScope(value as 'global' | 'workspace')}>
          <TabsList>
            <TabsTrigger value="global">Global</TabsTrigger>
            <TabsTrigger value="workspace">Workspace</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Content - Split View */}
      <div className="flex flex-1 overflow-hidden">
        {/* Commands List */}
        <div className="w-1/3 border-r border-gray-200 dark:border-gray-700 overflow-y-auto">
          <div className="p-2">
            {isLoading && currentCommands.length === 0 ? (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                <p className="text-sm">Loading commands...</p>
              </div>
            ) : currentCommands.length === 0 ? (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                <FileCode className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No commands found</p>
                <p className="text-xs mt-1">Create your first command to get started</p>
              </div>
            ) : (
              <div className="space-y-1">
                {currentCommands.map((command) => (
                  <div
                    key={`${command.scope}-${command.name}`}
                    className={`
                      flex items-center justify-between p-3 rounded-md cursor-pointer
                      transition-colors hover:bg-gray-100 dark:hover:bg-gray-800
                      ${selectedCommand?.name === command.name && selectedCommand?.scope === command.scope ? 'bg-blue-50 dark:bg-blue-900/20' : ''}
                    `}
                    onClick={() => selectCommand(command)}
                  >
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <FileCode className="w-4 h-4 text-gray-500 dark:text-gray-400 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{command.name}</p>
                        <div className="flex items-center gap-1 mt-0.5">
                          {command.isExecutable ? (
                            <CheckCircle2 className="w-3 h-3 text-green-600" />
                          ) : (
                            <AlertCircle className="w-3 h-3 text-yellow-600" />
                          )}
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            {command.isExecutable ? 'Executable' : 'Not executable'}
                          </span>
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteCommand(command);
                      }}
                      className="p-1 hover:bg-red-100 dark:hover:bg-red-900/20 rounded"
                    >
                      <Trash2 className="w-4 h-4 text-red-600" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Command Editor */}
        <div className="flex-1 overflow-y-auto">
          {selectedCommand ? (
            <div className="p-4">
              <div className="mb-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                  <FileCode className="w-5 h-5" />
                  {selectedCommand.name}
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{selectedCommand.path}</p>
                <div className="flex items-center gap-2 mt-2">
                  <span
                    className={`
                    inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium
                    ${selectedCommand.isExecutable ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400' : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400'}
                  `}
                  >
                    {selectedCommand.isExecutable ? (
                      <CheckCircle2 className="w-3 h-3" />
                    ) : (
                      <AlertCircle className="w-3 h-3" />
                    )}
                    {selectedCommand.isExecutable ? 'Executable' : 'Not Executable'}
                  </span>
                </div>
              </div>

              <div className="bg-gray-50 dark:bg-gray-900 rounded-md border border-gray-200 dark:border-gray-700">
                <pre className="p-4 text-sm font-mono overflow-x-auto">
                  <code className="text-gray-900 dark:text-gray-100">{commandContent}</code>
                </pre>
              </div>

              {!selectedCommand.isExecutable && (
                <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-md text-yellow-800 text-sm">
                  <AlertCircle className="w-4 h-4 inline mr-2" />
                  This file is not executable. Commands must have executable permissions to run.
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-gray-500 dark:text-gray-400">
              <div className="text-center">
                <FileCode className="w-16 h-16 mx-auto mb-4 opacity-20" />
                <p>Select a command to view its content</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Create Command Dialog */}
      {isCreateDialogOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full mx-4">
            <div className="p-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Create New Command</h3>

              <div className="space-y-4">
                {/* Command Name */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Command Name
                  </label>
                  <div className="flex gap-2">
                    <Input
                      type="text"
                      placeholder="my-command"
                      value={newCommandName}
                      onChange={(e) => setNewCommandName(e.target.value)}
                      className="flex-1"
                    />
                    <select
                      value={newCommandExtension}
                      onChange={(e) => handleExtensionChange(e.target.value)}
                      className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    >
                      <option value=".sh">.sh (Bash)</option>
                      <option value=".js">.js (Node.js)</option>
                      <option value=".py">.py (Python)</option>
                      <option value=".rb">.rb (Ruby)</option>
                      <option value="">(no extension)</option>
                    </select>
                  </div>
                </div>

                {/* Command Content */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Script Content
                  </label>
                  <textarea
                    value={newCommandContent}
                    onChange={(e) => setNewCommandContent(e.target.value)}
                    placeholder="#!/bin/bash&#10;&#10;echo 'Hello, world!'"
                    className="w-full h-64 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md font-mono text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>

                {/* Info */}
                <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md text-blue-800 dark:text-blue-200 text-sm">
                  <p>
                    The command will be created with executable permissions (chmod +x) in the{' '}
                    <strong>{currentScope}</strong> commands directory.
                  </p>
                </div>
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-2 mt-6">
                <Button
                  variant="ghost"
                  onClick={() => {
                    setIsCreateDialogOpen(false);
                    setNewCommandName('');
                    setNewCommandContent('#!/bin/bash\n\n');
                    setNewCommandExtension('.sh');
                  }}
                >
                  Cancel
                </Button>
                <Button variant="primary" onClick={handleCreateCommand}>
                  Create Command
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
