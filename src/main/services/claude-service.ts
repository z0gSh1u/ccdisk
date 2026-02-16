/**
 * Claude service for integrating Claude Agent SDK
 *
 * This service provides the core AI integration for the application, handling:
 * - Message sending and streaming responses via Claude Agent SDK
 * - Permission management with user prompts for tool usage
 * - Session tracking and lifecycle management
 * - MCP server integration for extended tool capabilities
 *
 * Architecture:
 * - Uses Claude Agent SDK v0.2.37+ which provides an AsyncGenerator-based API
 * - Streams SDK messages (SDKMessage types) and maps them to StreamEvent types
 * - Implements canUseTool callback for permission flow with Promise-based blocking
 * - Tracks active Query objects (SDK sessions) by sessionId
 * - Supports resuming conversations via SDK session IDs
 *
 * Permission Flow:
 * 1. SDK calls canUseTool(toolName, input, options)
 * 2. Generate unique permissionRequestId and create Promise
 * 3. Emit 'permission_request' event to UI
 * 4. Block SDK by returning Promise
 * 5. UI calls respondToPermission(permissionRequestId, approved)
 * 6. Resolve Promise with PermissionResult
 * 7. SDK continues execution
 *
 * @see https://github.com/anthropics/anthropic-sdk-typescript
 */
import {
  query,
  type Query,
  type CanUseTool,
  type PermissionResult,
  type SlashCommand
} from '@anthropic-ai/claude-agent-sdk';
import type {
  StreamEvent,
  PermissionRequest,
  ToolUseData,
  ToolResultData,
  ResultData,
  StatusData
} from '../../shared/types';
import type { ConfigService } from './config-service';
import type { MCPService } from './mcp-service';
import { randomUUID } from 'crypto';

/**
 * Structure for tracking active SDK sessions
 */
interface ActiveSession {
  query: Query;
  abortController: AbortController;
}

/**
 * Structure for tracking pending permission requests
 */
interface PendingPermission {
  resolve: (result: PermissionResult) => void;
  reject: (error: Error) => void;
  toolInput: Record<string, unknown>;
}

export class ClaudeService {
  private activeSessions: Map<string, ActiveSession> = new Map();
  private pendingPermissions: Map<string, PendingPermission> = new Map();
  private sessionStartTimes: Map<string, number> = new Map();

  constructor(
    private configService: ConfigService,
    private mcpService: MCPService,
    private onStreamEvent: (sessionId: string, event: StreamEvent) => void
  ) {}

