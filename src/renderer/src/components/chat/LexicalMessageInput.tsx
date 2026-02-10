/**
 * LexicalMessageInput - Lexical-based plain text input for chat messages
 * Uses PlainTextPlugin for simple text editing with Enter to send
 */

import { useCallback, useEffect, useRef } from 'react'
import { LexicalComposer } from '@lexical/react/LexicalComposer'
import { PlainTextPlugin } from '@lexical/react/LexicalPlainTextPlugin'
import { ContentEditable } from '@lexical/react/LexicalContentEditable'
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin'
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { $getRoot, $createParagraphNode, KEY_ENTER_COMMAND, COMMAND_PRIORITY_HIGH } from 'lexical'
import { mergeRegister } from '@lexical/utils'
import { Button } from '../ui'
import { ArrowUp, Paperclip } from 'lucide-react'

interface LexicalMessageInputProps {
  onSend: (message: string) => void
  disabled?: boolean
  placeholder?: string
}

// Theme configuration for Lexical
const theme = {
  paragraph: 'mb-0',
  text: {
    base: 'text-[var(--text-primary)]'
  }
}

// Initial editor configuration
const initialConfig = {
  namespace: 'ChatInput',
  theme,
  onError: (error: Error) => {
    console.error('Lexical error:', error)
  }
}

// Custom plugin to handle Enter key and extract content
function EnterKeyPlugin({
  onSend,
  disabled,
  onTextChange
}: {
  onSend: (message: string) => void
  disabled: boolean
  onTextChange: (text: string) => void
}) {
  const [editor] = useLexicalComposerContext()

  useEffect(() => {
    return mergeRegister(
      editor.registerCommand(
        KEY_ENTER_COMMAND,
        (event: KeyboardEvent) => {
          if (disabled) return true

          // Shift+Enter = new line (let default behavior happen)
          if (event.shiftKey) {
            return false
          }

          // Enter = send message
          event.preventDefault()

          editor.getEditorState().read(() => {
            const root = $getRoot()
            const text = root.getTextContent().trim()

            if (text) {
              onSend(text)
              // Clear editor after sending
              editor.update(() => {
                const root = $getRoot()
                root.clear()
                const paragraph = $createParagraphNode()
                root.append(paragraph)
                paragraph.select()
              })
              onTextChange('')
            }
          })

          return true
        },
        COMMAND_PRIORITY_HIGH
      )
    )
  }, [editor, onSend, disabled, onTextChange])

  return null
}

// Clear editor plugin (expose method to parent)
function ClearEditorPlugin({
  clearRef
}: {
  clearRef: React.MutableRefObject<(() => void) | null>
}) {
  const [editor] = useLexicalComposerContext()

  useEffect(() => {
    clearRef.current = () => {
      editor.update(() => {
        const root = $getRoot()
        root.clear()
        const paragraph = $createParagraphNode()
        root.append(paragraph)
        paragraph.select()
      })
    }
  }, [editor, clearRef])

  return null
}

export function LexicalMessageInput({
  onSend,
  disabled = false,
  placeholder = 'Ask Claude...'
}: LexicalMessageInputProps) {
  const hasText = useRef(false)
  const clearEditorRef = useRef<(() => void) | null>(null)

  const handleSend = useCallback(() => {
    if (disabled || !hasText.current) return

    // Get current text and send
    // Note: The actual sending is handled by EnterKeyPlugin
    // This button click simulates an Enter key press
    const event = new KeyboardEvent('keydown', {
      key: 'Enter',
      code: 'Enter',
      keyCode: 13,
      which: 13,
      bubbles: true,
      cancelable: true
    })
    document.querySelector('[contenteditable="true"]')?.dispatchEvent(event)
  }, [disabled])

  const handleTextChange = useCallback((text: string) => {
    hasText.current = text.trim().length > 0
  }, [])

  const handleFileUpload = useCallback(() => {
    // TODO: Implement file upload functionality
    console.log('File upload clicked')
  }, [])

  return (
    <LexicalComposer initialConfig={initialConfig}>
      <div className="relative rounded-2xl border border-[var(--border-strong)] bg-white shadow-sm transition-shadow focus-within:shadow-md focus-within:border-[var(--accent-color)] overflow-hidden">
        {/* File upload button */}
        <div className="absolute left-2 bottom-2 z-10">
          <Button
            onClick={handleFileUpload}
            disabled={disabled}
            variant="ghost"
            className="h-8 w-8 p-0 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-gray-100"
          >
            <Paperclip className="h-4 w-4" />
          </Button>
        </div>

        {/* Lexical editor */}
        <div className="relative">
          <PlainTextPlugin
            contentEditable={
              <ContentEditable className="w-full min-h-[48px] max-h-[200px] overflow-y-auto border-none bg-transparent py-4 pl-12 pr-12 text-[var(--text-primary)] placeholder-[var(--text-tertiary)] focus:outline-none text-base resize-none" />
            }
            placeholder={
              <div className="absolute top-4 left-12 text-[var(--text-tertiary)] pointer-events-none select-none">
                {placeholder}
              </div>
            }
            ErrorBoundary={() => <div>Error loading editor</div>}
          />
        </div>

        {/* Send button */}
        <div className="absolute right-2 bottom-2">
          <Button
            onClick={handleSend}
            disabled={disabled || !hasText.current}
            className={`h-8 w-8 p-0 rounded-lg transition-colors flex items-center justify-center ${
              !hasText.current
                ? 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                : 'bg-[var(--accent-color)] text-white hover:bg-[var(--accent-hover)] shadow-sm'
            }`}
          >
            {disabled ? (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
            ) : (
              <ArrowUp className="h-4 w-4" />
            )}
          </Button>
        </div>

        {/* Plugins */}
        <HistoryPlugin />
        <OnChangePlugin
          onChange={(editorState) => {
            editorState.read(() => {
              const root = $getRoot()
              const text = root.getTextContent()
              handleTextChange(text)
            })
          }}
        />
        <EnterKeyPlugin onSend={onSend} disabled={disabled} onTextChange={handleTextChange} />
        <ClearEditorPlugin clearRef={clearEditorRef} />
      </div>
    </LexicalComposer>
  )
}
