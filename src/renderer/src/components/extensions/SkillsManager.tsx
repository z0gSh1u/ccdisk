/**
 * Skills Manager Component
 * Manages Claude Code skills with scope selection, list view, and markdown editor
 */

import { useEffect, useState } from 'react';
import { useSkillsStore } from '../../stores/skills-store';
import type { Skill } from '../../../../shared/types';
import { Button } from '../ui/Button';
import { Tabs, TabsList, TabsTrigger } from '../ui/Tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '../ui/Dialog';
import { cn } from '../../lib/utils';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export function SkillsManager() {
  const {
    skills,
    currentScope,
    selectedSkill,
    isLoading,
    error,
    setScope,
    loadSkills,
    selectSkill,
    createSkill,
    updateSkill,
    deleteSkill,
    getSkillsByScope,
    setupSkillsWatcher
  } = useSkillsStore();

  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [newSkillName, setNewSkillName] = useState('');
  const [editContent, setEditContent] = useState('');
  const [showPreview, setShowPreview] = useState(false);

  // Load skills on mount and setup file watcher
  useEffect(() => {
    loadSkills();
    const cleanup = setupSkillsWatcher();
    return cleanup;
  }, [loadSkills, setupSkillsWatcher]);

  // Get skills for current scope
  const currentSkills = getSkillsByScope(currentScope);

  // Handle create new skill
  const handleCreateSkill = async () => {
    if (!newSkillName.trim()) {
      alert('Please enter a skill name');
      return;
    }

    try {
      await createSkill(newSkillName.trim(), '# New Skill\n\nAdd your skill content here...');
      setIsCreateDialogOpen(false);
      setNewSkillName('');
      // Select the newly created skill
      const newSkill = skills.find((s) => s.name === newSkillName.trim() && s.scope === currentScope);
      if (newSkill) {
        selectSkill(newSkill);
        setIsEditMode(true);
        setEditContent(newSkill.content);
      }
    } catch (error) {
      console.error('Failed to create skill:', error);
      alert(`Failed to create skill: ${(error as Error).message}`);
    }
  };

  // Handle edit skill
  const handleEditSkill = (skill: Skill) => {
    selectSkill(skill);
    setEditContent(skill.content);
    setIsEditMode(true);
    setShowPreview(false);
  };

  // Handle save skill
  const handleSaveSkill = async () => {
    if (!selectedSkill) return;

    try {
      await updateSkill(selectedSkill.name, editContent);
      setIsEditMode(false);
      alert('Skill saved successfully!');
    } catch (error) {
      console.error('Failed to save skill:', error);
      alert(`Failed to save skill: ${(error as Error).message}`);
    }
  };

  // Handle cancel edit
  const handleCancelEdit = () => {
    setIsEditMode(false);
    setEditContent('');
    selectSkill(null);
  };

  // Handle delete skill
  const handleDeleteSkill = async (skill: Skill) => {
    if (!confirm(`Are you sure you want to delete "${skill.name}"?`)) {
      return;
    }

    try {
      await deleteSkill(skill.name, skill.scope);
      alert('Skill deleted successfully!');
    } catch (error) {
      console.error('Failed to delete skill:', error);
      alert(`Failed to delete skill: ${(error as Error).message}`);
    }
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header with scope selector */}
      <div className="flex items-center justify-between border-b border-gray-200 p-4">
        <h2 className="text-xl font-semibold">Skills Manager</h2>
        <Tabs value={currentScope} onValueChange={(value) => setScope(value as 'global' | 'workspace')}>
          <TabsList>
            <TabsTrigger value="global">Global</TabsTrigger>
            <TabsTrigger value="workspace">Workspace</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Error message */}
      {error && <div className="mx-4 mt-4 rounded-md bg-red-50 p-3 text-sm text-red-800">{error}</div>}

      <div className="flex flex-1 overflow-hidden">
        {/* Skills list sidebar */}
        <div className="w-80 border-r border-gray-200 overflow-y-auto">
          <div className="p-4">
            <Button
              variant="primary"
              className="w-full"
              onClick={() => setIsCreateDialogOpen(true)}
              disabled={isLoading}
            >
              Create New Skill
            </Button>
          </div>

          {isLoading && !skills.length ? (
            <div className="p-4 text-center text-sm text-gray-500">Loading skills...</div>
          ) : currentSkills.length === 0 ? (
            <div className="p-4 text-center text-sm text-gray-500">No skills found in {currentScope} scope</div>
          ) : (
            <div className="space-y-1 px-2 pb-4">
              {currentSkills.map((skill) => (
                <div
                  key={`${skill.scope}-${skill.name}`}
                  className={cn(
                    'group flex items-center justify-between rounded-md px-3 py-2 text-sm transition-colors',
                    'hover:bg-gray-100 cursor-pointer',
                    selectedSkill?.name === skill.name && selectedSkill?.scope === skill.scope
                      ? 'bg-blue-50 text-blue-900'
                      : 'text-gray-700'
                  )}
                  onClick={() => {
                    selectSkill(skill);
                    setIsEditMode(false);
                    setShowPreview(false);
                  }}
                >
                  <span className="truncate font-medium">{skill.name}</span>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-xs"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleEditSkill(skill);
                      }}
                    >
                      Edit
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      className="h-6 px-2 text-xs"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteSkill(skill);
                      }}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Content area - Editor or Preview */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {selectedSkill ? (
            <>
              {/* Toolbar */}
              <div className="flex items-center justify-between border-b border-gray-200 p-3">
                <div>
                  <h3 className="font-semibold text-lg">{selectedSkill.name}</h3>
                  <p className="text-xs text-gray-500">
                    {selectedSkill.scope === 'global' ? 'Global Skill' : 'Workspace Skill'}
                  </p>
                </div>
                <div className="flex gap-2">
                  {isEditMode ? (
                    <>
                      <Button variant="ghost" size="sm" onClick={() => setShowPreview(!showPreview)}>
                        {showPreview ? 'Edit' : 'Preview'}
                      </Button>
                      <Button variant="secondary" size="sm" onClick={handleCancelEdit}>
                        Cancel
                      </Button>
                      <Button variant="primary" size="sm" onClick={handleSaveSkill}>
                        Save
                      </Button>
                    </>
                  ) : (
                    <Button variant="primary" size="sm" onClick={() => handleEditSkill(selectedSkill)}>
                      Edit Skill
                    </Button>
                  )}
                </div>
              </div>

              {/* Editor or Preview */}
              <div className="flex-1 overflow-y-auto p-4">
                {isEditMode && !showPreview ? (
                  <textarea
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    className="w-full h-full min-h-[500px] rounded-md border border-gray-300 p-4 font-mono text-sm resize-none focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Enter skill content in Markdown..."
                  />
                ) : (
                  <div className="prose prose-sm max-w-none">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {isEditMode ? editContent : selectedSkill.content}
                    </ReactMarkdown>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center text-gray-500">
              <div className="text-center">
                <p className="text-lg font-medium">No skill selected</p>
                <p className="text-sm">Select a skill from the list or create a new one</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Create Skill Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Skill</DialogTitle>
            <DialogDescription>Create a new skill in the {currentScope} scope</DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <label htmlFor="skill-name" className="block text-sm font-medium text-gray-700 mb-2">
              Skill Name
            </label>
            <input
              id="skill-name"
              type="text"
              value={newSkillName}
              onChange={(e) => setNewSkillName(e.target.value)}
              placeholder="my-skill"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleCreateSkill();
                }
              }}
            />
            <p className="mt-1 text-xs text-gray-500">
              Name should be lowercase with hyphens (e.g., &quot;my-custom-skill&quot;)
            </p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsCreateDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleCreateSkill}>
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
