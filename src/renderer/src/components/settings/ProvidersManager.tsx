/**
 * ProvidersManager Component - Manage API providers
 */

import { useEffect, useState } from 'react'
import { useSettingsStore } from '../../stores/settings-store'
import { Button, Input, ScrollArea } from '../ui'
import { Plus, Check, Trash2, Eye, EyeOff } from 'lucide-react'
import type { Provider } from '../../../../shared/types'

export function ProvidersManager() {
  const { providers, loadProviders, deleteProvider } = useSettingsStore()

  const [isAdding, setIsAdding] = useState(false)
  const [showSecrets, setShowSecrets] = useState(false)
  const [newProvider, setNewProvider] = useState({
    name: '',
    apiKey: '',
    baseUrl: ''
  })

  useEffect(() => {
    loadProviders()
  }, [loadProviders])

  const handleAdd = async () => {
    if (!newProvider.name.trim() || !newProvider.apiKey.trim()) {
      return
    }

    try {
      const response = await window.api.settings.createProvider({
        name: newProvider.name,
        apiKey: newProvider.apiKey,
        baseUrl: newProvider.baseUrl || null,
        extraEnv: null,
        isActive: false
      })

      if (response.success) {
        setNewProvider({ name: '', apiKey: '', baseUrl: '' })
        setIsAdding(false)
        await loadProviders()
      }
    } catch (error) {
      console.error('Failed to create provider:', error)
      alert('Failed to create provider')
    }
  }

  const handleActivate = async (id: string) => {
    try {
      const response = await window.api.settings.activateProvider(id)
      if (response.success) {
        await loadProviders()
      }
    } catch (error) {
      console.error('Failed to activate provider:', error)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this provider?')) {
      return
    }

    try {
      await deleteProvider(id)
    } catch (error) {
      console.error('Failed to delete provider:', error)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div className="text-sm text-text-secondary">
          Configure Claude API providers. The active provider will be used for all conversations.
        </div>
        <Button
          size="sm"
          onClick={() => setIsAdding(!isAdding)}
          className="bg-accent text-white hover:bg-accent-hover"
        >
          <Plus className="h-4 w-4 mr-1" />
          Add Provider
        </Button>
      </div>

      {isAdding && (
        <div className="border border-border-subtle rounded-lg p-4 space-y-3">
          <Input
            placeholder="Provider Name (e.g. My Anthropic Account)"
            value={newProvider.name}
            onChange={(e) => setNewProvider({ ...newProvider, name: e.target.value })}
          />
          <Input
            type={showSecrets ? 'text' : 'password'}
            placeholder="API Key (sk-ant-...)"
            value={newProvider.apiKey}
            onChange={(e) => setNewProvider({ ...newProvider, apiKey: e.target.value })}
          />
          <Input
            placeholder="Base URL (optional, leave empty for default)"
            value={newProvider.baseUrl}
            onChange={(e) => setNewProvider({ ...newProvider, baseUrl: e.target.value })}
          />
          <div className="flex gap-2">
            <Button onClick={handleAdd} className="bg-accent text-white">
              Save Provider
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setIsAdding(false)
                setNewProvider({ name: '', apiKey: '', baseUrl: '' })
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      <ScrollArea className="max-h-96">
        <div className="space-y-2">
          {providers.map((provider: Provider) => (
            <div
              key={provider.id}
              className={`flex items-center justify-between p-4 rounded-lg border ${
                provider.isActive
                  ? 'border-accent bg-accent/5'
                  : 'border-border-subtle bg-white'
              }`}
            >
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <div className="font-medium text-text-primary">{provider.name}</div>
                  {provider.isActive && (
                    <span className="px-2 py-0.5 text-xs rounded-full bg-accent text-white">
                      Active
                    </span>
                  )}
                </div>
                <div className="text-sm text-text-secondary mt-1">
                  {provider.baseUrl || 'Default API endpoint'}
                </div>
                <div className="text-xs text-text-tertiary mt-1 font-mono">
                  {showSecrets ? provider.apiKey : '••••••••' + provider.apiKey.slice(-8)}
                </div>
              </div>
              <div className="flex gap-2">
                {!provider.isActive && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleActivate(provider.id)}
                    className="text-accent"
                  >
                    <Check className="h-4 w-4 mr-1" />
                    Activate
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleDelete(provider.id)}
                  className="text-red-600 hover:bg-red-50"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}

          {providers.length === 0 && !isAdding && (
            <div className="text-center py-12 text-text-tertiary">
              No providers configured. Add one to get started.
            </div>
          )}
        </div>
      </ScrollArea>

      <div className="flex items-center justify-between pt-4 border-t border-border-subtle">
        <div className="text-xs text-text-tertiary">
          API keys are stored locally and never shared
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setShowSecrets(!showSecrets)}
          className="text-text-tertiary"
        >
          {showSecrets ? <EyeOff className="h-4 w-4 mr-1" /> : <Eye className="h-4 w-4 mr-1" />}
          {showSecrets ? 'Hide' : 'Show'} Secrets
        </Button>
      </div>
    </div>
  )
}
