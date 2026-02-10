/**
 * ChatInterface Component - Main chat interface with message list and input
 */

import { useState, useEffect, useRef } from 'react'
import { useChatStore } from '../stores/chat-store'
import { Button, ScrollArea } from './ui'
import type { ChatMessage } from '../stores/chat-store'
import { User, Sparkles } from 'lucide-react'
import { MarkdownRenderer } from './chat/MarkdownRenderer'
import { LexicalMessageInput } from './chat/LexicalMessageInput'

export function ChatInterface() {
  const { sessions, currentSessionId, sendMessage, pendingPermissionRequest, respondToPermission } =
    useChatStore()
  const currentSession = sessions.find((session) => session.id === currentSessionId) || null
  const [isLoading, setIsLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [currentSession?.messages])

  const handleSend = async (message: string) => {
    if (!message.trim() || !currentSession) return

    setIsLoading(true)
    try {
      await sendMessage(message)
    } catch (error) {
      console.error('Failed to send message:', error)
      alert('Failed to send message')
    } finally {
      setIsLoading(false)
    }
  }

  if (!currentSession) {
    return (
      <div className="flex h-full flex-col items-center justify-center bg-[var(--bg-primary)]">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--accent-color)] text-white shadow-lg mb-6">
          <Sparkles className="h-6 w-6" />
        </div>
        <div className="text-center max-w-md px-6">
          <h2 className="mb-2 text-2xl font-serif text-[var(--text-primary)]">
            Welcome to Claude Code
          </h2>
          <p className="text-[var(--text-secondary)]">
            Select a session from the sidebar or start a new conversation to begin collaborating.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col bg-[var(--bg-primary)] relative">
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
                <div className="mb-1 font-semibold text-yellow-900 dark:text-yellow-100">
                  Tool Permission Request
                </div>
                <div className="mb-3 text-sm text-yellow-800 dark:text-yellow-200">
                  <span className="font-mono text-xs bg-yellow-100/50 px-1 py-0.5 rounded mr-1">
                    {pendingPermissionRequest.toolName}
                  </span>
                  {pendingPermissionRequest.description}
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    className="bg-yellow-600 hover:bg-yellow-700 text-white border-none shadow-sm"
                    onClick={() =>
                      respondToPermission(pendingPermissionRequest.permissionRequestId, true)
                    }
                  >
                    Allow Access
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-yellow-700 hover:bg-yellow-100 hover:text-yellow-900 dark:text-yellow-300 dark:hover:bg-yellow-900/50"
                    onClick={() =>
                      respondToPermission(pendingPermissionRequest.permissionRequestId, false)
                    }
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
      <div className="p-4 bg-[var(--bg-primary)]/80 backdrop-blur-md sticky bottom-0 z-10">
        <div className="mx-auto max-w-3xl relative">
          <LexicalMessageInput
            onSend={handleSend}
            disabled={isLoading}
            placeholder="Ask Claude..."
          />
          <div className="mt-2 text-center text-xs text-[var(--text-tertiary)]">
            Claude can make mistakes. Please use with caution.
          </div>
        </div>
      </div>
    </div>
  )
}

// MessageBubble sub-component
function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user'

  // Parse content
  let textContent = ''
  try {
    const content = JSON.parse(message.content)
    if (Array.isArray(content)) {
      textContent = content
        .filter((block) => block.type === 'text')
        .map((block) => block.text)
        .join(' ')
    }
  } catch {
    textContent = message.content
  }

  // Show streaming text if available
  const isStreaming = message.isStreaming || false
  if (isStreaming && message.streamingText) {
    textContent = message.streamingText
  }

  return (
    <div className={`group flex gap-4 ${isUser ? 'justify-end' : 'justify-start'}`}>
      {!isUser && (
        <div className="flex h-8 w-8 shrink-0 select-none items-center justify-center rounded-lg bg-[var(--accent-color)] text-white shadow-sm">
          <Sparkles className="h-5 w-5" />
        </div>
      )}

      <div
        className={`relative max-w-[85%] ${
          isUser
            ? 'bg-[var(--bg-accent)] text-[var(--text-primary)] px-5 py-3 rounded-2xl rounded-tr-sm'
            : 'text-[var(--text-primary)] py-1'
        }`}
      >
        {isUser ? (
          <div className="text-base leading-relaxed whitespace-pre-wrap">{textContent}</div>
        ) : (
          <MarkdownRenderer
            content={textContent}
            isStreaming={isStreaming}
            className="text-base leading-relaxed"
          />
        )}

        {isStreaming && (
          <div className="mt-2 flex items-center gap-1.5 text-xs text-[var(--accent-color)] font-medium">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--accent-color)] opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-[var(--accent-color)]"></span>
            </span>
            Thinking...
          </div>
        )}
      </div>

      {isUser && (
        <div className="flex h-8 w-8 shrink-0 select-none items-center justify-center rounded-lg bg-[var(--bg-accent)] text-[var(--text-secondary)] border border-[var(--border-subtle)]">
          <User className="h-5 w-5" />
        </div>
      )}
    </div>
  )
}
