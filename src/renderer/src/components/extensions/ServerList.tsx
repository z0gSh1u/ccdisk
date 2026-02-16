/**
 * Server List Component - Displays list of MCP servers
 */

import { Button } from '../ui/Button';
import type { MCPServerConfig } from '../../../../shared/types';

interface ServerListProps {
  servers: Array<[string, MCPServerConfig]>;
  selectedServer: string | null;
  onSelect: (serverName: string) => void;
  onEdit: (serverName: string) => void;
  onDelete: (serverName: string) => void;
  isEditing: boolean;
}

export function ServerList({ servers, selectedServer, onSelect, onEdit, onDelete, isEditing }: ServerListProps) {
  if (servers.length === 0) {
    return <div className="text-center text-gray-500 text-sm py-8">No servers configured</div>;
  }

  return (
    <div className="space-y-2">
      {servers.map(([name, config]) => (
        <div
          key={name}
          className={`
            p-3 rounded-lg border cursor-pointer transition-colors
            ${
              selectedServer === name
                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'
            }
          `}
          onClick={() => onSelect(name)}
        >
          <div className="flex items-start justify-between mb-1">
            <h3 className="font-medium text-gray-900 dark:text-white text-sm">{name}</h3>
            <span className="text-xs px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400">
              {config.type}
            </span>
          </div>

          <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
            {config.type === 'stdio' ? <>Command: {config.command}</> : <>URL: {config.url}</>}
          </p>

          <div className="flex gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={(e) => {
                e.stopPropagation();
                onEdit(name);
              }}
              disabled={isEditing}
              className="text-xs"
            >
              Edit
            </Button>
            <Button
              size="sm"
              variant="danger"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(name);
              }}
              disabled={isEditing}
              className="text-xs"
            >
              Delete
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
