/**
 * ChatInterface Component - Main chat interface with message list and input
 */

import { useState, useEffect, useRef } from 'react'
import { useChatStore } from '../stores/chat-store'
import { Button, Input, ScrollArea } from './ui'
import type { ChatMessage } from '../stores/chat-store'

export function ChatInterface() {
  const { currentSession, sendMessage, pendingPermissionRequest, respondToPermission } =
    useChatStore()
  const [inputValue, setInputValue] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [currentSession?.messages])

  const handleSend = async () => {
    if (!inputValue.trim() || !currentSession) return

    setIsLoading(true)
    try {
      await sendMessage(inputValue)
      setInputValue('')
    } catch (error) {
      console.error('Failed to send message:', error)
      alert('Failed to send message')
    } finally {
      setIsLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  if (!currentSession) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center text-gray-500 dark:text-gray-400">
          <div className="mb-2 text-lg font-medium">No session selected</div>
          <div className="text-sm">Select or create a session to start chatting</div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      {/* Messages area */}
      <ScrollArea className="flex-1 p-4">
        <div className="mx-auto max-w-3xl space-y-4">
          {currentSession.messages.map((message) => (
            <MessageBubble key={message.id} message={message} />
          ))}
          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      {/* Permission request dialog */}
      {pendingPermissionRequest && (
        <div className="border-t border-yellow-200 bg-yellow-50 p-4 dark:border-yellow-900 dark:bg-yellow-950">
          <div className="mx-auto max-w-3xl">
            <div className="mb-2 font-medium text-yellow-900 dark:text-yellow-100">
              Permission Request
            </div>
            <div className="mb-3 text-sm text-yellow-800 dark:text-yellow-200">
              <div className="font-medium">{pendingPermissionRequest.toolName}</div>
              <div className="text-xs">{pendingPermissionRequest.description}</div>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="primary"
                onClick={() =>
                  respondToPermission(pendingPermissionRequest.permissionRequestId, true)
                }
              >
                Allow
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() =>
                  respondToPermission(pendingPermissionRequest.permissionRequestId, false)
                }
              >
                Deny
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Input area */}
      <div className="border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 p-4">
        <div className="mx-auto max-w-3xl flex gap-2">
          <Input
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type your message..."
            disabled={isLoading}
            className="flex-1"
          />
          <Button onClick={handleSend} disabled={isLoading || !inputValue.trim()}>
            {isLoading ? 'Sending...' : 'Send'}
          </Button>
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
  if (message.isStreaming && message.streamingText) {
    textContent = message.streamingText
  }

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[80%] rounded-lg px-4 py-2 ${
          isUser
            ? 'bg-blue-600 text-white'
            : 'bg-gray-100 text-gray-900 dark:bg-gray-800 dark:text-gray-100'
        }`}
      >
        <div className="text-sm whitespace-pre-wrap">{textContent}</div>
        {message.isStreaming && (
          <div className="mt-1 flex items-center gap-1 text-xs opacity-70">
            <div className="animate-pulse">●</div>
            <span>Streaming...</span>
          </div>
        )}
      </div>
    </div>
  )
}