  /**
   * Send message and start streaming responses
   * @param sessionId - UI session ID
   * @param message - User message text
   * @param _files - Optional file attachments (not yet implemented)
   * @param sdkSessionId - Optional SDK session ID for resuming
   *
   * Note: Returns immediately without SDK session ID. The actual SDK session ID
   * will be emitted via a 'status' stream event once the first message arrives.
   * This is necessary because the SDK provides session IDs asynchronously.
   */
  async sendMessage(
    sessionId: string,
    message: string,
    _files?: Array<{ path: string; content: string }>,
    sdkSessionId?: string
  ): Promise<void> {
    try {
      const startTime = Date.now();
      this.sessionStartTimes.set(sessionId, startTime);

      // Abort any existing session for this sessionId
      this.abortSession(sessionId);

      // Get configuration
      const settingsStart = Date.now();
      const settings = await this.configService.getSettings();
      console.log(`[Claude ${sessionId}] settings loaded in ${Date.now() - settingsStart}ms`);

      const mcpStart = Date.now();
      const mcpConfig = await this.mcpService.getConfig();
      console.log(`[Claude ${sessionId}] mcp config loaded in ${Date.now() - mcpStart}ms`);

      const env = (settings.env as Record<string, string>) || {};
      const hasAuthToken = Boolean(env.ANTHROPIC_AUTH_TOKEN);
      const hasBaseUrl = Boolean(env.ANTHROPIC_BASE_URL);
      const model = env.ANTHROPIC_MODEL || env.ANTHROPIC_DEFAULT_SONNET_MODEL || 'unknown';
      const mcpServers = Object.entries(mcpConfig.mcpServers || {}).map(([name, config]) => ({
        name,
        type: (config as { type?: string }).type || 'unknown'
      }));
      console.log(`[Claude ${sessionId}] env hasAuthToken=${hasAuthToken} hasBaseUrl=${hasBaseUrl} model=${model}`);
      console.log(`[Claude ${sessionId}] mcp servers (${mcpServers.length}):`, mcpServers);

      // Get workspace path from settings or use current directory
      const workspacePath = (settings.workspacePath as string) || process.cwd();

      // Create abort controller for this session
      const abortController = new AbortController();

      // Build canUseTool handler
      const canUseTool: CanUseTool = async (toolName, input, options) => {
        // acceptEdits mode: auto-approve non-destructive tools, prompt for destructive ones
        const destructiveTools = ['bash', 'edit', 'write'];
        const isDestructive = destructiveTools.some((dt) => toolName.toLowerCase().includes(dt));

        if (!isDestructive) {
          return { behavior: 'allow' };
        }

        // For destructive tools, generate permission request
        const permissionRequestId = randomUUID();

        // Create promise that will be resolved by respondToPermission
        const permissionPromise = new Promise<PermissionResult>((resolve, reject) => {
          this.pendingPermissions.set(permissionRequestId, {
            resolve,
            reject,
            toolInput: input as Record<string, unknown>
          });
        });

        // Emit permission request event
        const permissionRequest: PermissionRequest = {
          permissionRequestId,
          toolName,
          toolInput: input,
          suggestions: options.suggestions ? [] : undefined, // SDK's PermissionUpdate[] doesn't match our simple suggestion structure
          decisionReason: options.decisionReason,
          blockedPath: options.blockedPath,
          toolUseId: options.toolUseID,
          description: `${toolName} wants to execute`
        };

        this.onStreamEvent(sessionId, {
          type: 'permission_request',
          data: permissionRequest
        });

        // Wait for user response
        try {
          const result = await permissionPromise;
          return result;
        } catch (error) {
          console.error('Permission request error:', error);
          return {
            behavior: 'deny',
            message: error instanceof Error ? error.message : 'Permission denied'
          };
        }
      };

      // Merge process env with settings env for child process spawning
      const mergedEnv: Record<string, string> = {};
      for (const [key, value] of Object.entries(process.env)) {
        if (typeof value === 'string') {
          mergedEnv[key] = value;
        }
      }
      if (settings.env && typeof settings.env === 'object') {
        Object.assign(mergedEnv, settings.env as Record<string, string>);
      }

      // Create query
      const queryStart = Date.now();
      const queryInstance = query({
        prompt: message,
        options: {
          cwd: workspacePath,
          mcpServers: mcpConfig.mcpServers as Record<string, any>,
          canUseTool,
          abortController,
          resume: sdkSessionId,
          env: mergedEnv,
          permissionMode: 'acceptEdits',
          includePartialMessages: true
        }
      });
      console.log(`[Claude ${sessionId}] query created in ${Date.now() - queryStart}ms`);

      // Store active session
      this.activeSessions.set(sessionId, {
        query: queryInstance,
        abortController
      });

      void this.logMcpStatus(sessionId, queryInstance);

      // Start processing messages in background
      this.processMessages(sessionId, queryInstance).catch((error) => {
        console.error('Error processing messages:', error);
        this.onStreamEvent(sessionId, {
          type: 'error',
          data: error instanceof Error ? error.message : 'Unknown error'
        });
      });

      // Return immediately - SDK session ID will be emitted via status event
    } catch (error) {
      console.error('Failed to send message:', error);
      this.onStreamEvent(sessionId, {
        type: 'error',
        data: error instanceof Error ? error.message : 'Failed to send message'
      });
      throw error;
    }
  }

