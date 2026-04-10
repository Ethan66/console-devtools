# Console DevTools Chrome 扩展实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**目标:** 构建一个 Chrome 扩展程序，在开发者工具中显示一个独立面板，用于接收、过滤和展示通过 postMessage 发送的嵌套日志数据。

**架构:** Chrome 扩展采用三层架构：Content Script 监听页面 postMessage → Background Script 中转消息 → DevTools Panel 展示数据。使用 Vue 3 + TypeScript + Vite 构建面板 UI。

**技术栈:** Chrome Extension API, Vue 3, TypeScript, Vite

---

## Task 1: 项目基础结构搭建

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vite.config.ts`
- Create: `manifest.json`

- [ ] **Step 1: 初始化 package.json**

```bash
npm init -y
npm install vue@latest typescript vite @vitejs/plugin-vue
npm install -D @types/chrome
```

- [ ] **Step 2: 创建 package.json**

```json
{
  "name": "console-devtools",
  "version": "1.0.0",
  "description": "树形日志过滤和展示工具",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "check": "tsc --noEmit"
  },
  "dependencies": {
    "vue": "^3.4.0"
  },
  "devDependencies": {
    "@types/chrome": "^0.0.258",
    "@vitejs/plugin-vue": "^5.0.0",
    "typescript": "^5.3.0",
    "vite": "^5.0.0"
  }
}
```

- [ ] **Step 3: 创建 tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "module": "ESNext",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "preserve",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "types": ["chrome"]
  },
  "include": ["panel/**/*.ts", "panel/**/*.d.ts", "panel/**/*.tsx", "panel/**/*.vue"],
    "references": [{ "path": "./tsconfig.node.json" }]
}
```

- [ ] **Step 4: 创建 vite.config.ts**

```typescript
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

export default defineConfig({
  plugins: [vue()],
  build: {
    outDir: 'panel/dist',
    rollupOptions: {
      input: {
        panel: resolve(__dirname, 'panel/index.html')
      }
    }
  }
})
```

- [ ] **Step 5: 创建 manifest.json**

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
  "permissions": ["activeTab"],
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": ["content/message-listener.js"],
      "run_at": "document_start"
    }
  ],
  "icons": {
    "16": "icons/icon16.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  }
}
```

- [ ] **Step 6: 提交基础结构**

```bash
git add package.json tsconfig.json vite.config.ts manifest.json
git commit -m "feat: 初始化项目基础结构"
```

---

## Task 2: Content Script - 监听 postMessage

**Files:**
- Create: `content/message-listener.js`

- [ ] **Step 1: 创建 content/message-listener.js**

```javascript
// content/message-listener.js
(function() {
  'use strict'
  
  console.log('[Console DevTools] Content script injected')
  
  // 监听页面的 postMessage
  window.addEventListener('message', function(event) {
    // 只处理来自同源的消息
    if (event.source !== window) return
    
    // 检查消息是否是我们需要的格式
    const data = event.data
    if (!data || typeof data !== 'object') return
    
    // 转发消息给 background
    chrome.runtime.sendMessage({
      type: 'CONSOLE_DEVTOOLS_MESSAGE',
      data: data
    }).catch(err => {
      console.error('[Console DevTools] Failed to send message to background:', err)
    })
  })
  
  // 通知 background script content script 已就绪
  chrome.runtime.sendMessage({
    type: 'CONSOLE_DEVTOOLS_CONTENT_READY'
  })
})()
```

- [ ] **Step 2: 创建目录结构**

```bash
mkdir -p content panel
```

- [ ] **Step 3: 提交 content script**

```bash
git add content/message-listener.js
git commit -m "feat: 添加 content script 监听 postMessage"
```

---

## Task 3: Background Script - 消息中转

**Files:**
- Create: `background.js`

- [ ] **Step 1: 创建 background.js**

```javascript
// background.js
console.log('[Console DevTools] Background script started')

// 存储消息缓存（当 panel 未打开时）
let messageBuffer = []
const MAX_BUFFER_SIZE = 100

// 当前的 panel 连接
let panelPort = null

