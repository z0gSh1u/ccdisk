/**
 * LexicalMessageInput - Lexical-based plain text input for chat messages
 * Uses PlainTextPlugin for simple text editing with Enter to send
 * Supports / slash commands and @ file mentions via plugins
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';

import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { PlainTextPlugin } from '@lexical/react/LexicalPlainTextPlugin';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary';
import { $getRoot, $createParagraphNode, KEY_ENTER_COMMAND, COMMAND_PRIORITY_HIGH } from 'lexical';
import { mergeRegister } from '@lexical/utils';
import { Button } from '../ui';
import { ArrowUp, Paperclip } from 'lucide-react';
import { MentionNode } from './nodes/MentionNode';
import { SlashCommandPlugin } from './plugins/SlashCommandPlugin';
import { FileMentionPlugin } from './plugins/FileMentionPlugin';
import { MentionDeletePlugin } from './plugins/MentionDeletePlugin';
import { $serializeToMarkedText } from './utils/mention-serialization';

interface LexicalMessageInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
  placeholder?: string;
  onStop?: () => void;
}

// Theme configuration for Lexical
const theme = {
  paragraph: 'mb-0',
  text: {
    base: 'text-text-primary'
  },
  mention: 'inline'
};

// Initial editor configuration
const initialConfig = {
  namespace: 'ChatInput',
  theme,
  nodes: [MentionNode],
  onError: (error: Error) => {
    console.error('Lexical error:', error);
  }
};

// Custom plugin to handle Enter key and extract content
function EnterKeyPlugin({
  onSend,
  disabled,
  onTextChange
}: {
  onSend: (message: string) => void;
  disabled: boolean;
  onTextChange: (text: string) => void;
}): null {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return mergeRegister(
      editor.registerCommand(
        KEY_ENTER_COMMAND,
        (event: KeyboardEvent) => {
          if (disabled) return true;

          // Shift+Enter = new line (let default behavior happen)
          if (event.shiftKey) {
            return false;
          }

          // Enter = send message
          event.preventDefault();

          editor.getEditorState().read(() => {
            const text = $serializeToMarkedText().trim();

            if (text) {
              onSend(text);
              // Clear editor after sending
              editor.update(() => {
                const root = $getRoot();
                root.clear();
                const paragraph = $createParagraphNode();
                root.append(paragraph);
                paragraph.select();
              });
              onTextChange('');
            }
          });

          return true;
        },
        COMMAND_PRIORITY_HIGH
      )
    );
  }, [editor, onSend, disabled, onTextChange]);

  return null;
}

// Clear editor plugin (expose method to parent)
function ClearEditorPlugin({ clearRef }: { clearRef: React.MutableRefObject<(() => void) | null> }): null {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    clearRef.current = () => {
      editor.update(() => {
        const root = $getRoot();
        root.clear();
        const paragraph = $createParagraphNode();
        root.append(paragraph);
        paragraph.select();
      });
    };
  }, [editor, clearRef]);

  return null;
}

export function LexicalMessageInput({
  onSend,
  disabled = false,
  placeholder = 'Ask Claude...',
  onStop
}: LexicalMessageInputProps): React.JSX.Element {
  const [hasText, setHasText] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  const clearEditorRef = useRef<(() => void) | null>(null);

  const showStop = onStop && disabled;

  const handleClick = useCallback(() => {
    if (showStop) {
      onStop();
    } else if (!disabled && hasText) {
      const event = new KeyboardEvent('keydown', {
        key: 'Enter',
        code: 'Enter',
        keyCode: 13,
        which: 13,
        bubbles: true,
        cancelable: true
      });
      document.querySelector('[contenteditable="true"]')?.dispatchEvent(event);
    }
  }, [showStop, onStop, disabled, hasText]);

  const handleTextChange = useCallback((text: string) => {
    setHasText(text.trim().length > 0);
  }, []);

  const handleFileUpload = useCallback(() => {
    // TODO: Implement file upload functionality
    console.log('File upload clicked');
  }, []);

  return (
    <LexicalComposer initialConfig={initialConfig}>
      <div className="rounded-2xl border border-border-strong bg-white shadow-sm transition-shadow focus-within:shadow-md focus-within:border-accent overflow-hidden">
        {/* Input area - fixed 2 rows */}
        <div className="relative">
          <PlainTextPlugin
            contentEditable={
              <ContentEditable className="w-full h-[60px] overflow-y-auto border-none bg-transparent py-2 px-4 text-text-primary placeholder-text-tertiary focus:outline-none text-base resize-none leading-6" />
            }
            placeholder={
              <div className="absolute top-2 left-4 text-text-tertiary pointer-events-none select-none leading-6">
                {placeholder}
              </div>
            }
            ErrorBoundary={LexicalErrorBoundary}
          />
        </div>

        {/* Button bar */}
        <div className="flex items-center justify-end gap-2 px-4 pb-3">
          <Button
            onClick={handleFileUpload}
            disabled={disabled}
            variant="ghost"
            className="h-8 w-8 p-0 rounded-lg text-text-tertiary hover:text-text-primary hover:bg-gray-100"
          >
            <Paperclip className="h-4 w-4" />
          </Button>
          <Button
            onClick={handleClick}
            onMouseEnter={() => setIsHovering(true)}
            onMouseLeave={() => setIsHovering(false)}
            disabled={disabled && !onStop}
            className={`h-8 px-3 rounded-lg transition-colors flex items-center justify-center gap-1.5 text-sm font-medium ${
              showStop
                ? isHovering
                  ? 'bg-red-500 text-white hover:bg-red-600 shadow-sm'
                  : 'bg-accent text-white'
                : !hasText
                  ? 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                  : 'bg-accent text-white hover:bg-accent-hover shadow-sm'
            }`}
          >
            {showStop ? (
              isHovering ? (
                <>
                  <span>Stop</span>
                </>
              ) : (
                <>
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                </>
              )
            ) : (
              <>
                <ArrowUp className="h-4 w-4" />
                <span>Send</span>
              </>
            )}
          </Button>
        </div>

        {/* Plugins */}
        <HistoryPlugin />
        <OnChangePlugin
          onChange={(editorState) => {
            editorState.read(() => {
              const text = $serializeToMarkedText();
              handleTextChange(text);
            });
          }}
        />
        <EnterKeyPlugin onSend={onSend} disabled={disabled} onTextChange={handleTextChange} />
        <ClearEditorPlugin clearRef={clearEditorRef} />
        <SlashCommandPlugin />
        <FileMentionPlugin />
        <MentionDeletePlugin />
      </div>
    </LexicalComposer>
  );
}
