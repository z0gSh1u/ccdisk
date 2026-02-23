/**
 * Chat IPC Handlers
 * Wires Claude Agent SDK streaming integration to IPC channels
 *
 * This is the most critical IPC handler as it:
 * - Streams AI responses from Claude SDK to the renderer
 * - Handles permission requests/responses for tool usage
 * - Manages session lifecycle (send, abort)
 * - Emits stream events via webContents for real-time UI updates
 */

import { ipcMain, type BrowserWindow } from 'electron';
import { randomUUID } from 'crypto';
import { IPC_CHANNELS } from '../../shared/ipc-channels';
import type { IPCResponse, StreamEvent, Skill } from '../../shared/types';
import { ClaudeService } from '../services/claude-service';
import { DatabaseService } from '../services/db-service';
import { SkillsService } from '../services/skills-service';
import { CommandsService } from '../services/commands-service';
import { FileWatcherService } from '../services/file-watcher';
import { ConfigService } from '../services/config-service';
import { DiskService } from '../services/disk-service';

/** Truncate a message to use as a chat title */
function truncateTitle(message: string, maxLength = 20): string {
  // Strip mention markers for cleaner titles
  const clean = message.replace(/\[\/(command|skill):[^\]]+\]|\[@file:[^\]]+\]/g, '').trim();
  if (clean.length <= maxLength) return clean;
  return clean.slice(0, maxLength) + '...';
}

/**
 * Resolve mention markers in a message string.
 * [/command:name] -> resolves command content
 * [/skill:name] -> resolves skill content
 * [@file:path] -> transforms to file reference
 */
async function resolveMentions(
  message: string,
  skillsService: SkillsService,
  commandsService: CommandsService,
  fileWatcher: FileWatcherService,
  diskService: DiskService
): Promise<string> {
  const mentionRegex = /\[\/(command|skill):([^\]]+)\]|\[@file:([^\]]+)\]/g;
  let resolved = message;
  const matches = [...message.matchAll(mentionRegex)];

  // Load skills based on current disk
  const hasSkillMentions = matches.some((m) => m[1] === 'skill');

  let skills: Skill[] = [];
  if (hasSkillMentions) {
    const currentDiskId = await diskService.getCurrentDiskId();
    const currentDisk = await diskService.getDisk(currentDiskId);

    if (currentDisk.isDefault) {
      // Default disk: use existing SkillsService (reads ~/.claude/skills/)
      skills = await skillsService.listSkills();
    } else {
      // Other disks: read from pool, filtered by disk references
      skills = await diskService.getActiveSkillsForDisk(currentDiskId);
    }
  }

  // Process in reverse order to preserve indices
  for (let i = matches.length - 1; i >= 0; i--) {
    const match = matches[i];
    const start = match.index!;
    const end = start + match[0].length;
    let replacement = match[0]; // fallback to original

    try {
      if (match[1] === 'command' && match[2]) {
        let result: { command: { name: string; path: string; scope: string }; content: string };
        try {
          result = await commandsService.getCommand(match[2], 'global');
        } catch {
          result = await commandsService.getCommand(match[2], 'workspace');
        }
        replacement = `[Command: ${match[2]}]\n\`\`\`\n${result.content}\n\`\`\``;
      } else if (match[1] === 'skill' && match[2]) {
        const skill = skills.find((s) => s.name === match[2]);
        if (skill) {
          replacement = `[Skill: ${match[2]}]\n${skill.content}`;
        }
      } else if (match[3]) {
        const workspacePath = fileWatcher.getWorkspacePath();
        const filePath = workspacePath ? `${workspacePath}/${match[3]}` : match[3];
        replacement = `(See file: ${filePath})`;
      }
    } catch (error) {
      console.error(`Failed to resolve mention ${match[0]}:`, error);
    }

    resolved = resolved.slice(0, start) + replacement + resolved.slice(end);
  }

  return resolved;
}

/**
 * Generate a chat title using the Anthropic Messages API directly (no SDK session).
 * Returns the generated title string, or null on failure.
 */
