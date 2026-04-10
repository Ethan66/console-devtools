# Console DevTools Chrome 扩展设计文档

**创建日期**: 2025-04-10
**作者**: Claude
**状态**: 设计阶段

---

## 1. 项目概述

### 1.1 目标

开发一个 Chrome 扩展程序，在开发者工具的控制台中显示一个独立面板，用于接收、过滤和展示通过 postMessage 发送的嵌套日志数据。

### 1.2 核心功能

- 接收页面通过 postMessage 发送的嵌套日志数据
- 树形选择输入框，支持关键字筛选和节点选择
- 树形日志展示，保持嵌套结构
- 复制 path 值功能
- 导出 JSON 功能
- 清空树结构功能

---

## 2. 整体架构

### 2.1 扩展程序结构

```
console-devtools/
├── manifest.json              # 扩展配置
├── background.js              # 后台服务，消息中转
├── content/
│   └── message-listener.js    # 内容脚本，监听 postMessage
├── panel/
│   ├── index.html             # 面板入口
│   ├── App.vue                # 主组件
│   ├── main.ts                # 入口文件
│   ├── components/            # 组件目录
│   │   ├── TreeSelect.vue     # 树形选择输入框
│   │   ├── LogTree.vue        # 日志树形展示
│   │   └── LogNode.vue        # 单个日志节点
│   ├── composables/           # 组合式函数
│   │   ├── useMessage.ts      # 消息处理
│   │   ├── useFilter.ts       # 过滤逻辑
│   │   └── useTree.ts         # 树形数据处理
│   └── types/
│       └── index.ts           # 类型定义
├── package.json
├── tsconfig.json
├── vite.config.ts
└── icons/
```

### 2.2 组件职责

| 组件 | 职责 |
|------|------|
| **Content Script** | 注入到网页中，监听页面的 postMessage，转发给 Background |
| **Background Script** | 维护 DevTools Panel 连接，作为 Content 和 Panel 的消息中转站 |
| **DevTools Panel** | 独立的面板页面，包含输入框、树形日志展示区 |

### 2.3 消息流

```
网页 → postMessage → Content Script → Background → Panel → 渲染显示
```

---

## 3. 数据结构

### 3.1 核心数据类型

```typescript
// 单条消息数据结构
interface LogMessage {
  params: any;
  path: string;
  zfn: Record<string, LogMessage>;
}

// 扁平化的树节点（用于下拉选项）
interface TreeNode {
  id: string;               // 唯一标识：如 "handleGetPage" 或 "handleSetEnjoyData.setCardName"
  key: string;              // 原始 key 名称，也是显示文本
  path: string;             // 源码路径
  level: number;            // 层级深度
  parentId?: string;        // 父节点 id
  children?: TreeNode[];    // 子节点
  originalData: LogMessage; // 原始数据
}

// 面板状态
interface PanelState {
  messages: LogMessage[];       // 所有接收到的消息
  filteredMessages: LogMessage[]; // 过滤后的消息
  selectedKey: string | null;   // 当前选中的节点 id
  filterKeyword: string;        // 过滤关键字
  treeNodes: TreeNode[];        // 下拉选项树
}
```

### 3.2 唯一标识生成规则

| 场景 | id 示例 |
|------|---------|
| root 层级的 key | `handleGetPage` |
| 嵌套一层 | `handleSetEnjoyData.setCardName` |
| 更深嵌套 | `root.handleGetPage.[computed] reqPageType` |

---

## 4. UI 设计

### 4.1 面板布局

```
┌─────────────────────────────────────────────┐
│  Console DevTools                    标题区  │
├─────────────────────────────────────────────┤
│                                              │
│  [选择或输入关键字▼.......] [清空树结构] [导出JSON]│  ← 控制区
│     ↓ 树形下拉选项                            │
│     ▼ root (顶层)                            │
│       ▼ handleGetPage                        │
│         [computed] reqPageType               │
│       [watch] showDialog                     │
│       [computed] mainDianPageCode            │
│       ▼ handleSetEnjoyData                   │
│         setCardName                          │
│                                              │
├─────────────────────────────────────────────┤
│                                             │
│  ▼ handleGetPage                            │  ← 结果展示区
│    path: src/pages/borrow/mixins/... [复制] │
│    params: {}                               │
│    zfn:                                     │
│      ▼ [computed] reqPageType               │
│        path: src/pages/borrow/mixins/...    │
│                                             │
└─────────────────────────────────────────────┘
```

### 4.2 控制区组件

| 组件 | 功能 |
|------|------|
| **树形选择输入框** | 输入关键字实时筛选，点击下拉显示树形选项，支持键盘导航 |
| **清空树结构按钮** | 清空 `PanelState.messages` 数组 |
| **导出 JSON 按钮** | 导出当前过滤结果为 JSON 文件 |

### 4.3 下拉选项交互

- **树形结构**：显示所有 key 的层级关系
- **可展开折叠**：点击父节点可展开/折叠子节点
- **实时筛选**：输入关键字后，树形结构自动过滤匹配的节点（匹配 key）
- **支持选择**：点击任意节点，筛选显示该节点的完整数据
- **支持键盘**：上下键导航，左右键展开/折叠，回车选择

### 4.4 日志展示区

- **树形展示**：保持嵌套结构
- **展开折叠**：每个节点可展开/折叠
- **复制按钮**：path 右侧的复制按钮，点击复制 path 值
- **高亮匹配**：当前选中的 key 高亮显示

