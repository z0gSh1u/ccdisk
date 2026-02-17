/**
 * ChatInterface Component - Main chat interface with message list and input
 */

import { useState, useEffect, useRef } from 'react';
import { useChatStore } from '../stores/chat-store';
import { Button, ScrollArea } from './ui';
import type { ChatContentBlock, ChatMessage } from '../stores/chat-store';
import { User, Sparkles, HelpCircle, CheckCircle2, XCircle } from 'lucide-react';
import { MarkdownRenderer } from './chat/MarkdownRenderer';
import { LexicalMessageInput } from './chat/LexicalMessageInput';

export function ChatInterface() {
  const {
    sessions,
    currentSessionId,
    sendMessage,
    pendingPermissionRequest,
    respondToPermission,
    abortSession
  } = useChatStore();
  const currentSession = sessions.find((session) => session.id === currentSessionId) || null;
  const isResponding = Boolean(currentSession?.messages.some((message) => message.isStreaming));
  const [isLoading, setIsLoading] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [currentSession?.messages]);

  const handleSend = async (message: string) => {
    if (!message.trim() || !currentSession) return;

    setIsLoading(true);
    setSendError(null);
    try {
      await sendMessage(message);
    } catch (error) {
      console.error('Failed to send message:', error);
      const messageText = error instanceof Error ? error.message : 'Failed to send message';
      setSendError(messageText);
      if (!messageText.includes('responding')) {
        alert('Failed to send message');
      }
    } finally {
      setIsLoading(false);
    }
  };

  if (!currentSession) {
    return (
      <div className="flex h-full flex-col items-center justify-center bg-bg-primary">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent text-white shadow-lg mb-6">
          <Sparkles className="h-6 w-6" />
        </div>
        <div className="text-center max-w-md px-6">
          <h2 className="mb-2 text-2xl font-serif text-text-primary">Welcome to CCDisk</h2>
          <p className="text-text-secondary">
            Select a session from the sidebar or start a new conversation to begin collaborating.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-bg-primary relative">
      {/* Messages area */}
      <ScrollArea className="flex-1">
        <div className="mx-auto max-w-3xl px-4 py-8 space-y-8">
          {currentSession.messages.map((message) => (
            <MessageBubble key={message.id} message={message} />
          ))}
          <div ref={messagesEndRef} className="h-4" />
        </div>
      </ScrollArea>

      {/* Permission request dialog - Floating */}
      {pendingPermissionRequest && (
        <div className="absolute bottom-24 left-1/2 -translate-x-1/2 w-full max-w-2xl px-4 z-20">
          <div className="rounded-xl border border-yellow-200 bg-yellow-50/95 backdrop-blur-sm p-4 shadow-lg dark:border-yellow-900 dark:bg-yellow-950/90">
            <div className="flex items-start gap-3">
              <div className="rounded-full bg-yellow-100 p-2 text-yellow-600 dark:bg-yellow-900/50 dark:text-yellow-400">
                <Sparkles className="h-4 w-4" />
              </div>
              <div className="flex-1">
                <div className="mb-1 font-semibold text-yellow-900 dark:text-yellow-100">Tool Permission Request</div>
                <div className="mb-3 text-sm text-yellow-800 dark:text-yellow-200">
                  <span className="font-mono text-xs bg-yellow-100/50 px-1 py-0.5 rounded mr-1">
                    {pendingPermissionRequest.toolName}
                  </span>
                  {pendingPermissionRequest.description}
                </div>
                <pre className="mb-3 rounded-lg bg-yellow-100/60 px-3 py-2 text-xs text-yellow-900 whitespace-pre-wrap break-words">
                  {formatToolInput(pendingPermissionRequest.toolInput)}
                </pre>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    className="bg-yellow-600 hover:bg-yellow-700 text-white border-none shadow-sm"
                    onClick={() => respondToPermission(pendingPermissionRequest.permissionRequestId, true)}
                  >
                    Allow Access
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-yellow-700 hover:bg-yellow-100 hover:text-yellow-900 dark:text-yellow-300 dark:hover:bg-yellow-900/50"
                    onClick={() => respondToPermission(pendingPermissionRequest.permissionRequestId, false)}
                  >
                    Deny
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Input area */}
      <div className="p-4 bg-bg-primary/80 backdrop-blur-md sticky bottom-0 z-10">
        <div className="mx-auto max-w-3xl relative">
          <LexicalMessageInput
            onSend={handleSend}
            disabled={isLoading || isResponding}
            placeholder={isResponding ? 'Claude is responding...' : 'Ask Claude...'}
          />
          {isResponding && currentSessionId && (
            <div className="mt-2 flex items-center justify-center">
              <Button size="sm" variant="ghost" onClick={() => abortSession(currentSessionId)}>
                Stop
              </Button>
            </div>
          )}
          {sendError && sendError.includes('responding') && (
            <div className="mt-2 text-xs text-text-secondary">
              Claude is responding. Click Stop to interrupt before sending another message.
            </div>
          )}
          <div className="mt-2 text-center text-xs text-text-tertiary">
            Claude can make mistakes. Please use with caution.
          </div>
        </div>
      </div>
    </div>
  );
}

// MessageBubble sub-component
function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';

  const isStreaming = message.isStreaming || false;
  const blocks = getMessageBlocks(message);

  return (
    <div className={`group flex gap-4 ${isUser ? 'justify-end' : 'justify-start'}`}>
      {!isUser && (
        <div className="flex h-8 w-8 shrink-0 select-none items-center justify-center rounded-lg bg-accent text-white shadow-sm">
          <Sparkles className="h-5 w-5" />
        </div>
      )}

      <div
        className={`relative max-w-[85%] ${
          isUser ? 'bg-bg-accent text-text-primary px-5 py-3 rounded-2xl rounded-tr-sm' : 'text-text-primary py-1'
        }`}
      >
        {isUser ? (
          <div className="text-base leading-relaxed whitespace-pre-wrap">
            {blocks
              .filter((block) => block.type === 'text')
              .map((block) => block.text)
              .join(' ')}
          </div>
        ) : (
          <div className="space-y-3">
            {blocks.map((block, index) => (
              <MessageBlock key={`${message.id}-${index}`} block={block} isStreaming={isStreaming} />
            ))}
          </div>
        )}

        {isStreaming && (
          <div className="mt-2 flex items-center gap-1.5 text-xs text-accent font-medium">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-accent"></span>
            </span>
            Thinking...
          </div>
        )}
      </div>

      {isUser && (
        <div className="flex h-8 w-8 shrink-0 select-none items-center justify-center rounded-lg bg-bg-accent text-text-secondary border border-border-subtle">
          <User className="h-5 w-5" />
        </div>
      )}
    </div>
  );
}