  /**
   * Process SDK messages and emit stream events
   */
  private async processMessages(_sessionId: string, queryInstance: Query): Promise<void> {
    try {
      let actualSdkSessionId: string | undefined;
      let sessionIdEmitted = false;
      let sawPartialText = false;
      let pendingAssistantText = '';
      let sawFirstMessage = false;
      let sawFirstAssistantBlock = false;
      let sawFirstTextDelta = false;

      for await (const message of queryInstance) {
        if (!sawFirstMessage) {
          sawFirstMessage = true;
          const startTime = this.sessionStartTimes.get(_sessionId);
          if (startTime) {
            console.log(`[Claude ${_sessionId}] first SDK message after ${Date.now() - startTime}ms`);
          }
        }

        // Extract session ID from message
        if ('session_id' in message && message.session_id) {
          actualSdkSessionId = message.session_id;

          // Emit session ID as soon as we get it (once)
          if (!sessionIdEmitted) {
            sessionIdEmitted = true;
            this.onStreamEvent(_sessionId, {
              type: 'status',
              data: {
                session_id: actualSdkSessionId
              }
            });
          }
        }

        // Map SDK message to StreamEvent
        switch (message.type) {
          case 'assistant': {
            // SDKAssistantMessage - contains assistant response with text and tool uses
            const assistantMsg = message as any;
            const betaMessage = assistantMsg.message;

            // Process content blocks
            for (const block of betaMessage.content) {
              if (!sawFirstAssistantBlock) {
                sawFirstAssistantBlock = true;
                const startTime = this.sessionStartTimes.get(_sessionId);
                const elapsed = startTime ? `${Date.now() - startTime}ms` : 'unknown';
                console.log(`[Claude ${_sessionId}] first assistant block at ${elapsed}`);
              }
              if (block.type === 'text') {
                pendingAssistantText += block.text;
              } else if (block.type === 'tool_use') {
                if (pendingAssistantText) {
                  this.onStreamEvent(_sessionId, {
                    type: 'text',
                    data: pendingAssistantText
                  });
                  pendingAssistantText = '';
                }
                // Emit tool_use event
                const toolUseData: ToolUseData = {
                  id: block.id,
                  name: block.name,
                  input: block.input as Record<string, unknown>
                };
                this.onStreamEvent(_sessionId, {
                  type: 'tool_use',
                  data: toolUseData
                });
              }
            }
            break;
          }

          case 'user': {
            // SDKUserMessage - tool results
            const userMsg = message as any;
            if (userMsg.message?.content) {
              for (const block of userMsg.message.content) {
                if (block.type === 'tool_result') {
                  if (pendingAssistantText) {
                    this.onStreamEvent(_sessionId, {
                      type: 'text',
                      data: pendingAssistantText
                    });
                    pendingAssistantText = '';
                  }
                  const toolResultData: ToolResultData = {
                    tool_use_id: block.tool_use_id,
                    content: typeof block.content === 'string' ? block.content : JSON.stringify(block.content),
                    is_error: block.is_error || false
                  };
                  this.onStreamEvent(_sessionId, {
                    type: 'tool_result',
                    data: toolResultData
                  });
                }
              }
            }
            break;
          }

          case 'result': {
            // SDKResultMessage - final result with usage
            const resultMsg = message as any;
            const resultData: ResultData = {
              subtype: resultMsg.subtype,
              is_error: resultMsg.is_error,
              num_turns: resultMsg.num_turns,
              duration_ms: resultMsg.duration_ms,
              usage: resultMsg.usage,
              session_id: actualSdkSessionId
            };
            this.onStreamEvent(_sessionId, {
              type: 'result',
              data: resultData
            });
            break;
          }

          case 'system': {
            // System messages - could be status updates
            const systemMsg = message as any;
            if (systemMsg.subtype === 'status') {
              // SDKStatusMessage
              const statusData: StatusData = {
                session_id: actualSdkSessionId
              };
              this.onStreamEvent(_sessionId, {
                type: 'status',
                data: statusData
              });
            }
            // Log other system messages
            const startTime = this.sessionStartTimes.get(_sessionId);
            const elapsed = startTime ? `${Date.now() - startTime}ms` : 'unknown';
            console.log(`[Claude ${_sessionId}] system ${systemMsg.subtype || 'message'} at ${elapsed}:`, message);
            break;
          }

          case 'tool_progress': {
            // SDKToolProgressMessage - tool execution progress
            // SDK doesn't emit stdout/stderr here, but we log the progress
            console.log('Tool progress:', message);
            break;
          }

          case 'stream_event': {
            // SDKPartialAssistantMessage - streaming deltas
            const streamMsg = message as any;
            const event = streamMsg.event;
            if (event.type === 'content_block_delta') {
              if (event.delta.type === 'text_delta') {
                if (!sawFirstTextDelta) {
                  sawFirstTextDelta = true;
                  const startTime = this.sessionStartTimes.get(_sessionId);
                  const elapsed = startTime ? `${Date.now() - startTime}ms` : 'unknown';
                  console.log(`[Claude ${_sessionId}] first text delta at ${elapsed}`);
                }
                sawPartialText = true;
                this.onStreamEvent(_sessionId, {
                  type: 'text',
                  data: event.delta.text
                });
              }
            }
            break;
          }

          case 'auth_status':
          case 'tool_use_summary': {
            const startTime = this.sessionStartTimes.get(_sessionId);
            const elapsed = startTime ? `${Date.now() - startTime}ms` : 'unknown';
            console.log(`[Claude ${_sessionId}] SDK ${message.type} at ${elapsed}:`, message);
            break;
          }

          default:
            // Log unhandled message types
            console.log('Unhandled SDK message type:', (message as any).type);
        }
      }

      // Emit done event when iteration completes
      if (!sawPartialText && pendingAssistantText) {
        this.onStreamEvent(_sessionId, {
          type: 'text',
          data: pendingAssistantText
        });
      }
      this.onStreamEvent(_sessionId, {
        type: 'done',
        data: actualSdkSessionId || 'completed'
      });

      // Clean up session
      this.activeSessions.delete(_sessionId);
      this.sessionStartTimes.delete(_sessionId);
    } catch (error) {
      console.error('Error in processMessages:', error);
      this.onStreamEvent(_sessionId, {
        type: 'error',
        data: error instanceof Error ? error.message : 'Unknown error'
      });

      // Clean up session
      this.activeSessions.delete(_sessionId);
      this.sessionStartTimes.delete(_sessionId);
    }
  }

