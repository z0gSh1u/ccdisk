# Settings 展平到主窗口 - 设计文档

**日期：** 2026-02-13  
**状态：** 已批准  
**目标：** 将 Settings 对话框展平，提高 MCP、Skills/Commands、Claude Config 的可访问性

---

## 问题背景

当前 Settings 功能隐藏在三标签页对话框中：

- 用户需要点击 Sidebar 底部 Settings 按钮，再选择标签页
- MCP 和 Skills/Commands 功能非常重要，但访问路径过深
- Claude 配置和状态不够直观

## 设计目标

1. **提高可访问性** - 一键访问 Skills、MCP、Claude 配置
2. **保持一致性** - 统一使用侧边面板交互模式
3. **节省空间** - 侧边面板覆盖主内容，不占用额外空间
4. **保持专注** - 全屏遮罩阻止底层交互

---

## 整体架构

### 组件层级

```
App.tsx
├── Sidebar.tsx (左侧)
│   └── Footer: 3 buttons
│       ├── Skills & Commands
│       ├── MCP Servers
│       └── Claude Config
├── MainLayout.tsx (中间 + 右侧)
│   ├── ChatInterface
│   └── FilePreview
└── SidePanel.tsx (覆盖层，右侧滑入)
    ├── Overlay (全屏遮罩)
    └── Panel (480px 宽)
        └── {当前激活的配置组件}
```

### 状态管理

在 `App.tsx` 添加本地 state：

```typescript
const [activePanelType, setActivePanelType] = useState<'skills' | 'mcp' | 'claude' | null>(null)
```

传递给 `Sidebar` 和 `SidePanel` 组件。

未来如果其他组件也需要控制面板，迁移到 Zustand store。

---

## 详细设计

### 1. Sidebar 底部按钮

**三个按钮配置：**

| 顺序 | ID       | 图标                  | 标签              | 描述            |
| ---- | -------- | --------------------- | ----------------- | --------------- |
| 1    | `skills` | `Terminal` 或 `Wand2` | Skills & Commands | 最常用功能      |
| 2    | `mcp`    | `Puzzle`              | MCP Servers       | MCP 配置和状态  |
| 3    | `claude` | `Activity` 或 `Bot`   | Claude Config     | Claude 连接配置 |

**UI 规格：**

- 纵向排列（vertical stack）
- 每个按钮高度：`40-44px`
- 左对齐，`flex items-center gap-3`
- 激活状态：`bg-bg-accent` + `border-l-2 border-accent`（左侧蓝色边框）
- 悬停状态：`hover:bg-bg-accent`
- 显示图标 + 文字标签

**可选增强（状态指示器）：**

- Claude 按钮：右侧显示连接状态点（绿色/灰色）
- MCP 按钮：右侧显示启用服务器数量（如 "3/5"）

**实现位置：**
`src/renderer/src/components/Sidebar.tsx` 的 Footer 区域（223-232 行）

---

### 2. SidePanel 组件

**组件 API：**

```tsx
interface SidePanelProps {
  isOpen: boolean
  panelType: 'skills' | 'mcp' | 'claude' | null
  onClose: () => void
}

export function SidePanel({ isOpen, panelType, onClose }: SidePanelProps)
```

**结构：**

```tsx
<div className={`fixed inset-0 z-50 ${isOpen ? 'block' : 'hidden'}`}>
  {/* 遮罩层 - 全屏覆盖，阻止底层交互 */}
  <div className="absolute inset-0 bg-black/30" onClick={onClose} />

  {/* 面板 - 从右侧滑入 */}
  <div
    className={`
    absolute right-0 top-0 bottom-0 w-[480px]
    bg-white shadow-2xl
    transform transition-transform duration-300 ease-in-out
    ${isOpen ? 'translate-x-0' : 'translate-x-full'}
  `}
  >
    {/* Header */}
    <div className="flex items-center justify-between p-4 border-b">
      <h2 className="text-lg font-semibold">{title}</h2>
      <button onClick={onClose}>
        <X className="h-5 w-5" />
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
```

**样式规格：**

