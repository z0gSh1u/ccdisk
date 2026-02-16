# Settings 展平到主窗口 - 实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将 Settings 对话框展平为 Sidebar 底部 3 个按钮，点击后从右侧滑入侧边面板

**Architecture:** 创建 SidePanel 组件（遮罩+面板），更新 Sidebar 底部添加 3 个按钮，App.tsx 管理面板状态，删除旧的 SettingsDialog

**Tech Stack:** React 19, TypeScript, Tailwind CSS, Lucide React Icons

---

## 任务清单

- [ ] Task 1: 创建 SidePanel 组件基础结构
- [ ] Task 2: 实现 SidePanel 动画和响应式
- [ ] Task 3: 更新 Sidebar 底部按钮
- [ ] Task 4: 集成到 App.tsx
- [ ] Task 5: 删除 SettingsDialog
- [ ] Task 6: 类型检查和构建验证

---

## Task 1: 创建 SidePanel 组件基础结构

**Files:**

- Create: `src/renderer/src/components/SidePanel.tsx`

**Step 1: 创建 SidePanel 组件文件**

创建 `src/renderer/src/components/SidePanel.tsx`，包含基础结构：

```tsx
/**
 * SidePanel - Slide-in panel from right side for settings and configurations
 */

import { useEffect } from 'react';
import { X } from 'lucide-react';
import { ClaudeConfigEditor } from './settings/ClaudeConfigEditor';
import { MCPManager } from './extensions/MCPManager';
import { SkillsCommandsManager } from './settings/SkillsCommandsManager';

export type PanelType = 'skills' | 'mcp' | 'claude';

interface SidePanelProps {
  isOpen: boolean;
  panelType: PanelType | null;
  onClose: () => void;
}

const PANEL_TITLES: Record<PanelType, string> = {
  skills: 'Skills & Commands',
  mcp: 'MCP Servers',
  claude: 'Claude Configuration'
};

export function SidePanel({ isOpen, panelType, onClose }: SidePanelProps) {
  // ESC key handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, onClose]);

  if (!isOpen || !panelType) return null;

  return (
    <div className="fixed inset-0 z-50">
      {/* Overlay - blocks all interactions with content below */}
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />

      {/* Panel - slides in from right */}
      <div className="absolute right-0 top-0 bottom-0 w-[480px] bg-white shadow-2xl flex flex-col">
        {/* Header */}
        <div className="shrink-0 flex items-center justify-between p-4 border-b border-border-subtle">
          <h2 className="text-lg font-semibold text-text-primary">{PANEL_TITLES[panelType]}</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-bg-accent transition-colors" title="Close panel">
            <X className="h-5 w-5 text-text-tertiary" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {panelType === 'skills' && <SkillsCommandsManager />}
          {panelType === 'mcp' && <MCPManager />}
          {panelType === 'claude' && <ClaudeConfigEditor />}
        </div>
      </div>
    </div>
  );
}
```

**Step 2: 验证导入和类型**

运行类型检查确认导入正确：

```bash
pnpm typecheck:web
```

Expected: 无错误（所有导入的组件都已存在）

**Step 3: Commit**

```bash
git add src/renderer/src/components/SidePanel.tsx
git commit -m "feat: create SidePanel component base structure"
```

---

## Task 2: 实现 SidePanel 动画和响应式

**Files:**

- Modify: `src/renderer/src/components/SidePanel.tsx`

**Step 1: 添加滑入/滑出动画**

更新 SidePanel.tsx 的面板 div，添加 transform 动画：

```tsx
{/* Panel - slides in from right */}
<div
  className={`
    absolute right-0 top-0 bottom-0 w-[480px] bg-white shadow-2xl flex flex-col
    transform transition-transform duration-300 ease-in-out
    ${isOpen ? 'translate-x-0' : 'translate-x-full'}
  `}
>
```

同时更新容器 div，移除 `if (!isOpen || !panelType) return null`，改为始终渲染但控制可见性：

