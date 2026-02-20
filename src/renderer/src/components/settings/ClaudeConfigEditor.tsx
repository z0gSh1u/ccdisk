/**
 * ClaudeConfigEditor - Direct editor for ~/.claude/settings.json env variables
 */

import { useEffect, useState, useCallback } from 'react';

import { Save, Eye, EyeOff, ExternalLink } from 'lucide-react';

import { Button, Input, Label } from '../ui';

interface EnvField {
  key: string;
  label: string;
  placeholder: string;
  isSecret: boolean;
}

interface ProviderPreset {
  id: string;
  name: string;
  baseUrl: string;
  model: string;
  apiKeyUrl: string;
}

const PRESETS: ProviderPreset[] = [
  {
    id: 'deepseek',
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/anthropic',
    model: 'DeepSeek-V3.2',
    apiKeyUrl: 'https://platform.deepseek.com'
  },
  {
    id: 'zhipu',
    name: '智谱 GLM (国内版)',
    baseUrl: 'https://open.bigmodel.cn/api/anthropic',
    model: 'glm-4.7',
    apiKeyUrl: 'https://www.bigmodel.cn/claude-code'
  },
  {
    id: 'minimax',
    name: 'Minimax (国内版)',
    baseUrl: 'https://api.minimaxi.com/anthropic',
    model: 'MiniMax-M2.5',
    apiKeyUrl: 'https://platform.minimaxi.com/subscribe/coding-plan'
  }
];

const ENV_FIELDS: EnvField[] = [
  { key: 'ANTHROPIC_AUTH_TOKEN', label: 'Auth Token', placeholder: 'sk-ant-...', isSecret: true },
  {
    key: 'ANTHROPIC_BASE_URL',
    label: 'Base URL',
    placeholder: 'https://api.anthropic.com (leave empty for default)',
    isSecret: false
  },
  {
    key: 'ANTHROPIC_MODEL',
    label: 'Model',
    placeholder: 'claude-sonnet-4-20250514',
    isSecret: false
  }
];

interface ClaudeConfigEditorProps {
  onClose?: () => void;
}