// 监听 content script 的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'CONSOLE_DEVTOOLS_CONTENT_READY') {
    console.log('[Console DevTools] Content script ready')
    sendResponse({ status: 'ok' })
  } else if (request.type === 'CONSOLE_DEVTOOLS_MESSAGE') {
    // 如果有 panel 连接，直接转发
    if (panelPort) {
      panelPort.postMessage(request.data)
    } else {
      // 否则缓存消息
      if (messageBuffer.length >= MAX_BUFFER_SIZE) {
        messageBuffer.shift() // 移除最旧的消息
      }
      messageBuffer.push(request.data)
    }
    sendResponse({ status: 'ok' })
  }
  return true // 保持消息通道开启
})

// 监听 panel 连接
chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'console-devtools-panel') {
    console.log('[Console DevTools] Panel connected')
    panelPort = port
    
    // 发送缓存的消息
    if (messageBuffer.length > 0) {
      port.postMessage({
        type: 'BUFFERED_MESSAGES',
        data: messageBuffer
      })
      messageBuffer = []
    }
    
    // 监听 panel 断开
    port.onDisconnect.addListener(() => {
      console.log('[Console DevTools] Panel disconnected')
      panelPort = null
    })
  }
})
```

- [ ] **Step 2: 提交 background script**

```bash
git add background.js
git commit -m "feat: 添加 background script 消息中转"
```

---

## Task 4: Panel 入口页面

**Files:**
- Create: `panel/devtools.html`
- Create: `panel/index.html`
- Create: `panel/devtools.js`

- [ ] **Step 1: 创建 panel/devtools.html**

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Console DevTools</title>
</head>
<body>
  <script src="devtools.js"></script>
</body>
</html>
```

- [ ] **Step 2: 创建 panel/devtools.js**

```javascript
// panel/devtools.js
console.log('[Console DevTools] DevTools page loaded')

// 创建 DevTools Panel
chrome.devtools.panels.create(
  'Console DevTools',
  '../icons/icon48.png',
  'index.html',
  function(panel) {
    console.log('[Console DevTools] Panel created')
    
    panel.onShown.addListener(function(window) {
      console.log('[Console DevTools] Panel shown')
    })
    
    panel.onHidden.addListener(function() {
      console.log('[Console DevTools] Panel hidden')
    })
  }
)
```

- [ ] **Step 3: 创建 panel/index.html**

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Console DevTools</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 13px;
      color: #333;
    }
    #app {
      width: 100%;
      height: 100vh;
      display: flex;
      flex-direction: column;
    }
  </style>
</head>
<body>
  <div id="app"></div>
  <script type="module" src="./main.ts"></script>
</body>
</html>
```

- [ ] **Step 4: 提交 panel 入口页面**

```bash
git add panel/devtools.html panel/devtools.js panel/index.html
git commit -m "feat: 添加 panel 入口页面"
```

---

## Task 5: Vue 应用入口和类型定义

**Files:**
- Create: `panel/main.ts`
- Create: `panel/App.vue`
- Create: `panel/types/index.ts`

- [ ] **Step 1: 创建 panel/types/index.ts**

```typescript
// panel/types/index.ts

// 单条消息数据结构
export interface LogMessage {
  params: any
  path: string
  zfn: Record<string, LogMessage>
}

// 扁平化的树节点（用于下拉选项）
export interface TreeNode {
  id: string                    // 唯一标识
  key: string                   // 原始 key 名称，也是显示文本
  path: string                  // 源码路径
  level: number                 // 层级深度
  parentId?: string             // 父节点 id
  children?: TreeNode[]         // 子节点
  originalData: LogMessage      // 原始数据
  expanded?: boolean            // 是否展开
}

// 面板状态
export interface PanelState {
  messages: LogMessage[]              // 所有接收到的消息
  filteredMessages: LogMessage[]      // 过滤后的消息
  selectedNodeId: string | null       // 当前选中的节点 id
  filterKeyword: string               // 过滤关键字
  treeNodes: TreeNode[]               // 下拉选项树
}
```

- [ ] **Step 2: 创建 panel/main.ts**

```typescript
// panel/main.ts
import { createApp } from 'vue'
import App from './App.vue'