- 宽度：`480px`（≥1200px）、`400px`（800-1200px）、`calc(100vw - 40px)`（<800px）
- 位置：`fixed right-0 top-0 bottom-0`
- 动画：`transition-transform duration-300 ease-in-out`
  - 关闭：`translate-x-full`
  - 打开：`translate-x-0`
- 遮罩：`bg-black/30`，`pointer-events: auto`（阻止底层交互）
- 面板：`bg-white shadow-2xl`
- z-index：`50`

**关闭方式：**

1. 点击遮罩
2. 点击右上角 X 按钮
3. 按 ESC 键（使用 `useEffect` 监听 `keydown` 事件）
4. 点击底部其他按钮时自动切换

**新建文件：**
`src/renderer/src/components/SidePanel.tsx`

---

### 3. 配置组件适配

**现有组件直接复用，无需修改：**

1. **SkillsCommandsManager.tsx**（827 行）
   - 当前在 Dialog 中使用，已经是独立组件
   - 内部的创建对话框（`isCreateDialogOpen`）保持不变

2. **MCPManager.tsx**
   - 当前在 Dialog 中使用
   - Live status 刷新逻辑保持不变
   - 内部的 ServerEditor 对话框保持不变

3. **ClaudeConfigEditor.tsx**
   - 当前在 Dialog 中使用
   - **可选增强：** 顶部添加连接状态卡片
   ```tsx
   <StatusCard className="mb-4">
     <div className="text-sm">
       <div>当前会话：{currentSession?.name || '无'}</div>
       <div>SDK Session ID：{currentSession?.sdkSessionId || '未连接'}</div>
     </div>
   </StatusCard>
   ```

---

### 4. App.tsx 集成

**状态和事件处理：**

```tsx
// App.tsx
const [activePanelType, setActivePanelType] = useState<'skills' | 'mcp' | 'claude' | null>(null)

return (
  <div>
    <Sidebar activePanelType={activePanelType} onPanelTypeChange={setActivePanelType} />
    <MainLayout>
      <ChatInterface />
      <FilePreview />
    </MainLayout>
    <SidePanel
      isOpen={activePanelType !== null}
      panelType={activePanelType}
      onClose={() => setActivePanelType(null)}
    />
  </div>
)
```

**Sidebar 接收 props：**

```tsx
interface SidebarProps {
  activePanelType: 'skills' | 'mcp' | 'claude' | null
  onPanelTypeChange: (type: 'skills' | 'mcp' | 'claude' | null) => void
}
```

---

### 5. 移除旧代码

**删除以下内容：**

1. `src/renderer/src/components/settings/SettingsDialog.tsx`（三标签页对话框）
2. Sidebar 中的 `isSettingsOpen` state 和 Settings 按钮
3. Sidebar 中的 `<SettingsDialog open={isSettingsOpen} ... />` 渲染

**保留以下组件：**

- `ClaudeConfigEditor.tsx`
- `MCPManager.tsx`
- `SkillsCommandsManager.tsx`

---

## 错误处理和边界情况

### 1. 面板打开时的交互

- **全屏遮罩** 覆盖整个页面（包括 Sidebar、Chat、FilePreview）
- 遮罩设置 `pointer-events: auto`，阻止所有底层交互
- 只有面板内容可以交互
- 点击遮罩任意位置关闭面板

### 2. 响应式处理

| 窗口宽度   | 面板宽度             | 备注          |
| ---------- | -------------------- | ------------- |
| ≥ 1200px   | `480px`              | 标准桌面      |
| 800-1200px | `400px`              | 小屏桌面      |
| < 800px    | `calc(100vw - 40px)` | 移动端/小窗口 |

### 3. 配置保存反馈

- **成功：** Toast 通知（右上角 3 秒）+ 面板保持打开
- **失败：** 错误提示（面板内顶部）+ 保持编辑状态
- 使用现有的 toast 系统（如果没有，可以用 Radix UI Toast）

### 4. 数据加载状态

- 打开面板时，如果数据加载中，显示 loading spinner（居中）
- **Skills：** 读取文件系统时加载
- **MCP：** 获取 live status 时加载
- **Claude：** 读取 `~/.claude/settings.json` 时加载
- 加载失败：显示错误消息 + "重试" 按钮

