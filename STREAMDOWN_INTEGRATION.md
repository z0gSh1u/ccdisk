# Streamdown Integration - Markdown Renderer

## Overview

The chat interface now uses Vercel's **Streamdown** library for rendering markdown content from Claude. Streamdown is specifically designed for AI-powered streaming and handles incomplete markdown gracefully.

## Features Supported

### ✅ Core Markdown Features

- **Headings** (H1-H6) - Styled with custom fonts
- **Bold** (`**bold**`) and _Italic_ (`*italic*`)
- **Links** - With hover effects and accent color
- **Lists** - Ordered and unordered lists
- **Blockquotes** - With left border styling
- **Horizontal rules**
- **Images** - Auto-sized and rounded
- **Inline code** - Custom styling with accent background

### ✅ GitHub Flavored Markdown (GFM)

- **Tables** - Full table support with header styling
- **Task lists** - `- [ ]` and `- [x]` checkboxes
- **Strikethrough** - `~~strikethrough~~`
- **Autolinks** - URLs automatically become clickable

### ✅ Code Blocks with Syntax Highlighting

- Powered by **Shiki** (via `@streamdown/code`)
- Supports 100+ programming languages
- Beautiful syntax highlighting themes
- Copy and download buttons in code block headers

### ✅ Mathematical Expressions

- LaTeX math rendering via **KaTeX** (via `@streamdown/math`)
- Inline math: `$E = mc^2$`
- Block math: `$$...$$`
- Full support for mathematical notation

### ✅ Mermaid Diagrams

- Render Mermaid diagrams (via `@streamdown/mermaid`)
- Flowcharts, sequence diagrams, class diagrams, etc.
- Rendered as code blocks with a button to visualize

### ✅ CJK Language Support

- Built-in support for Chinese, Japanese, and Korean (via `@streamdown/cjk`)
- Correct emphasis markers with ideographic punctuation
- Critical for AI-generated content in these languages

### ✅ Streaming-Specific Features

#### Unterminated Block Parsing

Streamdown gracefully handles incomplete markdown that appears during streaming:

- `**This is bol` → Shows as partial bold text
- `[Click here` → Shows as partial link
- ` ```python` → Shows as partial code block
- `# Head` → Shows as partial heading

#### Progressive Formatting

- Content is styled as it streams in token-by-token
- Seamless transitions from incomplete to complete states
- Animated caret indicator during streaming

#### Security Features

- Built-in security hardening via `rehype-harden`
- Link safety: Validates URLs before navigation
- Image safety: Blocks unexpected origins
- Protection against prompt injection attacks

## Implementation

### Component: `MarkdownRenderer`

Location: `src/renderer/src/components/chat/MarkdownRenderer.tsx`

```tsx
<MarkdownRenderer
  content={textContent}
  isStreaming={isStreaming}
  className="text-base leading-relaxed"
/>
```

### Props

- **content** (string): The markdown content to render
- **isStreaming** (boolean): Whether content is currently streaming
- **className** (string): Additional CSS classes

### Plugins Enabled

All plugins are enabled by default:

- `@streamdown/code` - Code syntax highlighting
- `@streamdown/mermaid` - Mermaid diagram support
- `@streamdown/math` - LaTeX math rendering
- `@streamdown/cjk` - CJK language support

### Styling

Custom markdown styles are in `src/renderer/src/assets/main.css`:

- Typography and spacing
- Link hover effects with accent color
- Code block styling
- Table styling
- Blockquote styling
- Caret animation for streaming

## Dependencies

```json
{
  "streamdown": "^2.2.0",
  "@streamdown/code": "^1.0.2",
  "@streamdown/mermaid": "^1.0.2",
  "@streamdown/math": "^1.0.2",
  "@streamdown/cjk": "^1.0.2",
  "katex": "^0.16.28"
}
```

## Configuration

### Tailwind Integration

The `main.css` includes a `@source` directive for Tailwind to detect Streamdown's utility classes:

```css
@source "../../../node_modules/streamdown/dist/*.js";
```

### KaTeX Styles

KaTeX CSS is imported for math rendering:

```css
@import 'katex/dist/katex.min.css';
```

## Performance

- **Memoization**: Streamdown uses React.memo for efficient re-renders
- **Tree-shakeable**: Only plugins you use are included in the bundle
- **Streaming-optimized**: Handles rapid token updates efficiently
- **Progressive rendering**: Updates only changed portions

## Browser Support

Works in all modern browsers with:

- ES2020 support
- CSS custom properties
- Flexbox/Grid

## Example Usage in Chat

### User Message

Plain text, no markdown rendering

### Assistant Message

Full markdown rendering with:

- Streaming indicator when `isStreaming=true`
- Progressive formatting as content arrives
- All markdown features available

## Testing

To test the markdown renderer:

1. Start a chat session
2. Ask Claude to format responses with:
   - Code blocks
   - Mathematical equations
   - Lists and tables
   - Links and bold/italic text

Example prompts:

- "Explain quicksort with a code example in Python"
- "Show me the quadratic formula in LaTeX"
- "Create a table comparing React vs Vue"
- "Draw a flowchart using Mermaid syntax"

## Security Notes

Streamdown includes built-in security:

- Sanitizes HTML to prevent XSS
- Validates link URLs
- Blocks suspicious image sources
- Safe for untrusted markdown content

## Future Enhancements

Potential additions:

- Custom syntax highlighting themes
- More Mermaid diagram types
- Custom link safety modal
- Export markdown to PDF/HTML
- Syntax highlighting line numbers
- Code diff support
