/**
 * Server Editor Component - Form for creating/editing MCP server configs
 */

import { useState, useEffect } from 'react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Label } from '../ui/Label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/Select';
import { Textarea } from '../ui/Textarea';
import type { MCPServerConfig, MCPServerType } from '../../../../shared/types';

interface ServerEditorProps {
  mode: 'create' | 'edit' | 'view';
  serverName?: string;
  serverConfig?: MCPServerConfig;
  onSave: (name: string, config: MCPServerConfig) => Promise<void>;
  onCancel: () => void;
}

export function ServerEditor({ mode, serverName = '', serverConfig, onSave, onCancel }: ServerEditorProps) {
  const [name, setName] = useState(serverName);
  const [type, setType] = useState<MCPServerType>(serverConfig?.type || 'stdio');
  const [command, setCommand] = useState(serverConfig?.type === 'stdio' ? serverConfig.command : '');
  const [args, setArgs] = useState(
    serverConfig?.type === 'stdio' && serverConfig.args ? JSON.stringify(serverConfig.args, null, 2) : '[]'
  );
  const [url, setUrl] = useState(serverConfig?.type === 'sse' || serverConfig?.type === 'http' ? serverConfig.url : '');
  const [headers, setHeaders] = useState(
    serverConfig?.type === 'sse' || serverConfig?.type === 'http'
      ? JSON.stringify(serverConfig.headers || {}, null, 2)
      : '{}'
  );
  const [env, setEnv] = useState(
    serverConfig?.type === 'stdio' && serverConfig.env ? JSON.stringify(serverConfig.env, null, 2) : '{}'
  );

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);

  const isReadOnly = mode === 'view';

  // Update form when serverConfig changes (for edit mode)
  useEffect(() => {
    if (serverConfig) {
      setType(serverConfig.type);
      if (serverConfig.type === 'stdio') {
        setCommand(serverConfig.command);
        setArgs(JSON.stringify(serverConfig.args || [], null, 2));
        setEnv(JSON.stringify(serverConfig.env || {}, null, 2));
      } else {
        setUrl(serverConfig.url);
        setHeaders(JSON.stringify(serverConfig.headers || {}, null, 2));
      }
    }
  }, [serverConfig]);

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    // Name validation (only for create mode)
    if (mode === 'create') {
      if (!name.trim()) {
        newErrors.name = 'Server name is required';
      } else if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
        newErrors.name = 'Server name must contain only letters, numbers, hyphens, and underscores';
      }
    }

    // Type-specific validation
    if (type === 'stdio') {
      if (!command.trim()) {
        newErrors.command = 'Command is required for stdio servers';
      }

      // Validate args JSON
      try {
        const parsedArgs = JSON.parse(args);
        if (!Array.isArray(parsedArgs)) {
          newErrors.args = 'Args must be a JSON array';
        }
      } catch {
        newErrors.args = 'Invalid JSON format';
      }

      // Validate env JSON
      try {
        const parsedEnv = JSON.parse(env);
        if (typeof parsedEnv !== 'object' || Array.isArray(parsedEnv)) {
          newErrors.env = 'Environment variables must be a JSON object';
        }
      } catch {
        newErrors.env = 'Invalid JSON format';
      }
    } else {
      // sse or http
      if (!url.trim()) {
        newErrors.url = 'URL is required';
      } else {
        try {
          new URL(url);
        } catch {
          newErrors.url = 'Invalid URL format';
        }
      }

      // Validate headers JSON
      try {
        const parsedHeaders = JSON.parse(headers);
        if (typeof parsedHeaders !== 'object' || Array.isArray(parsedHeaders)) {
          newErrors.headers = 'Headers must be a JSON object';
        }
      } catch {
        newErrors.headers = 'Invalid JSON format';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setIsSaving(true);

    try {
      let config: MCPServerConfig;

      if (type === 'stdio') {
        const parsedArgs = JSON.parse(args);
        const parsedEnv = JSON.parse(env);
        config = {
          type: 'stdio',
          command,
          ...(parsedArgs.length > 0 && { args: parsedArgs }),
          ...(Object.keys(parsedEnv).length > 0 && { env: parsedEnv })
        };
      } else {
        const parsedHeaders = JSON.parse(headers);
        config = {
          type,
          url,
          ...(Object.keys(parsedHeaders).length > 0 && { headers: parsedHeaders })
        };
      }

      await onSave(mode === 'create' ? name : serverName, config);
    } catch (error) {
      setErrors({ submit: (error as Error).message || 'Failed to save server configuration' });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div>
      <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-6">
        {mode === 'create' ? 'Add New Server' : mode === 'edit' ? 'Edit Server' : 'Server Details'}
      </h2>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Server Name (only editable in create mode) */}
        <div>
          <Label htmlFor="name">Server Name</Label>
          <Input
            id="name"
            value={mode === 'create' ? name : serverName}
            onChange={(e) => setName(e.target.value)}
            disabled={mode !== 'create'}
            placeholder="e.g., filesystem"
            className="mt-1"
          />
          {errors.name && <p className="text-red-500 text-sm mt-1">{errors.name}</p>}
        </div>

        {/* Server Type */}
        <div>
          <Label htmlFor="type">Server Type</Label>
          <Select value={type} onValueChange={(value) => setType(value as MCPServerType)} disabled={isReadOnly}>
            <SelectTrigger id="type" className="mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="stdio">stdio</SelectItem>
              <SelectItem value="sse">sse</SelectItem>
              <SelectItem value="http">http</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* stdio-specific fields */}
        {type === 'stdio' && (
          <>
            <div>
              <Label htmlFor="command">Command</Label>
              <Input
                id="command"
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                disabled={isReadOnly}
                placeholder="e.g., npx"
                className="mt-1"
              />
              {errors.command && <p className="text-red-500 text-sm mt-1">{errors.command}</p>}
            </div>

            <div>
              <Label htmlFor="args">Arguments (JSON array)</Label>
              <Textarea
                id="args"
                value={args}
                onChange={(e) => setArgs(e.target.value)}
                disabled={isReadOnly}
                placeholder='["-y", "@modelcontextprotocol/server-filesystem", "/path"]'
                className="mt-1 font-mono text-sm"
                rows={4}
              />
              {errors.args && <p className="text-red-500 text-sm mt-1">{errors.args}</p>}
            </div>

            <div>
              <Label htmlFor="env">Environment Variables (JSON object)</Label>
              <Textarea
                id="env"
                value={env}
                onChange={(e) => setEnv(e.target.value)}
                disabled={isReadOnly}
                placeholder='{"API_KEY": "value"}'
                className="mt-1 font-mono text-sm"
                rows={4}
              />
              {errors.env && <p className="text-red-500 text-sm mt-1">{errors.env}</p>}
            </div>
          </>
        )}

        {/* sse/http-specific fields */}
        {(type === 'sse' || type === 'http') && (
          <>
            <div>
              <Label htmlFor="url">URL</Label>
              <Input
                id="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                disabled={isReadOnly}
                placeholder="https://api.example.com/mcp"
                className="mt-1"
              />
              {errors.url && <p className="text-red-500 text-sm mt-1">{errors.url}</p>}
            </div>

            <div>
              <Label htmlFor="headers">Headers (JSON object)</Label>
              <Textarea
                id="headers"
                value={headers}
                onChange={(e) => setHeaders(e.target.value)}
                disabled={isReadOnly}
                placeholder='{"Authorization": "Bearer token"}'
                className="mt-1 font-mono text-sm"
                rows={4}
              />
              {errors.headers && <p className="text-red-500 text-sm mt-1">{errors.headers}</p>}
            </div>
          </>
        )}

        {/* Error message */}
        {errors.submit && (
          <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md">
            <p className="text-red-600 dark:text-red-400 text-sm">{errors.submit}</p>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3 pt-4">
          {!isReadOnly && (
            <Button type="submit" variant="primary" disabled={isSaving}>
              {isSaving ? 'Saving...' : mode === 'create' ? 'Add Server' : 'Save Changes'}
            </Button>
          )}
          <Button type="button" variant="secondary" onClick={onCancel}>
            {isReadOnly ? 'Close' : 'Cancel'}
          </Button>
        </div>
      </form>
    </div>
  );
}
