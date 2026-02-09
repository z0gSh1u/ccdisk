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
import { query, type Query, type CanUseTool, type PermissionResult } from '@anthropic-ai/claude-agent-sdk'
import type {
  StreamEvent,
  PermissionRequest,
  PermissionMode,
  ToolUseData,
  ToolResultData,
  ResultData,
  StatusData
} from '../../shared/types'
import type { ConfigService } from './config-service'
import type { MCPService } from './mcp-service'
import { randomUUID } from 'crypto'

/**
 * Structure for tracking active SDK sessions
 */
interface ActiveSession {
  query: Query
  abortController: AbortController
}

/**
 * Structure for tracking pending permission requests
 */
interface PendingPermission {
  resolve: (result: PermissionResult) => void
  reject: (error: Error) => void
}

export class ClaudeService {
  private activeSessions: Map<string, ActiveSession> = new Map()
  private pendingPermissions: Map<string, PendingPermission> = new Map()
  private permissionMode: PermissionMode = 'prompt'

  constructor(
    private configService: ConfigService,
    private mcpService: MCPService,
    private onStreamEvent: (sessionId: string, event: StreamEvent) => void
  ) {}

  /**
   * Set permission mode for new sessions
   */
  setPermissionMode(mode: PermissionMode): void {
    this.permissionMode = mode
  }