```tsx
return <div className={`fixed inset-0 z-50 ${isOpen ? 'block' : 'hidden'}`}>{/* ... */}</div>;
```

**Step 2: 添加响应式宽度**

更新面板宽度类名，支持不同屏幕尺寸：

```tsx
<div
  className={`
    absolute right-0 top-0 bottom-0
    w-[480px] max-[1200px]:w-[400px] max-[800px]:w-[calc(100vw-40px)]
    bg-white shadow-2xl flex flex-col
    transform transition-transform duration-300 ease-in-out
    ${isOpen ? 'translate-x-0' : 'translate-x-full'}
  `}
>
```

**Step 3: 添加遮罩淡入动画**

更新遮罩 div，添加透明度动画：

```tsx
{
  /* Overlay - blocks all interactions with content below */
}
<div
  className={`
    absolute inset-0 bg-black/30
    transition-opacity duration-300
    ${isOpen ? 'opacity-100' : 'opacity-0'}
  `}
  onClick={onClose}
/>;
```

**Step 4: 验证动画效果**

启动开发服务器，手动测试：

```bash
pnpm dev
```

Expected:

- 面板从右侧平滑滑入（300ms）
- 遮罩淡入
- 点击遮罩或 ESC 关闭时平滑滑出

**Step 5: Commit**

```bash
git add src/renderer/src/components/SidePanel.tsx
git commit -m "feat: add slide animation and responsive width to SidePanel"
```

---

## Task 3: 更新 Sidebar 底部按钮

**Files:**

- Modify: `src/renderer/src/components/Sidebar.tsx`

**Step 1: 更新 Sidebar 接口和导入**

在 `Sidebar.tsx` 顶部添加新的 props 接口：

```tsx
import { Terminal, Puzzle, Activity } from 'lucide-react'
import type { PanelType } from './SidePanel'

// 在 export function Sidebar() 之前添加
interface SidebarProps {
  activePanelType: PanelType | null
  onPanelTypeChange: (type: PanelType | null) => void
}

export function Sidebar({ activePanelType, onPanelTypeChange }: SidebarProps) {
```

**Step 2: 移除旧的 Settings 相关代码**

删除以下内容（在文件开头的 state 声明区域）：

```tsx
// 删除这行
const [isSettingsOpen, setIsSettingsOpen] = useState(false);
```

删除 SettingsDialog 导入（第 19 行）：

```tsx
// 删除这行
import { SettingsDialog } from './settings/SettingsDialog';
```

删除 Footer 区域的 Settings 按钮（223-232 行）和 SettingsDialog 渲染（259 行）。

**Step 3: 添加新的三个按钮**

在 Footer 区域（`{/* Footer profile/settings area */}`）替换为：

```tsx
{
  /* Footer - Settings Panels */
}
<div className="shrink-0 p-2 border-t border-border-subtle space-y-1">
  <button
    onClick={() => onPanelTypeChange(activePanelType === 'skills' ? null : 'skills')}
    className={`
      flex items-center gap-3 w-full px-3 py-2 rounded-lg transition-colors
      ${
        activePanelType === 'skills'
          ? 'bg-bg-accent text-text-primary border-l-2 border-accent'
          : 'text-text-secondary hover:bg-bg-accent'
      }
    `}
    title="Skills & Commands"
  >
    <Terminal className="h-5 w-5 text-text-tertiary" />
    <div className="text-sm font-medium">Skills & Commands</div>
  </button>

  <button
    onClick={() => onPanelTypeChange(activePanelType === 'mcp' ? null : 'mcp')}
    className={`
      flex items-center gap-3 w-full px-3 py-2 rounded-lg transition-colors
      ${
        activePanelType === 'mcp'
          ? 'bg-bg-accent text-text-primary border-l-2 border-accent'
          : 'text-text-secondary hover:bg-bg-accent'
      }
    `}
    title="MCP Servers"
  >
    <Puzzle className="h-5 w-5 text-text-tertiary" />
    <div className="text-sm font-medium">MCP Servers</div>
  </button>

  <button
    onClick={() => onPanelTypeChange(activePanelType === 'claude' ? null : 'claude')}
    className={`
      flex items-center gap-3 w-full px-3 py-2 rounded-lg transition-colors
      ${
        activePanelType === 'claude'
          ? 'bg-bg-accent text-text-primary border-l-2 border-accent'
          : 'text-text-secondary hover:bg-bg-accent'
      }
    `}
    title="Claude Configuration"
  >
    <Activity className="h-5 w-5 text-text-tertiary" />
    <div className="text-sm font-medium">Claude Config</div>
  </button>
</div>;
```

