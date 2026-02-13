/**
 * FileTree - Displays workspace file structure using react-arborist
 */

import { Tree } from 'react-arborist'
import { FolderIcon, ChevronRight, ChevronDown } from 'lucide-react'
import { getClassWithColor } from 'file-icons-js'

import { useWorkspaceStore } from '../../stores/workspace-store'

import type { FileNode } from '../../../../shared/types'
import './FileTree.css'

interface TreeNode {
  id: string
  name: string
  children?: TreeNode[]
  type: 'file' | 'directory'
  path: string
}

// Convert FileNode[] to TreeNode[] format for react-arborist
function convertToTreeNodes(nodes: FileNode[]): TreeNode[] {
  return nodes.map((node) => ({
    id: node.path,
    name: node.name,
    type: node.type,
    path: node.path,
    children: node.children ? convertToTreeNodes(node.children) : undefined
  }))
}

// Get file icon CSS class from file-icons-js (returns e.g. "js-icon medium-yellow")
function getFileIconClass(filename: string): string {
  return getClassWithColor(filename) || 'default-icon'
}

function NodeRenderer({ node, style, dragHandle }: any) {
  const data = node.data as TreeNode
  const isSelected = node.isSelected

  return (
    <div
      ref={dragHandle}
      style={style}
      className={`tree-node flex items-center gap-2 px-4 py-1.5 cursor-pointer hover:bg-gray-100 transition-colors ${
        isSelected ? 'bg-accent bg-opacity-10 text-accent' : 'text-text-primary'
      }`}
      onClick={() => node.toggle()}
    >
      {/* Expand/Collapse arrow for directories */}
      {data.type === 'directory' && (
        <span className="flex-shrink-0">
          {node.isOpen ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </span>
      )}

      {/* File/Folder Icon */}
      {data.type === 'directory' ? (
        <FolderIcon className="h-4 w-4 flex-shrink-0 text-yellow-500" />
      ) : (
        <span
          className={`icon ${getFileIconClass(data.name)}`}
          style={{ fontSize: '16px', width: '16px', height: '16px', flexShrink: 0 }}
        />
      )}

      {/* Name */}
      <span className="truncate flex-1 text-sm">{data.name}</span>
    </div>
  )
}

interface FileTreeProps {
  onFileSelect?: (path: string) => void
}

export function FileTree({ onFileSelect }: FileTreeProps) {
  const fileTree = useWorkspaceStore((state) => state.fileTree)
  const isLoading = useWorkspaceStore((state) => state.isLoading)
  const selectFile = useWorkspaceStore((state) => state.selectFile)

  const treeData = convertToTreeNodes(fileTree)

  const handleSelect = (nodes: any[]) => {
    if (nodes.length > 0) {
      const selectedNode = nodes[0].data as TreeNode
      if (selectedNode.type === 'file') {
        selectFile(selectedNode.path)
        onFileSelect?.(selectedNode.path)
      }
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-4 text-text-tertiary">
        <div className="animate-spin h-5 w-5 border-2 border-current border-t-transparent rounded-full" />
      </div>
    )
  }

  if (treeData.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center text-text-tertiary">
        <FolderIcon className="h-12 w-12 mb-2 opacity-50" />
        <p className="text-sm">No files in workspace</p>
      </div>
    )
  }

  return (
    <div className="file-tree-container h-full">
      <Tree
        data={treeData}
        openByDefault={false}
        width="100%"
        height={600}
        indent={20}
        rowHeight={32}
        onSelect={handleSelect}
      >
        {NodeRenderer}
      </Tree>
    </div>
  )
}