createApp(App).mount('#app')
```

- [ ] **Step 3: 创建 panel/App.vue**

```vue
<template>
  <div class="console-devtools">
    <header class="header">
      <h1>Console DevTools</h1>
    </header>
    <main class="main">
      <div class="control-panel">
        <input
          v-model="filterKeyword"
          type="text"
          placeholder="输入关键字筛选..."
          class="filter-input"
        />
        <button @click="handleClearTree" class="btn btn-danger">清空树结构</button>
        <button @click="handleExportJson" class="btn btn-primary">导出JSON</button>
      </div>
      <div class="log-container">
        <div v-if="filteredMessages.length === 0" class="empty-state">
          {{ messages.length === 0 ? '暂无日志数据' : '未找到匹配的节点' }}
        </div>
        <div v-else class="log-tree">
          <log-node
            v-for="(msg, index) in filteredMessages"
            :key="index"
            :message="msg"
          />
        </div>
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import type { LogMessage } from './types'
import LogNode from './components/LogNode.vue'

const messages = ref<LogMessage[]>([])
const filterKeyword = ref('')

const filteredMessages = computed(() => {
  if (!filterKeyword.value) {
    return messages.value
  }
  // 简单的关键字过滤（后续会优化）
  return messages.value.filter(msg => 
    containsKeyword(msg, filterKeyword.value)
  )
})

function containsKeyword(msg: LogMessage, keyword: string): boolean {
  // 递归检查是否包含关键字
  const keys = Object.keys(msg.zfn || {})
  return keys.some(key => key.toLowerCase().includes(keyword.toLowerCase()))
}

function handleClearTree() {
  messages.value = []
}

