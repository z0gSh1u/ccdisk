/**
 * ClaudeConfigEditor - Direct editor for ~/.claude/settings.json env variables
 */

import { useEffect, useState, useCallback } from 'react';

import { Save, Eye, EyeOff, RefreshCw } from 'lucide-react';

import { Button, Input, Label } from '../ui';

interface EnvField {
  key: string;
  label: string;
  placeholder: string;
  isSecret: boolean;
}

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

export function ClaudeConfigEditor() {
  const [values, setValues] = useState<Record<string, string>>({});
  const [visibleSecrets, setVisibleSecrets] = useState<Record<string, boolean>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const showMessage = useCallback((type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 3000);
  }, []);

  const loadEnv = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await window.api.settings.getClaudeEnv();
      if (response.success && response.data) {
        setValues(response.data);
      } else {
        showMessage('error', response.error || 'Failed to load configuration');
      }
    } catch (error) {
      console.error('Failed to load Claude env:', error);
      showMessage('error', (error as Error).message);
    } finally {
      setIsLoading(false);
    }
  }, [showMessage]);

  useEffect(() => {
    loadEnv();
  }, [loadEnv]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      // Only send non-empty values
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
  };

  const toggleSecretVisibility = (key: string) => {
    setVisibleSecrets((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-gray-500">
          Configure Claude environment variables stored in{' '}
          <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs font-mono">~/.claude/settings.json</code>
        </p>
      </div>

      <div className="space-y-4">
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
            <p className="text-xs text-gray-400 font-mono">{field.key}</p>
          </div>
        ))}
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
        <Button variant="ghost" size="sm" onClick={loadEnv} disabled={isLoading}>
          <RefreshCw className={`mr-1.5 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>
    </div>
  );
}
