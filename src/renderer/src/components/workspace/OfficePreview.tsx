/**
 * OfficePreview - Renders Word, Excel, and PPT files
 */

import { useEffect, useState } from 'react'

interface OfficePreviewProps {
  content: string // base64 encoded
  mimeType: string
  fileName: string
}

export function OfficePreview({
  content,
  mimeType,
  fileName
}: OfficePreviewProps): React.ReactElement {
  const [html, setHtml] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function convert(): Promise<void> {
      setIsLoading(true)
      setError(null)

      try {
        // Decode base64 to ArrayBuffer
        const binary = atob(content)
        const bytes = new Uint8Array(binary.length)
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i)
        }
        const buffer = bytes.buffer

        if (mimeType.includes('wordprocessingml') || fileName.endsWith('.docx')) {
          // Word document
          const mammoth = await import('mammoth')
          const result = await mammoth.convertToHtml({ arrayBuffer: buffer })
          if (!cancelled) setHtml(result.value)
        } else if (
          mimeType.includes('spreadsheetml') ||
          mimeType.includes('ms-excel') ||
          fileName.endsWith('.xlsx') ||
          fileName.endsWith('.xls') ||
          fileName.endsWith('.csv')
        ) {
          // Excel document
          const XLSX = await import('xlsx')
          const workbook = XLSX.read(buffer, { type: 'array' })
          const firstSheet = workbook.SheetNames[0]
          const worksheet = workbook.Sheets[firstSheet]
          const htmlTable = XLSX.utils.sheet_to_html(worksheet)
          if (!cancelled) {
            const sheetTabs =
              workbook.SheetNames.length > 1
                ? `<div style="margin-bottom:8px;display:flex;gap:4px">${workbook.SheetNames.map(
                    (name) =>
                      `<span style="padding:4px 12px;border-radius:4px;background:${name === firstSheet ? '#e0e7ff' : '#f3f4f6'};font-size:12px;cursor:pointer">${name}</span>`
                  ).join('')}</div>`
                : ''
            setHtml(sheetTabs + htmlTable)
          }
        } else if (mimeType.includes('presentationml') || fileName.endsWith('.pptx')) {
          if (!cancelled) {
            setHtml(
              '<div style="padding:20px;text-align:center;color:#666"><p>PowerPoint preview is limited to basic text extraction.</p><p>Open the file externally for full rendering.</p></div>'
            )
          }
        } else {
          if (!cancelled) setError('Unsupported office format')
        }
      } catch (err) {
        if (!cancelled) {
          console.error('Office preview error:', err)
          setError(`Failed to render: ${(err as Error).message}`)
        }
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    convert()
    return () => {
      cancelled = true
    }
  }, [content, mimeType, fileName])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-text-tertiary">
        <div className="animate-spin h-6 w-6 border-2 border-current border-t-transparent rounded-full" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full text-red-500 text-sm">{error}</div>
    )
  }

  return (
    <div
      className="h-full overflow-auto p-4 prose prose-sm max-w-none"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
