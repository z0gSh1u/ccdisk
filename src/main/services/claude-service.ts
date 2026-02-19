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
  unstable_v2_createSession,
  unstable_v2_resumeSession,
  type SDKSession,
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
import { randomUUID } from 'crypto';

/**
 * Structure for tracking active SDK sessions
 */
interface ActiveSession {
  session: SDKSession;
  isStreaming: boolean;
  sdkSessionId?: string;
  isProcessing: boolean;
  workspacePath: string;
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
  private getWorkspacePath: (() => string | null) | null;

  constructor(
    private configService: ConfigService,
    private onStreamEvent: (sessionId: string, event: StreamEvent) => void,
    getWorkspacePath?: () => string | null
  ) {
    this.getWorkspacePath = getWorkspacePath ?? null;
  }

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
      const existing = this.activeSessions.get(sessionId);
      if (existing?.isStreaming) {
        throw new Error('Session is already responding');
      }

      const startTime = Date.now();
      this.sessionStartTimes.set(sessionId, startTime);

      // Get configuration
      const settingsStart = Date.now();
      const settings = await this.configService.getSettings();
      console.log(`[Claude ${sessionId}] settings loaded in ${Date.now() - settingsStart}ms`);

      const env = (settings.env as Record<string, string>) || {};
      const hasAuthToken = Boolean(env.ANTHROPIC_AUTH_TOKEN);
      const hasBaseUrl = Boolean(env.ANTHROPIC_BASE_URL);
      const model = env.ANTHROPIC_MODEL || env.ANTHROPIC_DEFAULT_SONNET_MODEL || 'unknown';
      console.log(`[Claude ${sessionId}] env hasAuthToken=${hasAuthToken} hasBaseUrl=${hasBaseUrl} model=${model}`);

      // Get workspace path from settings or use current directory
      const workspacePath =
        this.getWorkspacePath?.() ||
        (settings.workspacePath as string) ||
        process.env.CCDISK_WORKSPACE_PATH ||
        process.cwd();
      console.log(`[Claude ${sessionId}] workspacePath=${workspacePath}`);

      const normalizeToolInput = (toolName: string, toolInput: Record<string, unknown>) => {
        const input = { ...toolInput } as Record<string, unknown>;
        if (typeof input.filePath === 'string' && typeof input.file_path !== 'string') {
          input.file_path = input.filePath;
          delete input.filePath;
        }
        const inputKeys = Object.keys(input).sort();
        const rawKeys = Object.keys(toolInput).sort();
        if (inputKeys.length || rawKeys.length) {
          console.log(
            `[Claude ${sessionId}] canUseTool ${toolName} input keys raw=${rawKeys.join(',')} normalized=${inputKeys.join(',')}`
          );
        }
        return input;
      };

      // Build canUseTool handler
      const canUseTool: CanUseTool = async (toolName, input, options) => {
        const rawKeys = Object.keys((input as Record<string, unknown>) || {})
          .sort()
          .join(',');
        console.log(
          `[Claude ${sessionId}] canUseTool called tool=${toolName} rawKeys=${rawKeys} toolUseId=${options.toolUseID ?? 'unknown'}`
        );
        const normalizedInput = normalizeToolInput(toolName, input as Record<string, unknown>);

        // acceptEdits mode: auto-approve non-destructive tools, prompt for destructive ones
        const destructiveTools = ['bash', 'edit', 'write'];
        const isDestructive = destructiveTools.some((dt) => toolName.toLowerCase().includes(dt));

        if (!isDestructive) {
          return { behavior: 'allow', updatedInput: normalizedInput };
        }

        // For destructive tools, generate permission request
        const permissionRequestId = randomUUID();

        // Create promise that will be resolved by respondToPermission
        const permissionPromise = new Promise<PermissionResult>((resolve, reject) => {
          this.pendingPermissions.set(permissionRequestId, {
            resolve,
            reject,
            toolInput: normalizedInput
          });
        });

        // Emit permission request event
        const permissionRequest: PermissionRequest = {
          permissionRequestId,
          toolName,
          toolInput: normalizedInput,
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

      const active = await this.ensureSession(sessionId, {
        sdkSessionId,
        workspacePath,
        canUseTool,
        env: mergedEnv
      });

      active.isStreaming = true;
      await active.session.send(message);

      if (!active.isProcessing) {
        active.isProcessing = true;
        this.processMessages(sessionId, active.session).catch((error) => {
          console.error('Error processing messages:', error);
          this.onStreamEvent(sessionId, {
            type: 'error',
            data: error instanceof Error ? error.message : 'Unknown error'
          });
        });
      }

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
  private async processMessages(_sessionId: string, session: SDKSession): Promise<void> {
    try {
      let actualSdkSessionId: string | undefined;
      let sessionIdEmitted = false;
      let sawPartialText = false;
      let pendingAssistantText = '';
      let sawFirstMessage = false;
      let sawFirstAssistantBlock = false;
      let sawFirstTextDelta = false;

      for await (const message of session.stream()) {
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

      const active = this.activeSessions.get(_sessionId);
      if (active) {
        active.isStreaming = false;
        active.sdkSessionId = actualSdkSessionId || active.sdkSessionId;
        active.isProcessing = false;
      }
      this.sessionStartTimes.delete(_sessionId);
    } catch (error) {
      console.error('Error in processMessages:', error);
      this.onStreamEvent(_sessionId, {
        type: 'error',
        data: error instanceof Error ? error.message : 'Unknown error'
      });

      const active = this.activeSessions.get(_sessionId);
      if (active) {
        active.isStreaming = false;
        active.isProcessing = false;
      }
      this.sessionStartTimes.delete(_sessionId);
    }
  }

  private async ensureSession(
    sessionId: string,
    options: {
      sdkSessionId?: string;
      workspacePath: string;
      canUseTool: CanUseTool;
      env: Record<string, string>;
    }
  ): Promise<ActiveSession> {
    const existing = this.activeSessions.get(sessionId);
    if (existing) {
      if (existing.workspacePath !== options.workspacePath) {
        console.log(
          `[Claude ${sessionId}] workspacePath changed (${existing.workspacePath} -> ${options.workspacePath}), recreating session`
        );
        existing.session.close();
        this.activeSessions.delete(sessionId);
      } else {
        return existing;
      }
    }

    const { sdkSessionId, workspacePath, canUseTool, env } = options;
    const sessionOptions = {
      cwd: workspacePath,
      canUseTool,
      env,
      model: env.ANTHROPIC_MODEL || env.ANTHROPIC_DEFAULT_SONNET_MODEL || 'claude-sonnet-4-5-20250929',
      permissionMode: 'acceptEdits' as const,
      includePartialMessages: true
    };

    const session = sdkSessionId
      ? unstable_v2_resumeSession(sdkSessionId, sessionOptions)
      : unstable_v2_createSession(sessionOptions);

    const active: ActiveSession = {
      session,
      isStreaming: false,
      isProcessing: false,
      sdkSessionId,
      workspacePath
    };
    this.activeSessions.set(sessionId, active);
    return active;
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
      // Close the query to clean up resources
      session.session.close();

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
  getActiveSession(sessionId: string): SDKSession | null {
    const session = this.activeSessions.get(sessionId);
    return session?.session || null;
  }

  /**
   * Get supported slash commands from SDK for an active session
   */
  async getSupportedCommands(_sessionId: string): Promise<SlashCommand[] | null> {
    return null;
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
      session.session.close();
    }
    this.activeSessions.clear();
    this.pendingPermissions.clear();
  }
}
