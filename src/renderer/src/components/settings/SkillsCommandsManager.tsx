/**
 * SkillsCommandsManager - Merged Skills & Commands management
 * Split view: left sidebar (list) + right panel (detail/editor)
 * Two sections: Skills, Commands
 */

import { useEffect, useState, useCallback } from 'react';
import { FileCode, AlertCircle, BookOpen, Terminal } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { useSkillsStore } from '../../stores/skills-store';
import { useCommandsStore } from '../../stores/commands-store';
import { cn } from '../../lib/utils';
import { ScrollArea } from '../ui/ScrollArea';
import { Tabs, TabsList, TabsTrigger } from '../ui/Tabs';

import type { Skill, Command } from '../../../../shared/types';
import type { SkillScope } from '../../stores/skills-store';
import type { CommandScope } from '../../stores/commands-store';

type ItemType = 'skill' | 'command';
type Scope = 'global' | 'workspace';

interface SelectedItem {
  type: ItemType;
  skill?: Skill;
  command?: Command;
}

/**
 * SkillsCommandsManager - Unified view for Skills and Commands
 */
export function SkillsCommandsManager() {
  // Store hooks
  const {
    currentScope: skillsScope,
    error: skillsError,
    setScope: setSkillsScope,
    loadSkills,
    selectSkill,
    getSkillsByScope,
    setupSkillsWatcher
  } = useSkillsStore();

  const {
    currentScope: commandsScope,
    commandContent,
    error: commandsError,
    setScope: setCommandsScope,
    loadCommands,
    selectCommand,
    getCommandsByScope,
    setupCommandsWatcher
  } = useCommandsStore();

  // Local state
  const [scope, setScope] = useState<Scope>('global');
  const [selected, setSelected] = useState<SelectedItem | null>(null);

  // Derived state
  const error = skillsError || commandsError;

  const currentSkills = getSkillsByScope(scope);
  const currentCommands = getCommandsByScope(scope);

  // Scope change handler - sync both stores
  const handleScopeChange = useCallback(
    (newScope: Scope) => {
      setScope(newScope);
      setSelected(null);

      // Only update stores if scope actually changed
      if (newScope !== skillsScope) setSkillsScope(newScope as SkillScope);
      if (newScope !== commandsScope) setCommandsScope(newScope as CommandScope);
    },
    [skillsScope, commandsScope, setSkillsScope, setCommandsScope]
  );

  // Load data on mount
  useEffect(() => {
    loadSkills();
    loadCommands();
    const cleanupSkills = setupSkillsWatcher();
    const cleanupCommands = setupCommandsWatcher();
    return () => {
      cleanupSkills();
      cleanupCommands();
    };
  }, [loadSkills, loadCommands, setupSkillsWatcher, setupCommandsWatcher]);

  // Selection handlers
  const handleSelectSkill = (skill: Skill) => {
    setSelected({ type: 'skill', skill });
    selectSkill(skill);
  };

  const handleSelectCommand = async (command: Command) => {
    setSelected({ type: 'command', command });
    await selectCommand(command);
  };

  // Render sidebar section
  const renderSectionHeader = (title: string, icon: React.ReactNode, count: number) => (
    <div className="flex items-center justify-between px-3 py-2 mt-2 first:mt-0">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
        {icon}
        <span>{title}</span>
        <span className="rounded-full bg-gray-200 px-1.5 py-0.5 text-[10px] dark:bg-gray-700">{count}</span>
      </div>
    </div>
  );

  // Render skill list item
  const renderSkillItem = (skill: Skill) => {
    const isSelected =
      selected?.type === 'skill' && selected.skill?.name === skill.name && selected.skill?.scope === skill.scope;

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
      </div>
    );
  };

  // Render command list item
  const renderCommandItem = (command: Command) => {
    const isSelected =
      selected?.type === 'command' &&
      selected.command?.name === command.name &&
      selected.command?.scope === command.scope;

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
        </div>
      </div>
    );
  };

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
      );
    }

    if (selected.type === 'skill' && selected.skill) {
      return renderSkillDetail(selected.skill);
    }

    if (selected.type === 'command' && selected.command) {
      return renderCommandDetail(selected.command);
    }

    return null;
  };

  const formatFrontmatterValue = (value: unknown) => {
    if (Array.isArray(value)) return value;
    if (value && typeof value === 'object') return JSON.stringify(value, null, 2);
    return String(value);
  };

  const parseSkillFrontmatter = (content: string) => {
    const trimmed = content.trimStart();
    if (!trimmed.startsWith('---\n') && !trimmed.startsWith('---\r\n')) {
      return { frontmatter: {}, body: content };
    }

    const endIndex = trimmed.indexOf('\n---', 4);
    const endIndexCrlf = trimmed.indexOf('\r\n---', 4);
    const endMarkerIndex = endIndex === -1 ? endIndexCrlf : endIndex;
    if (endMarkerIndex === -1) {
      return { frontmatter: {}, body: content };
    }

    const frontmatterRaw = trimmed.slice(4, endMarkerIndex).trim();
    const bodyStart = trimmed.slice(endMarkerIndex + 4);
    const body = bodyStart.replace(/^\r?\n/, '');

    const frontmatter = parseYamlFrontmatter(frontmatterRaw);
    return { frontmatter, body };
  };

  const parseYamlFrontmatter = (raw: string): Record<string, unknown> => {
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
  };

  // Skill detail panel
  const renderSkillDetail = (skill: Skill) => {
    const parsed = parseSkillFrontmatter(skill.content || '');
    const frontmatter = parsed.frontmatter;
    const frontmatterEntries = Object.entries(frontmatter);
    const hasFrontmatter = frontmatterEntries.length > 0;

    return (
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Header */}
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
        </div>

        {/* Content */}
        <ScrollArea className="flex-1 p-4">
          <div className="space-y-4">
            {hasFrontmatter && (
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200">
                <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Metadata
                </div>
                <div className="grid gap-3">
                  {frontmatterEntries.map(([key, value]) => (
                    <div key={key} className="flex flex-col gap-2">
                      <div className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                        {key}
                      </div>
                      {Array.isArray(value) ? (
                        <div className="flex flex-wrap gap-2">
                          {value.map((item, index) => (
                            <span
                              key={`${key}-${index}`}
                              className="rounded-full bg-gray-200 px-2 py-0.5 text-xs text-gray-700 dark:bg-gray-800 dark:text-gray-200"
                            >
                              {String(item)}
                            </span>
                          ))}
                        </div>
                      ) : typeof value === 'object' && value !== null ? (
                        <pre className="overflow-x-auto rounded-md bg-gray-100 p-3 text-xs text-gray-700 dark:bg-gray-800 dark:text-gray-200">
                          {formatFrontmatterValue(value)}
                        </pre>
                      ) : (
                        <div className="text-sm text-gray-800 dark:text-gray-100">{formatFrontmatterValue(value)}</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="prose prose-sm max-w-none dark:prose-invert">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{parsed.body}</ReactMarkdown>
            </div>
          </div>
        </ScrollArea>
      </div>
    );
  };

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
      </div>

      {/* Content */}
      <ScrollArea className="flex-1 p-4">
        <div className="rounded-md border border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-900">
          <pre className="overflow-x-auto p-4 text-sm font-mono">
            <code className="text-gray-900 dark:text-gray-100">{commandContent || 'Loading...'}</code>
          </pre>
        </div>
      </ScrollArea>
    </div>
  );

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

        <div className="flex gap-2" />
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
            {renderSectionHeader('Skills', <BookOpen className="h-3 w-3" />, currentSkills.length)}
            {currentSkills.length === 0 ? (
              <p className="px-3 py-2 text-xs text-gray-400">No skills in {scope} scope</p>
            ) : (
              currentSkills.map(renderSkillItem)
            )}

            {/* Commands section */}
            {renderSectionHeader('Commands', <Terminal className="h-3 w-3" />, currentCommands.length)}
            {currentCommands.length === 0 ? (
              <p className="px-3 py-2 text-xs text-gray-400">No commands in {scope} scope</p>
            ) : (
              currentCommands.map(renderCommandItem)
            )}
          </div>
        </ScrollArea>

        {/* Right panel - detail/editor */}
        {renderDetailPanel()}
      </div>
    </div>
  );
}