**Step 4: 移除 SettingsDialog 渲染**

删除文件末尾的（约 259 行）：

```tsx
{
  /* 删除整个 SettingsDialog 渲染 */
}
{
  /* Settings Dialog */
}
<SettingsDialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen} />;
```

**Step 5: 类型检查**

```bash
pnpm typecheck:web
```

Expected: Sidebar.tsx 编译错误（App.tsx 尚未传递 props），其他文件正常

**Step 6: Commit**

```bash
git add src/renderer/src/components/Sidebar.tsx
git commit -m "feat: replace Settings button with three panel buttons in Sidebar"
```

---

## Task 4: 集成到 App.tsx

**Files:**

- Modify: `src/renderer/src/App.tsx`

**Step 1: 添加导入和状态**

在 `App.tsx` 顶部添加导入：

```tsx
import { SidePanel, type PanelType } from './components/SidePanel';
```

在 `App` 组件内部添加状态（现有 state 之后）：

```tsx
const [activePanelType, setActivePanelType] = useState<PanelType | null>(null);
```

**Step 2: 更新 Sidebar 渲染，传递 props**

找到 `<Sidebar />` 渲染（约 100 行左右），更新为：

```tsx
<Sidebar activePanelType={activePanelType} onPanelTypeChange={setActivePanelType} />
```

**Step 3: 添加 SidePanel 渲染**

在 `App` 组件 return 的最外层 div 内，添加 SidePanel（在 MainLayout 之后）：

```tsx
return (
  <div className="flex h-screen bg-bg-primary overflow-hidden">
    <Sidebar activePanelType={activePanelType} onPanelTypeChange={setActivePanelType} />
    <MainLayout preview={showFilePreview ? <FilePreview /> : null}>
      <ChatInterface />
    </MainLayout>
    <SidePanel isOpen={activePanelType !== null} panelType={activePanelType} onClose={() => setActivePanelType(null)} />
  </div>
);
```

**Step 4: 类型检查**

```bash
pnpm typecheck:web
```

Expected: 所有类型错误消失

**Step 5: 手动测试**

启动开发服务器：

```bash
pnpm dev
```

测试流程：

1. 点击 "Skills & Commands" 按钮 → 面板从右侧滑入
2. 点击 "MCP Servers" 按钮 → 面板内容切换
3. 点击 "Claude Config" 按钮 → 面板内容切换
4. 点击遮罩 → 面板关闭
5. 打开面板，按 ESC → 面板关闭
6. 缩放窗口 → 面板宽度响应式变化

Expected: 所有交互正常工作

**Step 6: Commit**

```bash
git add src/renderer/src/App.tsx
git commit -m "feat: integrate SidePanel into App with state management"
```

---

## Task 5: 删除 SettingsDialog

**Files:**

- Delete: `src/renderer/src/components/settings/SettingsDialog.tsx`

**Step 1: 确认无其他引用**

搜索 SettingsDialog 的引用：

```bash
grep -r "SettingsDialog" src/renderer/src --exclude-dir=node_modules
```

Expected: 无结果（已在 Sidebar.tsx 中删除）

**Step 2: 删除文件**

```bash
rm src/renderer/src/components/settings/SettingsDialog.tsx
```

**Step 3: 类型检查**

```bash
pnpm typecheck
```

Expected: 无错误

**Step 4: Commit**

```bash
git add src/renderer/src/components/settings/SettingsDialog.tsx
git commit -m "chore: remove SettingsDialog component"
```

---