  private async logMcpStatus(sessionId: string, queryInstance: Query): Promise<void> {
    const startTime = this.sessionStartTimes.get(sessionId);
    const elapsed = (label: string) => (startTime ? `${Date.now() - startTime}ms` : label);

    try {
      console.log(`[Claude ${sessionId}] mcpServerStatus start at ${elapsed('unknown')}`);
      const status = await queryInstance.mcpServerStatus();
      console.log(`[Claude ${sessionId}] mcpServerStatus done at ${elapsed('unknown')}:`, status);
    } catch (error) {
      console.error(`[Claude ${sessionId}] mcpServerStatus failed at ${elapsed('unknown')}:`, error);
    }
  }

  /**
   * Respond to a permission request
   * @param permissionRequestId - Unique ID from permission request
   * @param approved - Whether permission was granted
   * @param _input - Optional modified input (not yet implemented)
   */
  respondToPermission(permissionRequestId: string, approved: boolean, _input?: Record<string, unknown>): void {
    const pending = this.pendingPermissions.get(permissionRequestId);
    if (!pending) {
      console.error('Permission request not found:', permissionRequestId);
      return;
    }

    // Resolve the promise
    if (approved) {
      pending.resolve({
        behavior: 'allow',
        updatedInput: _input ?? pending.toolInput
      });
    } else {
      pending.resolve({
        behavior: 'deny',
        message: 'User denied permission'
      });
    }

    // Remove from pending
    this.pendingPermissions.delete(permissionRequestId);
  }

  /**
   * Abort an active session
   * @param sessionId - Session to abort
   */
  abortSession(sessionId: string): void {
    const session = this.activeSessions.get(sessionId);
    if (session) {
      // Abort the query
      session.abortController.abort();

      // Close the query to clean up resources
      session.query.close();

      // Remove from active sessions
      this.activeSessions.delete(sessionId);

      // Clean up any pending permissions for this session
      // (We don't have a direct mapping, so we'll let them timeout or be cleaned up)
      console.log('Aborted session:', sessionId);
    }
  }

  /**
   * Get active Query instance for a session (for MCP operations, commands, etc.)
   * Returns null if no active session
   */
  getActiveQuery(sessionId: string): Query | null {
    const session = this.activeSessions.get(sessionId);
    return session?.query || null;
  }

  /**
   * Get supported slash commands from SDK for an active session
   */
  async getSupportedCommands(sessionId: string): Promise<SlashCommand[] | null> {
    const q = this.getActiveQuery(sessionId);
    if (!q) return null;
    try {
      return await q.supportedCommands();
    } catch (error) {
      console.error('Failed to get supported commands:', error);
      return null;
    }
  }

  /**
   * Check if a session is active
   */
  hasActiveSession(sessionId: string): boolean {
    return this.activeSessions.has(sessionId);
  }

  /**
   * Clean up all active sessions
   */
  cleanup(): void {
    for (const [_sessionId, session] of this.activeSessions.entries()) {
      session.abortController.abort();
      session.query.close();
    }
    this.activeSessions.clear();
    this.pendingPermissions.clear();
  }
}