  /**
   * Send message and start streaming responses
   * @param sessionId - UI session ID
   * @param message - User message text
   * @param _files - Optional file attachments (not yet implemented)
   * @param sdkSessionId - Optional SDK session ID for resuming
   * @returns Object with SDK session ID
   */
  async sendMessage(
    sessionId: string,
    message: string,
    _files?: Array<{ path: string; content: string }>,
    sdkSessionId?: string
  ): Promise<{ sdkSessionId: string }> {
    try {
      // Abort any existing session for this sessionId
      this.abortSession(sessionId)

      // Get configuration
      const settings = await this.configService.getSettings()
      const mcpConfig = await this.mcpService.getConfig()

      // Get workspace path from settings or use current directory
      const workspacePath = (settings.workspacePath as string) || process.cwd()

      // Create abort controller for this session
      const abortController = new AbortController()

      // Build canUseTool handler
      const canUseTool: CanUseTool = async (toolName, input, options) => {
        // Handle permission modes
        if (this.permissionMode === 'bypassPermissions') {
          return { behavior: 'allow' }
        }

        if (this.permissionMode === 'acceptEdits') {
          // Auto-approve most tools, prompt for destructive ones
          const destructiveTools = ['bash', 'edit', 'write']
          const isDestructive = destructiveTools.some((dt) => toolName.toLowerCase().includes(dt))

          if (!isDestructive) {
            return { behavior: 'allow' }
          }
        }

        // For 'prompt' mode or destructive tools in 'acceptEdits' mode
        // Generate permission request
        const permissionRequestId = randomUUID()

        // Create promise that will be resolved by respondToPermission
        const permissionPromise = new Promise<PermissionResult>((resolve, reject) => {
          this.pendingPermissions.set(permissionRequestId, { resolve, reject })
        })

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
        }

        this.onStreamEvent(sessionId, {
          type: 'permission_request',
          data: permissionRequest
        })

        // Wait for user response
        try {
          const result = await permissionPromise
          return result
        } catch (error) {
          console.error('Permission request error:', error)
          return {
            behavior: 'deny',
            message: error instanceof Error ? error.message : 'Permission denied'
          }
        }
      }

      // Create query
      const queryInstance = query({
        prompt: message,
        options: {
          cwd: workspacePath,
          mcpServers: mcpConfig.mcpServers as Record<string, any>,
          canUseTool,
          abortController,
          resume: sdkSessionId,
          env: settings.env as Record<string, string> | undefined,
          permissionMode: this.permissionMode === 'prompt' ? 'default' : this.permissionMode
        }
      })

      // Store active session
      this.activeSessions.set(sessionId, {
        query: queryInstance,
        abortController
      })

      // Start processing messages in background
      this.processMessages(sessionId, queryInstance).catch((error) => {
        console.error('Error processing messages:', error)
        this.onStreamEvent(sessionId, {
          type: 'error',
          data: error instanceof Error ? error.message : 'Unknown error'
        })
      })

      // Return immediately with session ID
      return { sdkSessionId: sdkSessionId || randomUUID() }
    } catch (error) {
      console.error('Failed to send message:', error)
      this.onStreamEvent(sessionId, {
        type: 'error',
        data: error instanceof Error ? error.message : 'Failed to send message'
      })
      throw error
    }
  }

  /**
   * Process SDK messages and emit stream events
   */
  private async processMessages(_sessionId: string, queryInstance: Query): Promise<void> {
    try {
      let actualSdkSessionId: string | undefined

      for await (const message of queryInstance) {
        // Extract session ID from message
        if ('session_id' in message && message.session_id) {
          actualSdkSessionId = message.session_id
        }

        // Map SDK message to StreamEvent
        switch (message.type) {
          case 'assistant': {
            // SDKAssistantMessage - contains assistant response with text and tool uses
            const assistantMsg = message as any
            const betaMessage = assistantMsg.message

            // Process content blocks
            for (const block of betaMessage.content) {
              if (block.type === 'text') {
                // Emit text event
                this.onStreamEvent(_sessionId, {
                  type: 'text',
                  data: block.text
                })
              } else if (block.type === 'tool_use') {
                // Emit tool_use event
                const toolUseData: ToolUseData = {
                  id: block.id,
                  name: block.name,
                  input: block.input as Record<string, unknown>
                }
                this.onStreamEvent(_sessionId, {
                  type: 'tool_use',
                  data: toolUseData
                })
              }
            }
            break
          }

          case 'user': {
            // SDKUserMessage - tool results
            const userMsg = message as any
            if (userMsg.message?.content) {
              for (const block of userMsg.message.content) {
                if (block.type === 'tool_result') {
                  const toolResultData: ToolResultData = {
                    tool_use_id: block.tool_use_id,
                    content:
                      typeof block.content === 'string'
                        ? block.content
                        : JSON.stringify(block.content),
                    is_error: block.is_error || false
                  }
                  this.onStreamEvent(_sessionId, {
                    type: 'tool_result',
                    data: toolResultData
                  })
                }
              }
            }
            break
          }

          case 'result': {
            // SDKResultMessage - final result with usage
            const resultMsg = message as any
            const resultData: ResultData = {
              subtype: resultMsg.subtype,
              is_error: resultMsg.is_error,
              num_turns: resultMsg.num_turns,
              duration_ms: resultMsg.duration_ms,
              usage: resultMsg.usage,
              session_id: actualSdkSessionId
            }
            this.onStreamEvent(_sessionId, {
              type: 'result',
              data: resultData
            })
            break
          }

          case 'system': {
            // System messages - could be status updates
            const systemMsg = message as any
            if (systemMsg.subtype === 'status') {
              // SDKStatusMessage
              const statusData: StatusData = {
                session_id: actualSdkSessionId
              }
              this.onStreamEvent(_sessionId, {
                type: 'status',
                data: statusData
              })
            }
            // Log other system messages
            console.log('System message:', message)
            break
          }

          case 'tool_progress': {
            // SDKToolProgressMessage - tool execution progress
            // SDK doesn't emit stdout/stderr here, but we log the progress
            console.log('Tool progress:', message)
            break
          }

          case 'stream_event': {
            // SDKPartialAssistantMessage - streaming deltas
            const streamMsg = message as any
            const event = streamMsg.event

            if (event.type === 'content_block_delta') {
              if (event.delta.type === 'text_delta') {
                this.onStreamEvent(_sessionId, {
                  type: 'text',
                  data: event.delta.text
                })
              }
            }
            break
          }

          case 'auth_status':
          case 'tool_use_summary':
            // Log but don't emit
            console.log('SDK message:', message.type, message)
            break

          default:
            // Log unhandled message types
            console.log('Unhandled SDK message type:', (message as any).type)
        }
      }

      // Emit done event when iteration completes
      this.onStreamEvent(_sessionId, {
        type: 'done',
        data: actualSdkSessionId || 'completed'
      })

      // Clean up session
      this.activeSessions.delete(_sessionId)
    } catch (error) {
      console.error('Error in processMessages:', error)
      this.onStreamEvent(_sessionId, {
        type: 'error',
        data: error instanceof Error ? error.message : 'Unknown error'
      })

      // Clean up session
      this.activeSessions.delete(_sessionId)
    }
  }

  /**
   * Respond to a permission request
   * @param permissionRequestId - Unique ID from permission request
   * @param approved - Whether permission was granted
   * @param _input - Optional modified input (not yet implemented)
   */
  respondToPermission(
    permissionRequestId: string,
    approved: boolean,
    _input?: Record<string, unknown>
  ): void {
    const pending = this.pendingPermissions.get(permissionRequestId)
    if (!pending) {
      console.error('Permission request not found:', permissionRequestId)
      return
    }

    // Resolve the promise
    if (approved) {
      pending.resolve({
        behavior: 'allow'
        // TODO: Support updatedInput if needed
      })
    } else {
      pending.resolve({
        behavior: 'deny',
        message: 'User denied permission'
      })
    }

    // Remove from pending
    this.pendingPermissions.delete(permissionRequestId)
  }

  /**
   * Abort an active session
   * @param sessionId - Session to abort
   */
  abortSession(sessionId: string): void {
    const session = this.activeSessions.get(sessionId)
    if (session) {
      // Abort the query
      session.abortController.abort()

      // Close the query to clean up resources
      session.query.close()

      // Remove from active sessions
      this.activeSessions.delete(sessionId)

      // Clean up any pending permissions for this session
      // (We don't have a direct mapping, so we'll let them timeout or be cleaned up)
      console.log('Aborted session:', sessionId)
    }
  }

  /**
   * Clean up all active sessions
   */
  cleanup(): void {
    for (const [_sessionId, session] of this.activeSessions.entries()) {
      session.abortController.abort()
      session.query.close()
    }
    this.activeSessions.clear()
    this.pendingPermissions.clear()
  }
}