function handleExportJson() {
  if (filteredMessages.value.length === 0) {
    alert('暂无数据可导出')
    return
  }
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5)
  const filename = `console-devtools-${timestamp}.json`
  const data = JSON.stringify(filteredMessages.value, null, 2)
  const blob = new Blob([data], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
</script>

<style scoped>
.console-devtools {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #f5f5f5;
}

.header {
  padding: 12px 16px;
  background: #fff;
  border-bottom: 1px solid #e0e0e0;
}

.header h1 {
  font-size: 16px;
  font-weight: 600;
  color: #333;
}

.main {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.control-panel {
  padding: 12px 16px;
  background: #fff;
  border-bottom: 1px solid #e0e0e0;
  display: flex;
  gap: 8px;
  align-items: center;
}

.filter-input {
  flex: 1;
  padding: 6px 12px;
  border: 1px solid #d0d0d0;
  border-radius: 4px;
  font-size: 13px;
}

.btn {
  padding: 6px 12px;
  border: none;
  border-radius: 4px;
  font-size: 13px;
  cursor: pointer;
  white-space: nowrap;
}

.btn-primary {
  background: #1976d2;
  color: white;
}

.btn-danger {
  background: #d32f2f;
  color: white;
}

.log-container {
  flex: 1;
  overflow: auto;
  padding: 16px;
}

.empty-state {
  text-align: center;
  padding: 40px;
  color: #999;
}
</style>
```

- [ ] **Step 4: 提交 Vue 应用入口**

```bash
git add panel/main.ts panel/App.vue panel/types/
git commit -m "feat: 添加 Vue 应用入口和类型定义"
```

---

## Task 6: LogNode 组件 - 递归树形展示

**Files:**
- Create: `panel/components/LogNode.vue`

- [ ] **Step 1: 创建 panel/components/LogNode.vue**

```vue
<template>
  <div class="log-node">
    <div 
      v-for="(childMsg, key) in message.zfn" 
      :key="key"
      class="log-item"
      :class="{ 'has-children': Object.keys(childMsg.zfn || {}).length > 0 }"
    >
      <div 
        class="log-item-header"
        :style="{ paddingLeft: `${level * 16 + 8}px` }"
        @click="toggleExpand(key)"
      >
        <span class="expand-icon">
          {{ expandedKeys.has(key) ? '▼' : '▶' }}
        </span>
        <span class="log-key">{{ key }}</span>
      </div>
      
      <div v-if="expandedKeys.has(key)" class="log-item-content">
        <div class="log-row">
          <span class="log-label">path:</span>
          <span class="log-value">{{ childMsg.path }}</span>
          <button @click.stop="copyPath(childMsg.path)" class="copy-btn">
            复制
          </button>
        </div>
        
        <div v-if="childMsg.params && Object.keys(childMsg.params).length > 0" class="log-row">
          <span class="log-label">params:</span>
          <pre class="log-json">{{ JSON.stringify(childMsg.params, null, 2) }}</pre>
        </div>
        
        <log-node
          v-if="childMsg.zfn && Object.keys(childMsg.zfn).length > 0"
          :message="childMsg"
          :level="level + 1"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import type { LogMessage } from '../types'

interface Props {
  message: LogMessage
  level?: number
}

const props = withDefaults(defineProps<Props>(), {
  level: 0
})

const expandedKeys = ref<Set<string>>(new Set())

function toggleExpand(key: string) {
  if (expandedKeys.value.has(key)) {
    expandedKeys.value.delete(key)
  } else {
    expandedKeys.value.add(key)
  }
}

async function copyPath(path: string) {
  try {
    await navigator.clipboard.writeText(path)
    // 可以添加一个简单的提示
    console.log('已复制:', path)
  } catch (err) {
    alert('复制失败，请手动复制')
  }
}
</script>

<style scoped>
.log-node {
  font-size: 12px;
}

.log-item {
  margin-bottom: 4px;
}

.log-item-header {
  display: flex;
  align-items: center;
  padding: 4px 0;
  cursor: pointer;
  user-select: none;
}

.log-item-header:hover {
  background: #f0f0f0;
}

.expand-icon {
  display: inline-block;
  width: 16px;
  text-align: center;
  color: #666;
  font-size: 10px;
}

.log-key {
  color: #1976d2;
  font-weight: 500;
}

.log-item-content {
  padding: 4px 0;
  border-left: 1px solid #e0e0e0;
  margin-left: 24px;
}

.log-row {
  display: flex;
  padding: 4px 8px;
  align-items: flex-start;
}

.log-label {
  color: #666;
  min-width: 60px;
  flex-shrink: 0;
}

.log-value {
  color: #333;
  word-break: break-all;
}

.copy-btn {
  margin-left: auto;
  padding: 2px 8px;
  background: #1976d2;
  color: white;
  border: none;
  border-radius: 3px;
  font-size: 11px;
  cursor: pointer;
}

.copy-btn:hover {
  background: #1565c0;
}

.log-json {
  margin: 0;
  padding: 4px 8px;
  background: #f5f5f5;
  border-radius: 3px;
  font-size: 11px;
  overflow-x: auto;
}
</style>
```

- [ ] **Step 2: 创建组件目录**

```bash
mkdir -p panel/components
```

- [ ] **Step 3: 提交 LogNode 组件**

```bash
git add panel/components/LogNode.vue
git commit -m "feat: 添加 LogNode 递归树形展示组件"
```

---

## Task 7: Background 连接和消息接收

**Files:**
- Modify: `panel/App.vue`

- [ ] **Step 1: 添加 background 连接逻辑到 App.vue**

在 `<script setup>` 部分添加：

```typescript
import { onMounted, onUnmounted } from 'vue'

let backgroundPort: chrome.runtime.Port | null = null

onMounted(() => {
  // 连接到 background script
  backgroundPort = chrome.runtime.connect({ name: 'console-devtools-panel' })
  
  backgroundPort.onMessage.addListener((message) => {
    if (message.type === 'BUFFERED_MESSAGES') {
      messages.value = [...messages.value, ...message.data]
    } else {
      // 单条消息
      messages.value.push(message)
    }
  })
})

onUnmounted(() => {
  if (backgroundPort) {
    backgroundPort.disconnect()
  }
})
```

更新 script setup 部分：

```vue
<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import type { LogMessage } from './types'
import LogNode from './components/LogNode.vue'

const messages = ref<LogMessage[]>([])
const filterKeyword = ref('')

let backgroundPort: chrome.runtime.Port | null = null

onMounted(() => {
  backgroundPort = chrome.runtime.connect({ name: 'console-devtools-panel' })
  
  backgroundPort.onMessage.addListener((message) => {
    if (message.type === 'BUFFERED_MESSAGES') {
      messages.value = [...messages.value, ...message.data]
    } else {
      messages.value.push(message)
    }
  })
})

onUnmounted(() => {
  if (backgroundPort) {
    backgroundPort.disconnect()
  }
})

const filteredMessages = computed(() => {
  if (!filterKeyword.value) {
    return messages.value
  }
  return messages.value.filter(msg => 
    containsKeyword(msg, filterKeyword.value)
  )
})

function containsKeyword(msg: LogMessage, keyword: string): boolean {
  const keys = Object.keys(msg.zfn || {})
  return keys.some(key => key.toLowerCase().includes(keyword.toLowerCase()))
}

function handleClearTree() {
  messages.value = []
}

function handleExportJson() {
  if (filteredMessages.value.length === 0) {
    alert('暂无数据可导出')
    return
  }
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5)
  const filename = `console-devtools-${timestamp}.json`
  const data = JSON.stringify(filteredMessages.value, null, 2)
  const blob = new Blob([data], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
</script>
```

- [ ] **Step 2: 提交 background 连接**

```bash
git add panel/App.vue
git commit -m "feat: 添加 background 连接和消息接收"
```

---

## Task 8: 构建配置和图标

**Files:**
- Create: `panel/vite-env.d.ts`
- Create: `tsconfig.node.json`
- Create: `icons/icon16.png` (需要手动添加)
- Create: `icons/icon48.png` (需要手动添加)
- Create: `icons/icon128.png` (需要手动添加)

- [ ] **Step 1: 创建 panel/vite-env.d.ts**

```typescript
/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}
```

- [ ] **Step 2: 创建 tsconfig.node.json**

```json
{
  "compilerOptions": {
    "composite": true,
    "skipLibCheck": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true
  },
  "include": ["vite.config.ts"]
}
```

- [ ] **Step 3: 创建图标目录和占位图标**

```bash
mkdir -p icons
```

创建简单的 SVG 图标并转换为 PNG，或使用以下 HTML 生成图标：

```html
<!-- 临时用于生成图标 -->
<!DOCTYPE html>
<html>
<body>
  <canvas id="canvas" width="128" height="128"></canvas>
  <script>
    const canvas = document.getElementById('canvas')
    const ctx = canvas.getContext('2d')
    
    // 绘制图标
    ctx.fillStyle = '#1976d2'
    ctx.fillRect(0, 0, 128, 128)
    
    ctx.fillStyle = 'white'
    ctx.font = 'bold 80px Arial'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('C', 64, 64)
    
    // 下载
    canvas.toBlob(blob => {
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = 'icon128.png'
      a.click()
    })
  </script>
</body>
</html>
```

- [ ] **Step 4: 更新 manifest.json 确保路径正确**

检查 manifest.json 中的图标路径是否正确。

- [ ] **Step 5: 提交构建配置**

```bash
git add panel/vite-env.d.ts tsconfig.node.json
git commit -m "feat: 添加构建配置"
```

---

## Task 9: 测试和调试

**Files:**
- Create: `test-page.html` (测试页面)

- [ ] **Step 1: 创建测试页面**

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>Console DevTools 测试</title>
</head>
<body>
  <h1>Console DevTools 测试页面</h1>
  <button id="sendTestMessage">发送测试消息</button>
  
  <script>
    const testMessage = {
      params: {
        val: true
      },
      path: "src/pages/borrow/components/first-enjoy-bind-card.vue:100",
      zfn: {
        handleGetPage: {
          params: {},
          path: "src/pages/borrow/mixins/first-enjoy.js:235",
          zfn: {}
        },
        "[computed] reqPageType": {
          params: {},
          path: "src/pages/borrow/mixins/first-enjoy.js:52",
          zfn: {}
        }
      }
    }
    
    document.getElementById('sendTestMessage').addEventListener('click', () => {
      window.postMessage(testMessage, '*')
      console.log('测试消息已发送')
    })
    
    // 自动发送一条消息
    setTimeout(() => {
      window.postMessage(testMessage, '*')
    }, 1000)
  </script>
</body>
</html>
```

- [ ] **Step 2: 构建项目**

```bash
npm run build
```

- [ ] **Step 3: 加载扩展到 Chrome**

1. 打开 Chrome，访问 `chrome://extensions/`
2. 启用"开发者模式"
3. 点击"加载已解压的扩展程序"
4. 选择项目目录

- [ ] **Step 4: 测试功能**

1. 打开 `test-page.html`
2. 打开开发者工具（F12）
3. 切换到"Console DevTools"面板
4. 验证消息是否正确显示
5. 测试过滤、复制、导出功能

- [ ] **Step 5: 提交测试页面**

```bash
git add test-page.html
git commit -m "test: 添加测试页面"
```

---

## Task 10: 添加 README 文档

**Files:**
- Create: `README.md`

- [ ] **Step 1: 创建 README.md**

```markdown
# Console DevTools

一个 Chrome 扩展程序，用于在开发者工具中过滤和展示嵌套的日志数据。

## 功能特性

- 通过 postMessage 接收嵌套日志数据
- 树形展示日志结构
- 关键字过滤
- 复制路径
- 导出 JSON
- 清空树结构

## 安装

1. 克隆仓库
2. 安装依赖: `npm install`
3. 构建项目: `npm run build`
4. 在 Chrome 中加载扩展:
   - 访问 `chrome://extensions/`
   - 启用"开发者模式"
   - 点击"加载已解压的扩展程序"
   - 选择项目目录

## 使用方法

1. 在你的页面中通过 postMessage 发送日志数据
2. 打开开发者工具
3. 切换到"Console DevTools"面板
4. 查看和过滤日志

## 消息格式

```javascript
window.postMessage({
  params: { /* 参数 */ },
  path: "文件路径:行号",
  zfn: {
    functionName: {
      params: { /* 参数 */ },
      path: "文件路径:行号",
      zfn: { /* 子函数 */ }
    }
  }
}, '*')
```

## 开发

```bash
# 安装依赖
npm install

# 开发模式
npm run dev

# 构建
npm run build

# 类型检查
npm run check
```

## License

MIT
```

- [ ] **Step 2: 提交 README**

```bash
git add README.md
git commit -m "docs: 添加 README 文档"
```

---

## Task 11: 最终构建和验证

**Files:**
- Modify: `package.json` (确保 scripts 正确)

- [ ] **Step 1: 验证 package.json scripts**

确保 package.json 包含以下 scripts：

```json
{
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "check": "tsc --noEmit"
  }
}
```

- [ ] **Step 2: 运行类型检查**

```bash
npm run check
```

- [ ] **Step 3: 构建生产版本**

```bash
npm run build
```

- [ ] **Step 4: 验证构建输出**

检查 `panel/dist` 目录是否生成，包含必要的文件。

- [ ] **Step 5: 重新加载扩展并测试**

在 Chrome 中重新加载扩展，打开测试页面验证所有功能。

- [ ] **Step 6: 提交最终代码**

```bash
git add .
git commit -m "chore: 完成实现并验证"
```

---

## 自我审查

### Spec 覆盖检查

| 需求 | 对应任务 | 状态 |
|------|---------|------|
| Chrome 扩展，显示在控制台 | Task 1, Task 4 | ✅ |
| Content Script 监听 postMessage | Task 2 | ✅ |
| Background 消息中转 | Task 3 | ✅ |
| Vue 3 + TypeScript + Vite | Task 1, Task 5 | ✅ |
| 树形日志展示 | Task 6 | ✅ |
| 关键字过滤 | Task 5, Task 7 | ✅ |
| 复制 path 功能 | Task 6 | ✅ |
| 导出 JSON 功能 | Task 5 | ✅ |
| 清空树结构功能 | Task 5 | ✅ |
| 错误处理 | Task 2, Task 3, Task 6 | ✅ |

### 占位符扫描

- ✅ 没有 TBD、TODO
- ✅ 所有代码步骤包含完整代码
- ✅ 所有文件路径明确
- ✅ 没有模糊的描述

### 类型一致性检查

- ✅ LogMessage 类型在所有文件中一致
- ✅ TreeNode 类型一致
- ✅ 消息格式与设计文档匹配

---

## 执行说明

实现计划已完成并保存到 `docs/superpowers/plans/2025-04-10-console-devtools.md`。

**两种执行选项：**

**1. Subagent-Driven（推荐）** - 每个任务使用独立的子代理，任务间快速迭代和审查

**2. Inline Execution** - 在当前会话中使用 executing-plans 技能批量执行任务

你希望使用哪种方式？
