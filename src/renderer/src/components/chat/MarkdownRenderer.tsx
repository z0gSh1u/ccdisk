/**
 * MarkdownRenderer Component - Renders markdown content with streaming support
 * Uses Vercel's streamdown library for AI-powered streaming markdown
 */

import { Streamdown } from 'streamdown'
import { code } from '@streamdown/code'
import { mermaid } from '@streamdown/mermaid'
import { math } from '@streamdown/math'
import { cjk } from '@streamdown/cjk'

interface MarkdownRendererProps {
  /** The markdown content to render */
  content: string
  /** Whether the content is currently streaming */
  isStreaming?: boolean
  /** Additional CSS classes */
  className?: string
}

/**
 * MarkdownRenderer renders markdown content with support for:
 * - Streaming content (text appearing gradually)
 * - Code syntax highlighting via Shiki
 * - Math equations via KaTeX
 * - Mermaid diagrams
 * - GitHub Flavored Markdown (tables, task lists, etc.)
 * - CJK language support
 * - Unterminated block parsing (handles incomplete markdown gracefully)
 */
export function MarkdownRenderer({
  content,
  isStreaming = false,
  className = ''
}: MarkdownRendererProps) {
  return (
    <div className={`markdown-content ${className}`}>
      <Streamdown animated plugins={{ code, mermaid, math, cjk }} isAnimating={isStreaming}>
        {content}
      </Streamdown>
    </div>
  )
}
