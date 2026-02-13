/**
 * FilePreview - Main container that routes to the appropriate renderer
 */

import { useWorkspaceStore } from '../../stores/workspace-store'
import { CodePreview } from './CodePreview'
import { OfficePreview } from './OfficePreview'
import { MarkdownRenderer } from '../chat/MarkdownRenderer'
import { X } from 'lucide-react'

export function FilePreview(): React.ReactElement | null {
  const { selectedFile, fileContent, isLoadingFile, clearFileContent } = useWorkspaceStore()

  if (!selectedFile) return null

  if (isLoadingFile) {
    return (
      <div className="h-full flex items-center justify-center bg-white border-l border-border-subtle">
        <div className="animate-spin h-6 w-6 border-2 border-accent border-t-transparent rounded-full" />
      </div>
    )
  }

  if (!fileContent) {
    return (
      <div className="h-full flex items-center justify-center bg-white border-l border-border-subtle text-text-tertiary text-sm">
        Failed to load file
      </div>
    )
  }

  const fileName = selectedFile.split('/').pop() || selectedFile
  const { content, mimeType, encoding } = fileContent

  const getPreviewComponent = (): React.ReactNode => {
    // Markdown
    if (mimeType === 'text/markdown') {
      return (
        <div className="h-full overflow-auto p-6 prose prose-sm max-w-none">
          <MarkdownRenderer content={content} />
        </div>
      )
    }

    // Images
    if (mimeType.startsWith('image/')) {
      const src =
        encoding === 'base64'
          ? `data:${mimeType};base64,${content}`
          : `data:${mimeType};utf8,${encodeURIComponent(content)}`
      return (
        <div className="h-full flex items-center justify-center p-4 bg-gray-50">
          <img
            src={src}
            alt={fileName}
            className="max-w-full max-h-full object-contain rounded shadow-sm"
          />
        </div>
      )
    }

    // PDF
    if (mimeType === 'application/pdf') {
      const pdfUrl = `data:application/pdf;base64,${content}`
      return (
        <div className="h-full">
          <iframe src={pdfUrl} className="w-full h-full border-0" title={fileName} />
        </div>
      )
    }

    // Office documents
    if (
      mimeType.includes('officedocument') ||
      mimeType.includes('ms-excel') ||
      mimeType.includes('ms-powerpoint')
    ) {
      return <OfficePreview content={content} mimeType={mimeType} fileName={fileName} />
    }

    // CSV
    if (mimeType === 'text/csv') {
      const base64 = btoa(content)
      return <OfficePreview content={base64} mimeType={mimeType} fileName={fileName} />
    }

    // Code and text files (default)
    return <CodePreview content={content} fileName={fileName} />
  }

  return (
    <div className="h-full flex flex-col bg-white border-l border-border-subtle">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border-subtle bg-bg-secondary">
        <div className="text-sm font-medium text-text-primary truncate">{fileName}</div>
        <button
          onClick={clearFileContent}
          className="p-1 rounded hover:bg-bg-accent transition-colors"
          title="Close preview"
        >
          <X className="h-4 w-4 text-text-tertiary" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">{getPreviewComponent()}</div>
    </div>
  )
}