### 5. 键盘快捷键（可选增强）

| 快捷键         | 功能                        |
| -------------- | --------------------------- |
| `Cmd/Ctrl + 1` | 打开 Skills & Commands 面板 |
| `Cmd/Ctrl + 2` | 打开 MCP Servers 面板       |
| `Cmd/Ctrl + 3` | 打开 Claude Config 面板     |
| `ESC`          | 关闭当前面板                |

实现方式：在 `App.tsx` 或 `SidePanel.tsx` 中使用 `useEffect` 监听 `keydown` 事件。

---

## 实现任务清单

### Task 1: 创建 SidePanel 组件

- [ ] 创建 `src/renderer/src/components/SidePanel.tsx`
- [ ] 实现遮罩 + 面板结构
- [ ] 实现滑入/滑出动画
- [ ] 实现 ESC 键关闭
- [ ] 实现响应式宽度
- [ ] 根据 `panelType` 渲染对应组件

### Task 2: 更新 Sidebar 底部

- [ ] 移除 Settings 按钮和 state
- [ ] 添加三个新按钮（Skills、MCP、Claude）
- [ ] 接收 `activePanelType` 和 `onPanelTypeChange` props
- [ ] 实现按钮激活状态样式
- [ ] （可选）添加状态指示器

### Task 3: 更新 App.tsx

- [ ] 添加 `activePanelType` state
- [ ] 传递给 Sidebar 和 SidePanel
- [ ] 渲染 SidePanel 组件
- [ ] （可选）实现键盘快捷键

### Task 4: 删除旧代码

- [ ] 删除 `SettingsDialog.tsx`
- [ ] 从 Sidebar 中移除 SettingsDialog 引用

### Task 5: 可选增强

- [ ] Claude Config 顶部添加连接状态卡片
- [ ] 按钮上添加状态指示器
- [ ] 实现键盘快捷键
- [ ] 添加 Toast 通知系统（如果没有）

### Task 6: 测试和验证

- [ ] 测试三个面板切换流程
- [ ] 测试遮罩点击关闭
- [ ] 测试 ESC 键关闭
- [ ] 测试响应式布局（窗口缩放）
- [ ] 测试配置保存/加载
- [ ] 测试底层交互被阻止
- [ ] Typecheck 通过
- [ ] Build 通过

---

## 验收标准

1. ✅ Sidebar 底部有三个独立按钮（Skills、MCP、Claude）
2. ✅ 点击按钮从右侧滑入 480px 面板
3. ✅ 面板显示对应的配置组件
4. ✅ 全屏遮罩阻止底层交互
5. ✅ 点击遮罩或 ESC 关闭面板
6. ✅ 点击另一个按钮切换面板内容
7. ✅ 响应式宽度适配不同屏幕
8. ✅ 配置保存成功有反馈
9. ✅ Typecheck 和 build 通过
10. ✅ （可选）键盘快捷键工作

---

## 技术决策

### 为什么不使用 Radix Dialog？

- Dialog 组件默认居中显示，侧边滑入需要大量覆盖样式
- 自定义实现更简单、性能更好、代码更少
- 仍然保留可访问性特性（ESC 关闭、焦点管理）

### 为什么在 App.tsx 而不是 store？

- 面板状态是纯 UI 状态，不需要跨组件共享
- 如果未来其他组件需要打开面板，再迁移到 Zustand store
- 保持简单优先（YAGNI）

### 为什么覆盖而不是推开主内容？

- 覆盖模式不需要调整主内容布局，实现更简单
- 保持类似模态对话框的交互模式，用户熟悉
- 避免主内容区域频繁重排（性能更好）

---

## 未来改进

1. **动画增强** - 面板打开时内容淡入动画
2. **多面板历史** - 记住上次打开的面板，下次直接打开
3. **拖拽调整宽度** - 允许用户拖拽面板边缘调整宽度
4. **快速切换** - 面板内顶部添加标签页，快速切换三个配置
5. **搜索功能** - Skills/Commands 面板添加搜索框

---

**设计批准：** ✅  
**准备实施：** 待确认