export function ClaudeConfigEditor({ onClose }: ClaudeConfigEditorProps) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [visibleSecrets, setVisibleSecrets] = useState<Record<string, boolean>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [selectedPreset, setSelectedPreset] = useState<string>('');
  const [aiTitles, setAiTitles] = useState(false);
  const [aiTitlesLoaded, setAiTitlesLoaded] = useState(false);

  const showMessage = useCallback((type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 3000);
  }, []);

  const loadEnv = useCallback(async () => {
    try {
      const response = await window.api.settings.getClaudeEnv();
      if (response.success && response.data) {
        setValues(response.data);

        const matchedPreset = PRESETS.find((p) => p.baseUrl === response.data?.ANTHROPIC_BASE_URL);
        if (matchedPreset) {
          setSelectedPreset(matchedPreset.id);
        } else {
          setSelectedPreset('');
        }
      } else {
        showMessage('error', response.error || 'Failed to load configuration');
      }
    } catch (error) {
      console.error('Failed to load Claude env:', error);
      showMessage('error', (error as Error).message);
    }
  }, [showMessage]);

  useEffect(() => {
    loadEnv();
  }, [loadEnv]);

  useEffect(() => {
    window.api.settings.get('ai_generate_titles').then((res) => {
      if (res.success) {
        setAiTitles(res.data === 'true');
      }
      setAiTitlesLoaded(true);
    });
  }, []);

  const handlePresetChange = (presetId: string) => {
    setSelectedPreset(presetId);
    if (presetId) {
      const preset = PRESETS.find((p) => p.id === presetId);
      if (preset) {
        setValues((prev) => ({
          ...prev,
          ANTHROPIC_BASE_URL: preset.baseUrl,
          ANTHROPIC_MODEL: preset.model
        }));
      }
    }
  };

  const handleOpenApiKeyUrl = async (url: string) => {
    try {
      await window.api.openExternal(url);
    } catch (error) {
      console.error('Failed to open URL:', error);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const envUpdates: Record<string, string> = {};
      for (const field of ENV_FIELDS) {
        const value = values[field.key]?.trim();
        if (value) {
          envUpdates[field.key] = value;
        }
      }

      if (envUpdates.ANTHROPIC_MODEL) {
        envUpdates.ANTHROPIC_DEFAULT_SONNET_MODEL = envUpdates.ANTHROPIC_MODEL;
        envUpdates.ANTHROPIC_DEFAULT_OPUS_MODEL = envUpdates.ANTHROPIC_MODEL;
        envUpdates.ANTHROPIC_DEFAULT_HAIKU_MODEL = envUpdates.ANTHROPIC_MODEL;
      }

      const response = await window.api.settings.updateClaudeEnv(envUpdates);
      if (response.success) {
        showMessage('success', 'Configuration saved successfully');
        setTimeout(() => {
          onClose?.();
        }, 500);
      } else {
        showMessage('error', response.error || 'Failed to save configuration');
      }
    } catch (error) {
      console.error('Failed to save Claude env:', error);
      showMessage('error', (error as Error).message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleFieldChange = (key: string, value: string) => {
    setValues((prev) => ({ ...prev, [key]: value }));
    setSelectedPreset('');
  };

  const toggleSecretVisibility = (key: string) => {
    setVisibleSecrets((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleAiTitlesToggle = async (enabled: boolean) => {
    setAiTitles(enabled);
    try {
      await window.api.settings.set('ai_generate_titles', enabled ? 'true' : 'false');
    } catch (error) {
      console.error('Failed to save AI titles setting:', error);
      setAiTitles(!enabled); // revert on error
    }
  };

  const currentPreset = PRESETS.find((p) => p.id === selectedPreset);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-gray-500">
          Configure Claude environment variables stored in{' '}
          <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs font-mono">~/.claude/settings.json</code>
        </p>
      </div>

      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="preset">Provider Preset</Label>
          <select
            id="preset"
            value={selectedPreset}
            onChange={(e) => handlePresetChange(e.target.value)}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <option value="">Custom (manual configuration)</option>
            {PRESETS.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.name}
              </option>
            ))}
          </select>
          {currentPreset && (
            <button
              onClick={() => handleOpenApiKeyUrl(currentPreset.apiKeyUrl)}
              className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1"
            >
              <ExternalLink className="h-3 w-3" />
              Get API Key
            </button>
          )}
        </div>

        {ENV_FIELDS.map((field) => (
          <div key={field.key} className="space-y-1.5">
            <Label htmlFor={field.key}>{field.label}</Label>
            <div className="flex gap-2">
              <Input
                id={field.key}
                type={field.isSecret && !visibleSecrets[field.key] ? 'password' : 'text'}
                value={values[field.key] || ''}
                onChange={(e) => handleFieldChange(field.key, e.target.value)}
                placeholder={field.placeholder}
                className="flex-1 font-mono text-sm"
              />
              {field.isSecret && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => toggleSecretVisibility(field.key)}
                  className="shrink-0"
                  title={visibleSecrets[field.key] ? 'Hide value' : 'Show value'}
                >
                  {visibleSecrets[field.key] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="border-t border-gray-200 pt-4">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label>AI Generate Chat Titles</Label>
            <p className="text-xs text-gray-500">
              Use AI to automatically generate titles for new chats. Incurs additional API call costs.
            </p>
          </div>
          <button
            role="switch"
            aria-checked={aiTitles}
            disabled={!aiTitlesLoaded}
            onClick={() => handleAiTitlesToggle(!aiTitles)}
            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${
              aiTitles ? 'bg-blue-600' : 'bg-gray-200'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                aiTitles ? 'translate-x-4' : 'translate-x-0'
              }`}
            />
          </button>
        </div>
      </div>

      {message && (
        <div
          className={`rounded-md px-3 py-2 text-sm ${
            message.type === 'success'
              ? 'bg-green-50 text-green-700 border border-green-200'
              : 'bg-red-50 text-red-700 border border-red-200'
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="flex items-center gap-2">
        <Button variant="primary" size="sm" onClick={handleSave} disabled={isSaving}>
          <Save className="mr-1.5 h-4 w-4" />
          {isSaving ? 'Saving...' : 'Save Configuration'}
        </Button>
      </div>
    </div>
  );
}