---

## 5. 功能实现

### 5.1 消息处理流程

```
1. Content Script 监听 postMessage
   ↓
2. 收到消息后，通过 chrome.runtime.sendMessage 发送给 Background
   ↓
3. Background 转发给当前活跃的 DevTools Panel
   ↓
4. Panel 接收消息，添加到 messages 数组
   ↓
5. 自动构建/更新树形节点数据
   ↓
6. 如果有过滤条件，实时更新 filteredMessages
   ↓
7. 重新渲染树形日志展示区
```

### 5.2 过滤逻辑

- **输入关键字**：匹配节点的 `key`（显示文本），实时筛选树形下拉选项和日志展示
- **选择节点**：根据选中的节点 `id`，显示该节点及其所有子节点的数据
- **清空输入框**：手动删除或清空输入框内容，显示所有消息

### 5.3 复制功能

- 点击 path 旁的复制按钮，将 path 值复制到剪贴板
- 使用 `navigator.clipboard.writeText()` API
- 复制成功后显示短暂提示

### 5.4 导出 JSON

- 将当前 `filteredMessages` 导出为 JSON 文件
- 使用 `URL.createObjectURL()` + `<a>` 标签下载
- 文件名带时间戳：`console-devtools-20250410-153045.json`

### 5.5 清空树结构

- 清空 `PanelState.messages` 数组
- 同时清空 `filteredMessages` 和 `treeNodes`
- 面板显示空状态提示

---

## 6. 错误处理与边界情况

### 6.1 消息传递错误

| 场景 | 处理方式 |
|------|----------|
| Panel 未打开时收到消息 | Background 暂存消息（最多 100 条），Panel 打开后发送 |
| Panel 断开连接 | Content Script 继续监听，重连后恢复 |
| 消息格式错误 | 在 Console 中输出错误日志，忽略该消息 |

### 6.2 数据处理边界

| 场景 | 处理方式 |
|------|----------|
| 空消息或 null | 显示提示"暂无日志数据" |
| 消息量过大（>1000条） | 显示性能警告，建议清空 |
| 嵌套层级过深（>10层） | 限制展示深度，避免渲染卡顿 |
| params 为大对象 | 默认折叠，点击展开查看详情 |

### 6.3 用户操作

| 场景 | 处理方式 |
|------|----------|
| 复制失败（权限问题） | 显示错误提示"复制失败，请手动复制" |
| 导出时无数据 | 显示提示"暂无数据可导出" |
| 输入框输入不存在的 key | 显示"未找到匹配的节点" |

---

## 7. 技术栈

### 7.1 前端框架

- **Vue 3** + Composition API
- **TypeScript** 提供类型安全
- **Vite** 作为构建工具

### 7.2 Chrome 扩展依赖

- `chrome.runtime.*` API 用于扩展通信
- `chrome.devtools.*` API 用于面板创建
- 无需额外依赖库

---

## 8. 开发工作流程

### 8.1 阶段划分

1. **基础框架搭建**
   - manifest.json 配置
   - Background Script 消息中转
   - Content Script 监听 postMessage
   - Panel 基础页面

2. **UI 组件开发**
   - TreeSelect 组件
   - LogTree 组件
   - LogNode 组件

3. **核心逻辑实现**
   - useMessage 消息处理
   - useFilter 过滤逻辑
   - useTree 树形数据构建

4. **功能完善**
   - 复制功能
   - 导出 JSON 功能
   - 清空树结构功能
   - 错误处理

5. **测试与优化**
   - 功能测试
   - 性能优化
   - 边界情况处理

### 8.2 测试策略

#### 功能测试
- 消息接收正确性
- 过滤功能准确性
- 树形展示交互
- 复制功能可用性
- 导出功能格式正确

#### 边界测试
- 大量消息（500+ 条）性能
- 深层嵌套（10+ 层）渲染
- 异常消息格式容错
- Panel 打开/关闭状态保持

#### 手动测试流程
1. 在测试页面中注入脚本发送 postMessage
2. 打开 DevTools，切换到 Console DevTools 面板
3. 验证消息正确显示
4. 测试过滤、复制、导出等功能

---

## 9. Chrome 扩展配置要点

### 9.1 manifest.json

```json
{
  "name": "Console DevTools",
  "version": "1.0.0",
  "manifest_version": 3,
  "description": "树形日志过滤和展示工具",
  "devtools_page": "panel/devtools.html",
  "background": {
    "service_worker": "background.js"
  },
  "permissions": [
    "activeTab",
    "scripting"
  ],
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": ["content/message-listener.js"],
      "run_at": "document_start"
    }
  ]
}
```

### 9.2 DevTools Panel 创建

在 `panel/devtools.html` 中创建面板：

```html
<script>
chrome.devtools.panels.create(
  'Console DevTools',
  'icons/icon.png',
  'panel/index.html',
  function(panel) {
    // 面板创建成功回调
  }
);
</script>
```

---

## 10. 总结

本设计文档描述了一个 Chrome 扩展程序，用于在开发者工具中接收、过滤和展示嵌套的日志数据。核心特性包括：

1. 通过 postMessage 接收嵌套日志数据
2. 树形选择输入框，支持关键字筛选
3. 完整的树形日志展示
4. 复制、导出、清空等实用功能
5. 良好的错误处理和边界情况处理

下一步将进入实现计划阶段，基于本设计创建详细的开发任务。
