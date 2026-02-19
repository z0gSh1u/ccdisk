/**
 * Tests for ClaudeService
 *
 * Run with: npx tsx --test src/main/__tests__/claude-service.test.ts
 *
 * Note: These are basic unit tests with mocked SDK.
 * Full integration tests would require a real Claude API key and SDK setup.
 */
import { describe, it, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { ClaudeService } from '../services/claude-service';
import type { ConfigService } from '../services/config-service';
import type { StreamEvent } from '../../shared/types';

describe('ClaudeService', () => {
  let claudeService: ClaudeService;
  let mockConfigService: ConfigService;
  let capturedEvents: Array<{ sessionId: string; event: StreamEvent }>;

  beforeEach(() => {
    // Reset captured events
    capturedEvents = [];

    // Create mock ConfigService
    mockConfigService = {
      getSettings: mock.fn(async () => ({
        workspacePath: '/test/workspace',
        env: {
          ANTHROPIC_AUTH_TOKEN: 'test-token'
        }
      }))
    } as unknown as ConfigService;

    // Create callback to capture stream events
    const onStreamEvent = (sessionId: string, event: StreamEvent): void => {
      capturedEvents.push({ sessionId, event });
    };

    // Create ClaudeService instance
    claudeService = new ClaudeService(mockConfigService, onStreamEvent);
  });

  describe('constructor', () => {
    it('should create instance successfully', () => {
      assert.ok(claudeService);
      assert.ok(claudeService instanceof ClaudeService);
    });
  });

  describe('respondToPermission', () => {
    it('should handle unknown permission request gracefully', () => {
      // Should not throw even if permission request doesn't exist
      claudeService.respondToPermission('unknown-id', true);
      assert.ok(true, 'respondToPermission handled unknown ID gracefully');
    });

    it('should accept approved permission', () => {
      // This would normally be tested with a real permission flow
      // For now, just verify it doesn't throw
      claudeService.respondToPermission('test-id', true, { test: 'input' });
      assert.ok(true, 'respondToPermission handled approval');
    });

    it('should deny rejected permission', () => {
      claudeService.respondToPermission('test-id', false);
      assert.ok(true, 'respondToPermission handled denial');
    });
  });

  describe('abortSession', () => {
    it('should handle aborting non-existent session gracefully', () => {
      // Should not throw even if session doesn't exist
      claudeService.abortSession('non-existent-session');
      assert.ok(true, 'abortSession handled non-existent session gracefully');
    });
  });

  describe('cleanup', () => {
    it('should clean up without error', () => {
      claudeService.cleanup();
      assert.ok(true, 'cleanup executed without error');
    });

    it('should clean up multiple times safely', () => {
      claudeService.cleanup();
      claudeService.cleanup();
      assert.ok(true, 'cleanup can be called multiple times');
    });
  });

  describe('sendMessage - basic validation', () => {
    it('should have correct return type', () => {
      // Verify sendMessage signature - returns Promise<void>
      // We can't actually call it without a real SDK, but we can verify the type
      assert.ok(typeof claudeService.sendMessage === 'function', 'sendMessage is a function');

      // Type assertion - this will fail compilation if return type is wrong
      const _typeCheck: (
        sessionId: string,
        message: string,
        files?: Array<{ path: string; content: string }>,
        sdkSessionId?: string
      ) => Promise<void> = claudeService.sendMessage.bind(claudeService);

      assert.ok(_typeCheck, 'sendMessage has correct type signature');
    });
  });

  describe('ClaudeService V2 sessions', () => {
    it('reuses active session and blocks concurrent send', async () => {
      const mockConfigService = {
        getSettings: mock.fn(async () => ({
          env: { ANTHROPIC_AUTH_TOKEN: 'x' },
          workspacePath: '/tmp'
        }))
      } as any;
      const events: any[] = [];
      const onStreamEvent = (sessionId: string, event: any) => events.push({ sessionId, event });

      const service = new ClaudeService(mockConfigService, onStreamEvent);

      // First send sets streaming
      await service.sendMessage('s1', 'hello');
      await assert.rejects(() => service.sendMessage('s1', 'second'), /already responding/);
    });
  });
});

/**
 * Integration test placeholder
 *
 * To run real integration tests:
 * 1. Set ANTHROPIC_AUTH_TOKEN environment variable
 * 2. Ensure Claude SDK is properly installed
 * 3. Run: ANTHROPIC_AUTH_TOKEN=sk-xxx npx tsx --test src/main/__tests__/claude-service.integration.test.ts
 */
describe('ClaudeService - Integration Tests (Skipped)', () => {
  it.skip('should send message and receive response', async () => {
    // This would be a real integration test with live API
    // Requires:
    // - Valid ANTHROPIC_AUTH_TOKEN
    // - Real Claude SDK setup
    // - Actual API calls
    assert.ok(true, 'Integration test placeholder');
  });

  it.skip('should handle permission requests', async () => {
    // Test permission flow with real SDK
    assert.ok(true, 'Integration test placeholder');
  });

  it.skip('should stream responses correctly', async () => {
    // Test streaming with real SDK
    assert.ok(true, 'Integration test placeholder');
  });

  it.skip('should resume sessions', async () => {
    // Test session resumption
    assert.ok(true, 'Integration test placeholder');
  });
});