export async function generateTitleWithAI(userMessage: string, configService: ConfigService): Promise<string | null> {
  try {
    const env = await configService.getClaudeEnv();
    const apiKey = env.ANTHROPIC_AUTH_TOKEN;
    if (!apiKey) return null;

    const baseUrl = env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com';
    const model = env.ANTHROPIC_MODEL || 'claude-haiku-4-5';
    const truncatedMessage = userMessage.substring(0, 500);

    const response = await fetch(`${baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model,
        max_tokens: 20,
        system:
          'Generate a short title in 5 words or fewer for this conversation based on the user message. Return only the title text, nothing else. No quotes, no punctuation at the end.',
        messages: [{ role: 'user', content: truncatedMessage }]
      })
    });

    if (!response.ok) {
      console.error('Title generation API error:', response.status, response.statusText);
      return null;
    }

    const data = (await response.json()) as { content?: Array<{ text?: string }> };
    const title = data?.content?.[0]?.text?.trim();
    return title || null;
  } catch (error) {
    console.error('Failed to generate title with AI:', error);
    return null;
  }
}

export function registerChatHandlers(
  win: BrowserWindow,
  claudeService: ClaudeService,
  dbService: DatabaseService,
  skillsService: SkillsService,
  commandsService: CommandsService,
  fileWatcher: FileWatcherService,
  configService: ConfigService,
  diskService: DiskService
): void {
  // Send message and start streaming
  ipcMain.handle(
    IPC_CHANNELS.CHAT_SEND,
    async (
      _event,
      sessionId: string,
      message: string,
      files?: Array<{ path: string; content: string }>,
      sdkSessionId?: string
    ) => {
      try {
        // Resolve mentions for Claude
        const resolvedMessage = await resolveMentions(
          message,
          skillsService,
          commandsService,
          fileWatcher,
          diskService
        );

        // Prepend disk system prompt if set
        let finalMessage = resolvedMessage;
        const currentDisk = await diskService.getCurrentDisk();
        if (currentDisk.systemPrompt) {
          finalMessage = `[System Context]\n${currentDisk.systemPrompt}\n\n[User Message]\n${resolvedMessage}`;
        }

        // Send resolved message to Claude service (returns immediately)
        await claudeService.sendMessage(sessionId, finalMessage, files, sdkSessionId);

        // Save original (with markers) to database
        await dbService.createMessage({
          id: randomUUID(),
          sessionId,
          role: 'user',
          content: JSON.stringify([{ type: 'text', text: message }]),
          createdAt: new Date()
        });

        // Auto-update title on first message
        const existingMessages = await dbService.getMessages(sessionId);
        // Only 1 message means this is the first (the one we just saved)
        if (existingMessages.length === 1) {
          const aiTitlesSetting = await dbService.getSetting('ai_generate_titles');
          const useAI = aiTitlesSetting === 'true';

          if (useAI) {
            // Fire-and-forget: generate title with AI, fallback to truncation
            generateTitleWithAI(message, configService)
              .then(async (title) => {
                const finalTitle = title || truncateTitle(message);
                await dbService.updateSession(sessionId, { name: finalTitle, updatedAt: new Date() });
                win.webContents.send(IPC_CHANNELS.CHAT_TITLE_UPDATED, sessionId, finalTitle);
              })
              .catch(async (err) => {
                console.error('AI title generation failed, using truncation:', err);
                const fallbackTitle = truncateTitle(message);
                await dbService.updateSession(sessionId, { name: fallbackTitle, updatedAt: new Date() });
                win.webContents.send(IPC_CHANNELS.CHAT_TITLE_UPDATED, sessionId, fallbackTitle);
              });
          } else {
            // Truncate user message immediately
            const title = truncateTitle(message);
            await dbService.updateSession(sessionId, { name: title, updatedAt: new Date() });
            win.webContents.send(IPC_CHANNELS.CHAT_TITLE_UPDATED, sessionId, title);
          }
        }

        return { success: true } as IPCResponse;
      } catch (error) {
        console.error('CHAT_SEND error:', error);
        return { success: false, error: (error as Error).message } as IPCResponse;
      }
    }
  );

  // Respond to permission request
  ipcMain.handle(
    IPC_CHANNELS.CHAT_PERMISSION_RESPONSE,
    async (_event, permissionRequestId: string, approved: boolean, input?: Record<string, unknown>) => {
      try {
        claudeService.respondToPermission(permissionRequestId, approved, input);
        return { success: true } as IPCResponse;
      } catch (error) {
        console.error('CHAT_PERMISSION_RESPONSE error:', error);
        return { success: false, error: (error as Error).message } as IPCResponse;
      }
    }
  );

  // Abort session
  ipcMain.handle(IPC_CHANNELS.CHAT_ABORT, async (_event, sessionId: string) => {
    try {
      claudeService.abortSession(sessionId);
      return { success: true } as IPCResponse;
    } catch (error) {
      console.error('CHAT_ABORT error:', error);
      return { success: false, error: (error as Error).message } as IPCResponse;
    }
  });
}

/**
 * Create stream event emitter for Claude service
 * This is passed to ClaudeService constructor to emit stream events to renderer
 */
export function createStreamEventEmitter(win: BrowserWindow, dbService: DatabaseService) {
  const assistantBuffers = new Map<string, string>();

  return (sessionId: string, event: StreamEvent) => {
    // Emit stream event to renderer via webContents
    win.webContents.send(IPC_CHANNELS.CHAT_STREAM, sessionId, event);

    if (event.type === 'text') {
      const current = assistantBuffers.get(sessionId) || '';
      assistantBuffers.set(sessionId, current + (event.data as string));
    }

    if (event.type === 'done') {
      const content = assistantBuffers.get(sessionId);
      if (content) {
        void dbService.createMessage({
          id: randomUUID(),
          sessionId,
          role: 'assistant',
          content: JSON.stringify([{ type: 'text', text: content }]),
          tokenUsage: null,
          createdAt: new Date()
        });
      }
      assistantBuffers.delete(sessionId);
    }

    // Log for debugging
    if (event.type === 'text') {
      console.log(`[Stream ${sessionId}] Text: ${(event.data as string).substring(0, 50)}...`);
    } else if (event.type === 'error') {
      console.error(`[Stream ${sessionId}] Error: ${event.data}`);
    } else {
      console.log(`[Stream ${sessionId}] ${event.type}`);
    }
  };
}
