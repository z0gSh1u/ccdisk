/**
 * Simple smoke tests for ClaudeService
 * 
 * Run with: npx tsx --test src/main/__tests__/claude-service.smoke.test.ts
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { ClaudeService } from '../services/claude-service'
import type { ConfigService } from '../services/config-service'
import type { MCPService } from '../services/mcp-service'
import type { StreamEvent } from '../../shared/types'

describe('ClaudeService - Smoke Tests', () => {
  it('should create instance', () => {
    const mockConfigService = {} as ConfigService
    const mockMCPService = {} as MCPService
    const onStreamEvent = (_sessionId: string, _event: StreamEvent): void => {}

    const service = new ClaudeService(mockConfigService, mockMCPService, onStreamEvent)
    assert.ok(service)
  })

  it('should have correct sendMessage signature', () => {
    const mockConfigService = {} as ConfigService
    const mockMCPService = {} as MCPService
    const onStreamEvent = (_sessionId: string, _event: StreamEvent): void => {}

    const service = new ClaudeService(mockConfigService, mockMCPService, onStreamEvent)
    
    // Type check - will fail compilation if wrong
    const _check: (
      sessionId: string,
      message: string,
      files?: Array<{ path: string; content: string }>,
      sdkSessionId?: string
    ) => Promise<void> = service.sendMessage.bind(service)
    
    assert.ok(_check)
  })

  it('should set permission mode', () => {
    const mockConfigService = {} as ConfigService
    const mockMCPService = {} as MCPService
    const onStreamEvent = (_sessionId: string, _event: StreamEvent): void => {}

    const service = new ClaudeService(mockConfigService, mockMCPService, onStreamEvent)
    
    service.setPermissionMode('prompt')
    service.setPermissionMode('acceptEdits')
    service.setPermissionMode('bypassPermissions')
    
    assert.ok(true)
  })

  it('should handle respondToPermission', () => {
    const mockConfigService = {} as ConfigService
    const mockMCPService = {} as MCPService
    const onStreamEvent = (_sessionId: string, _event: StreamEvent): void => {}

    const service = new ClaudeService(mockConfigService, mockMCPService, onStreamEvent)
    
    // Should not throw even with unknown ID
    service.respondToPermission('unknown-id', true)
    service.respondToPermission('unknown-id', false)
    
    assert.ok(true)
  })

  it('should handle abortSession', () => {
    const mockConfigService = {} as ConfigService
    const mockMCPService = {} as MCPService
    const onStreamEvent = (_sessionId: string, _event: StreamEvent): void => {}

    const service = new ClaudeService(mockConfigService, mockMCPService, onStreamEvent)
    
    // Should not throw even with unknown session
    service.abortSession('unknown-session')
    
    assert.ok(true)
  })

  it('should cleanup', () => {
    const mockConfigService = {} as ConfigService
    const mockMCPService = {} as MCPService
    const onStreamEvent = (_sessionId: string, _event: StreamEvent): void => {}

    const service = new ClaudeService(mockConfigService, mockMCPService, onStreamEvent)
    
    service.cleanup()
    service.cleanup() // Should be safe to call multiple times
    
    assert.ok(true)
  })
})
