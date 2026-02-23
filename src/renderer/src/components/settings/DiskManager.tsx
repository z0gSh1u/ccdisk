/**
 * DiskManager - SidePanel component for managing Disks
 * Left: disk list. Right: disk detail editor with skill/command/MCP checkboxes.
 */
import { useState, useEffect } from 'react';
import { useDiskStore } from '../../stores/disk-store';
import { Button, Input } from '../ui';
import { Disc, Code, Database, PenTool, Plus, Copy, Trash2, type LucideIcon } from 'lucide-react';
import type { DiskDefinition } from '../../../../shared/types';

const ICON_MAP: Record<string, LucideIcon> = {
  disc: Disc,
  code: Code,
  database: Database,
  'pen-tool': PenTool
};

const AVAILABLE_ICONS = ['disc', 'code', 'database', 'pen-tool'];

export function DiskManager() {
  const {
    disks,
    loadDisks,
    loadPoolResources,
    poolSkills,
    poolCommands,
    poolMCPServers,
    createDisk,
    updateDisk,
    deleteDisk,
    duplicateDisk
  } = useDiskStore();

  const [selectedDiskId, setSelectedDiskId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [newDiskName, setNewDiskName] = useState('');

  useEffect(() => {
    loadDisks();
    loadPoolResources();
  }, [loadDisks, loadPoolResources]);

  const selectedDisk = disks.find((d) => d.id === selectedDiskId) || null;

  const handleCreate = async () => {
    if (!newDiskName.trim()) return;
    await createDisk({
      name: newDiskName.trim(),
      description: '',
      icon: 'disc',
      systemPrompt: null,
      model: null,
      skills: [],
      commands: [],
      mcpServers: []
    });
    setNewDiskName('');
    setIsCreating(false);
  };

  const handleUpdateField = async (field: keyof DiskDefinition, value: unknown) => {
    if (!selectedDiskId) return;
    await updateDisk(selectedDiskId, { [field]: value });
  };

  const handleToggleSkill = async (skillName: string) => {
    if (!selectedDisk) return;
    const skills = selectedDisk.skills.includes(skillName)
      ? selectedDisk.skills.filter((s) => s !== skillName)
      : [...selectedDisk.skills, skillName];
    await updateDisk(selectedDisk.id, { skills });
  };

  const handleToggleCommand = async (cmdName: string) => {
    if (!selectedDisk) return;
    const commands = selectedDisk.commands.includes(cmdName)
      ? selectedDisk.commands.filter((c) => c !== cmdName)
      : [...selectedDisk.commands, cmdName];
    await updateDisk(selectedDisk.id, { commands });
  };

  const handleToggleMCP = async (serverName: string) => {
    if (!selectedDisk) return;
    const mcpServers = selectedDisk.mcpServers.includes(serverName)
      ? selectedDisk.mcpServers.filter((m) => m !== serverName)
      : [...selectedDisk.mcpServers, serverName];
    await updateDisk(selectedDisk.id, { mcpServers });
  };

  return (
    <div className="flex h-full gap-4">
      {/* Left: Disk List */}
      <div className="w-64 shrink-0 border-r border-border-subtle pr-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-text-secondary uppercase tracking-wider">Disks</h3>
          <button
            onClick={() => setIsCreating(true)}
            className="p-1 rounded hover:bg-bg-accent transition-colors"
            title="New Disk"
          >
            <Plus className="h-4 w-4 text-text-tertiary" />
          </button>
        </div>

        {isCreating && (
          <div className="mb-2 flex gap-1">
            <Input
              value={newDiskName}
              onChange={(e) => setNewDiskName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreate();
                if (e.key === 'Escape') setIsCreating(false);
              }}
              placeholder="Disk name..."
              className="text-sm"
              autoFocus
            />
          </div>
        )}

        <div className="space-y-0.5">
          {disks.map((disk) => {
            const Icon = ICON_MAP[disk.icon] || Disc;
            return (
              <button
                key={disk.id}
                onClick={() => setSelectedDiskId(disk.id)}
                className={`flex items-center gap-2 w-full px-3 py-2 rounded-lg text-left text-sm transition-colors ${
                  selectedDiskId === disk.id
                    ? 'bg-bg-accent text-text-primary font-medium'
                    : 'text-text-secondary hover:bg-bg-accent'
                }`}
              >
                <Icon className="h-4 w-4 text-text-tertiary shrink-0" />
                <span className="truncate flex-1">{disk.name}</span>
                {disk.builtIn && (
                  <span className="text-[10px] text-text-tertiary bg-bg-tertiary px-1.5 py-0.5 rounded">built-in</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Right: Disk Detail */}
      <div className="flex-1 min-w-0">
        {selectedDisk ? (
          <DiskDetail
            disk={selectedDisk}
            poolSkills={poolSkills}
            poolCommands={poolCommands}
            poolMCPServers={poolMCPServers}
            onUpdateField={handleUpdateField}
            onToggleSkill={handleToggleSkill}
            onToggleCommand={handleToggleCommand}
            onToggleMCP={handleToggleMCP}
            onDuplicate={(name) => duplicateDisk(selectedDisk.id, name)}
            onDelete={() => {
              deleteDisk(selectedDisk.id);
              setSelectedDiskId(null);
            }}
          />
        ) : (
          <div className="flex items-center justify-center h-full text-text-tertiary text-sm">
            Select a disk to view details
          </div>
        )}
      </div>
    </div>
  );
}

interface DiskDetailProps {
  disk: DiskDefinition;
  poolSkills: Array<{ name: string }>;
  poolCommands: Array<{ name: string }>;
  poolMCPServers: Record<string, unknown>;
  onUpdateField: (field: keyof DiskDefinition, value: unknown) => void;
  onToggleSkill: (name: string) => void;
  onToggleCommand: (name: string) => void;
  onToggleMCP: (name: string) => void;
  onDuplicate: (newName: string) => void;
  onDelete: () => void;
}

function DiskDetail({
  disk,
  poolSkills,
  poolCommands,
  poolMCPServers,
  onUpdateField,
  onToggleSkill,
  onToggleCommand,
  onToggleMCP,
  onDuplicate,
  onDelete
}: DiskDetailProps) {
  const [activeTab, setActiveTab] = useState<'skills' | 'commands' | 'mcp'>('skills');
  const isDefault = disk.isDefault;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-text-primary">{disk.name}</h3>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => onDuplicate(`${disk.name} Copy`)}>
            <Copy className="h-4 w-4 mr-1" />
            Duplicate
          </Button>
          {!disk.builtIn && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onDelete}
              className="text-red-600 hover:text-red-700 hover:bg-red-50"
            >
              <Trash2 className="h-4 w-4 mr-1" />
              Delete
            </Button>
          )}
        </div>
      </div>

      {/* Basic Info */}
      {!isDefault && (
        <>
          <div>
            <label className="text-xs font-medium text-text-tertiary uppercase tracking-wider mb-1 block">
              Description
            </label>
            <Input
              value={disk.description}
              onChange={(e) => onUpdateField('description', e.target.value)}
              disabled={disk.builtIn}
              placeholder="Brief description..."
            />
          </div>

          <div>
            <label className="text-xs font-medium text-text-tertiary uppercase tracking-wider mb-1 block">Icon</label>
            <div className="flex gap-2">
              {AVAILABLE_ICONS.map((iconName) => {
                const Icon = ICON_MAP[iconName] || Disc;
                return (
                  <button
                    key={iconName}
                    onClick={() => !disk.builtIn && onUpdateField('icon', iconName)}
                    className={`p-2 rounded-lg border transition-colors ${
                      disk.icon === iconName
                        ? 'border-accent bg-accent/5'
                        : 'border-border-subtle hover:border-accent/50'
                    }`}
                    disabled={disk.builtIn}
                  >
                    <Icon className="h-5 w-5" />
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-text-tertiary uppercase tracking-wider mb-1 block">
              System Prompt
            </label>
            <textarea
              value={disk.systemPrompt || ''}
              onChange={(e) => onUpdateField('systemPrompt', e.target.value || null)}
              disabled={disk.builtIn}
              placeholder="Instructions for the AI assistant..."
              className="w-full h-24 px-3 py-2 text-sm border border-border-subtle rounded-lg resize-none focus:outline-none focus:border-accent"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-text-tertiary uppercase tracking-wider mb-1 block">
              Model Preference
            </label>
            <Input
              value={disk.model || ''}
              onChange={(e) => onUpdateField('model', e.target.value || null)}
              disabled={disk.builtIn}
              placeholder="e.g. claude-sonnet-4-20250514 (leave empty for global default)"
            />
          </div>
        </>
      )}

      {isDefault && (
        <div className="bg-bg-tertiary rounded-lg p-4 text-sm text-text-secondary">
          The Default disk uses your existing global configuration from{' '}
          <code className="bg-bg-accent px-1 rounded">~/.claude/</code>. Skills, Commands, and MCP servers are loaded
          from the standard paths.
        </div>
      )}

      {/* Resource Tabs */}
      {!isDefault && (
        <>
          <div className="flex gap-1 border-b border-border-subtle">
            {(['skills', 'commands', 'mcp'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
                  activeTab === tab
                    ? 'border-accent text-accent'
                    : 'border-transparent text-text-tertiary hover:text-text-secondary'
                }`}
              >
                {tab === 'skills' ? 'Skills' : tab === 'commands' ? 'Commands' : 'MCP Servers'}
                <span className="ml-1 text-xs text-text-tertiary">
                  (
                  {tab === 'skills'
                    ? disk.skills.length
                    : tab === 'commands'
                      ? disk.commands.length
                      : disk.mcpServers.length}
                  )
                </span>
              </button>
            ))}
          </div>

          <div className="space-y-1">
            {activeTab === 'skills' &&
              (poolSkills.length > 0 ? (
                poolSkills.map((skill) => (
                  <label
                    key={skill.name}
                    className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-bg-accent cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={disk.skills.includes(skill.name)}
                      onChange={() => onToggleSkill(skill.name)}
                      disabled={disk.builtIn}
                      className="rounded border-border-subtle"
                    />
                    <span className="text-sm text-text-primary">{skill.name}</span>
                  </label>
                ))
              ) : (
                <div className="text-sm text-text-tertiary py-4 text-center">
                  No skills in pool. Add skills to ~/.ccdisk/skills/
                </div>
              ))}

            {activeTab === 'commands' &&
              (poolCommands.length > 0 ? (
                poolCommands.map((cmd) => (
                  <label
                    key={cmd.name}
                    className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-bg-accent cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={disk.commands.includes(cmd.name)}
                      onChange={() => onToggleCommand(cmd.name)}
                      disabled={disk.builtIn}
                      className="rounded border-border-subtle"
                    />
                    <span className="text-sm text-text-primary">{cmd.name}</span>
                  </label>
                ))
              ) : (
                <div className="text-sm text-text-tertiary py-4 text-center">
                  No commands in pool. Add commands to ~/.ccdisk/commands/
                </div>
              ))}

            {activeTab === 'mcp' &&
              (Object.keys(poolMCPServers).length > 0 ? (
                Object.keys(poolMCPServers).map((serverName) => (
                  <label
                    key={serverName}
                    className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-bg-accent cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={disk.mcpServers.includes(serverName)}
                      onChange={() => onToggleMCP(serverName)}
                      disabled={disk.builtIn}
                      className="rounded border-border-subtle"
                    />
                    <span className="text-sm text-text-primary">{serverName}</span>
                  </label>
                ))
              ) : (
                <div className="text-sm text-text-tertiary py-4 text-center">
                  No MCP servers in pool. Add servers to ~/.ccdisk/mcp-servers.json
                </div>
              ))}
          </div>
        </>
      )}
    </div>
  );
}