function getMessageBlocks(message: ChatMessage): ChatContentBlock[] {
  const isStreaming = message.isStreaming || false;
  if (isStreaming && message.streamingBlocks) {
    return message.streamingBlocks;
  }
  if (Array.isArray(message.content)) {
    return message.content.map((block) => convertLegacyBlock(block));
  }
  if (typeof message.content === 'string') {
    try {
      const parsed = JSON.parse(message.content) as unknown;
      if (Array.isArray(parsed)) {
        return parsed.map((block) =>
          typeof block === 'object' && block && 'type' in (block as any)
            ? convertLegacyBlock(block)
            : (block as ChatContentBlock)
        );
      }
      if (typeof parsed === 'string') {
        return [{ type: 'text', text: parsed }];
      }
    } catch {
      return [{ type: 'text', text: message.content }];
    }
  }
  return [];
}

function convertLegacyBlock(block: any): ChatContentBlock {
  if (!block || typeof block !== 'object') {
    return { type: 'text', text: String(block ?? '') };
  }
  if (block.type === 'tool_call' || block.type === 'text') return block as ChatContentBlock;
  if (block.type === 'tool_use') {
    return {
      type: 'tool_call',
      toolName: block.toolName,
      toolInput: block.toolInput
    };
  }
  if (block.type === 'tool_result') {
    return {
      type: 'tool_call',
      toolName: 'tool',
      toolInput: {},
      result: { content: block.content, is_error: block.is_error }
    };
  }
  if (block.type === 'permission') {
    return {
      type: 'tool_call',
      toolName: block.toolName,
      toolInput: block.toolInput,
      permissionStatus: block.status
    };
  }
  return { type: 'text', text: JSON.stringify(block) };
}

function MessageBlock({ block, isStreaming }: { block: ChatContentBlock; isStreaming: boolean }) {
  switch (block.type) {
    case 'text':
      return <MarkdownRenderer content={block.text} isStreaming={isStreaming} className="text-base leading-relaxed" />;
    case 'tool_call':
      return (
        <div className="rounded-lg border border-border-subtle bg-bg-secondary/60 px-3 py-2">
          <div className="text-xs font-semibold text-text-secondary">Tool call</div>
          <div className="text-sm font-mono text-text-primary">{block.toolName}</div>
          <pre className="mt-2 text-xs text-text-secondary whitespace-pre-wrap break-words">
            {formatToolInput(block.toolInput)}
          </pre>
          {block.permissionStatus && (
            <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-yellow-100/70 px-2 py-1 text-xs font-semibold text-yellow-900">
              {renderPermissionIcon(block.permissionStatus)}
              <span>Permission {block.permissionStatus}</span>
            </div>
          )}
          {block.result && (
            <div
              className={`mt-2 rounded-md border px-2 py-1 text-xs whitespace-pre-wrap break-words ${
                block.result.is_error
                  ? 'border-red-300 bg-red-50 text-red-900'
                  : 'border-border-subtle bg-bg-primary text-text-primary'
              }`}
            >
              <div className="text-[10px] font-semibold">Tool result</div>
              {block.result.content}
            </div>
          )}
        </div>
      );
    default:
      return null;
  }
}

function formatToolInput(input: Record<string, unknown>) {
  try {
    return JSON.stringify(input, null, 2);
  } catch {
    return String(input);
  }
}

function renderPermissionIcon(status: 'requested' | 'allowed' | 'denied') {
  if (status === 'allowed') {
    return <CheckCircle2 className="h-3.5 w-3.5" />;
  }
  if (status === 'denied') {
    return <XCircle className="h-3.5 w-3.5" />;
  }
  return <HelpCircle className="h-3.5 w-3.5" />;
}