## Task 6: 类型检查和构建验证

**Files:**

- N/A (验证阶段)

**Step 1: 完整类型检查**

```bash
pnpm typecheck
```

Expected: 0 errors (both node and web)

**Step 2: Lint 检查**

```bash
pnpm lint
```

Expected: 只有预先存在的 145 个 lint 错误，无新增错误

**Step 3: 格式化代码**

```bash
pnpm format
```

**Step 4: 完整构建**

```bash
pnpm build:unpack
```

Expected: 构建成功，无错误

**Step 5: 手动端到端测试**

启动应用：

```bash
pnpm dev
```

测试场景：

1. ✅ Sidebar 底部显示三个按钮（Skills & Commands、MCP Servers、Claude Config）
2. ✅ 点击 Skills & Commands → 面板滑入，显示 Skills/Commands 内容
3. ✅ 点击 MCP Servers → 面板内容切换到 MCP
4. ✅ 点击 Claude Config → 面板内容切换到 Claude
5. ✅ 点击遮罩 → 面板关闭
6. ✅ 打开面板，按 ESC → 面板关闭
7. ✅ 点击已激活按钮 → 面板关闭
8. ✅ 缩放窗口到 < 1200px → 面板宽度变为 400px
9. ✅ 缩放窗口到 < 800px → 面板宽度变为 calc(100vw - 40px)
10. ✅ 面板打开时，Sidebar、Chat、FilePreview 不可交互
11. ✅ Skills/Commands 内部功能正常（创建、编辑、删除）
12. ✅ MCP 内部功能正常（配置编辑、live status、reconnect）
13. ✅ Claude Config 内部功能正常（环境变量编辑、保存）

**Step 6: 最终 commit**

如果格式化有变动：

```bash
git add -A
git commit -m "style: format code after settings flatten implementation"
```

---

## 验收标准

- ✅ Sidebar 底部有三个独立按钮（Skills、MCP、Claude）
- ✅ 点击按钮从右侧滑入 480px 面板（带动画）
- ✅ 面板显示对应的配置组件（复用现有组件）
- ✅ 全屏遮罩阻止底层交互
- ✅ 点击遮罩或 ESC 关闭面板
- ✅ 点击另一个按钮切换面板内容
- ✅ 响应式宽度适配（480px → 400px → calc(100vw - 40px)）
- ✅ 旧的 SettingsDialog 已删除
- ✅ Typecheck 通过（0 errors）
- ✅ Build 通过（pnpm build:unpack）
- ✅ 无新增 lint 错误

---

## 技术注意事项

### 1. PanelType 导出

`PanelType` 在 `SidePanel.tsx` 中定义并导出，供 `Sidebar.tsx` 和 `App.tsx` 使用。

### 2. 动画时序

- 面板滑入/滑出：300ms `ease-in-out`
- 遮罩淡入/淡出：300ms
- 使用 CSS `transition` 而非 Framer Motion（保持简单）

### 3. z-index 层级

- SidePanel 容器：`z-50`
- 遮罩：`absolute inset-0`（覆盖整个屏幕）
- 面板：`absolute right-0`（高于遮罩）

### 4. 焦点管理

当前实现依赖点击遮罩和 ESC 键关闭，未实现焦点陷阱（focus trap）。如果需要完整的可访问性支持，可以在后续添加 focus-trap-react。

### 5. 组件复用

三个配置组件（`ClaudeConfigEditor`、`MCPManager`、`SkillsCommandsManager`）直接复用，无需任何修改。它们原本为 Dialog 设计，现在嵌入 SidePanel 同样适用。

---

## 可选增强（未包含在此计划中）

1. **状态指示器** - 按钮右侧显示连接状态点、服务器数量
2. **键盘快捷键** - Cmd+1/2/3 快速打开面板
3. **Claude 连接状态** - ClaudeConfigEditor 顶部显示 SDK session ID
4. **Toast 通知** - 配置保存成功后显示 toast
5. **动画增强** - 面板内容淡入动画

这些可以在基础功能完成后单独实现。
