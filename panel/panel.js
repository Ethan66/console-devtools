// panel/panel.js - DevTools 面板主脚本
console.log('[Panel] panel.js loaded')

// 全局状态
let messages = []
let filterKeyword = ''
let selectedNodeId = null
let treeNodes = [] // 扁平化的树节点用于下拉选项
let expandedTreeKeys = new Set() // 下拉树展开的 key

// DOM 元素
let logContentEl = null
let filterInputEl = null
let clearBtnEl = null
let exportBtnEl = null
let treeDropdownEl = null

// Port 连接
let port = null

// 初始化
function initPanel() {
  console.log('[Panel] initPanel called')

  logContentEl = document.getElementById('logContent')
  filterInputEl = document.getElementById('filterInput')
  clearBtnEl = document.getElementById('clearBtn')
  exportBtnEl = document.getElementById('exportBtn')
  treeDropdownEl = document.getElementById('treeDropdown')

  console.log('[Panel] DOM elements:', {
    logContentEl: !!logContentEl,
    filterInputEl: !!filterInputEl,
    clearBtnEl: !!clearBtnEl,
    exportBtnEl: !!exportBtnEl,
    treeDropdownEl: !!treeDropdownEl
  })

  // 连接到 background
  try {
    port = chrome.runtime.connect({ name: 'console-devtools-panel' })
    console.log('[Panel] Connected to background, port:', port)

    port.onMessage.addListener((message) => {
      console.log('[Panel] Received message:', message)
      if (message.type === 'BUFFERED_MESSAGES') {
        console.log('[Panel] Buffered messages count:', message.data?.length)
        messages = [...messages, ...message.data]
      } else {
        console.log('[Panel] Single message:', message)
        messages.push(message)
      }
      rebuildTreeNodes()
      render()
      renderTreeDropdown()
    })

    port.onDisconnect.addListener(() => {
      console.log('[Panel] Port disconnected')
      port = null
    })

    port.postMessage({ type: 'PANEL_READY' })
    console.log('[Panel] Sent PANEL_READY message')
  } catch (e) {
    console.error('[Panel] Failed to connect to background:', e)
  }

  // 绑定事件
  if (clearBtnEl) {
    clearBtnEl.addEventListener('click', handleClear)
  }
  if (exportBtnEl) {
    exportBtnEl.addEventListener('click', handleExport)
  }
  if (filterInputEl) {
    filterInputEl.addEventListener('input', handleFilter)
    filterInputEl.addEventListener('focus', handleFocus)
    filterInputEl.addEventListener('blur', () => {
      // 延迟关闭，允许点击下拉项
      setTimeout(() => hideDropdown(), 200)
    })
  }

  // 点击外部关闭下拉
  document.addEventListener('click', (e) => {
    if (!filterInputEl.contains(e.target) && !treeDropdownEl.contains(e.target)) {
      hideDropdown()
    }
  })

  // 初始渲染
  render()
  console.log('[Panel] Panel initialized')
}

// 清空按钮
function handleClear() {
  messages = []
  treeNodes = []
  selectedNodeId = null
  filterKeyword = ''
  if (filterInputEl) {
    filterInputEl.value = ''
  }
  render()
  renderTreeDropdown()
}

// 导出按钮
function handleExport() {
  if (messages.length === 0) {
    alert('暂无数据可导出')
    return
  }
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5)
  const filename = `console-devtools-${timestamp}.json`
  const data = JSON.stringify(messages, null, 2)
  const blob = new Blob([data], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// 过滤输入
function handleFilter(e) {
  filterKeyword = e.target.value.toLowerCase()
  render()
}

// 检查是否包含关键字
function containsKeyword(msg, keyword) {
  const keys = Object.keys(msg.zfn || {})
  return keys.some(key => key.toLowerCase().includes(keyword))
}

// 重建树节点（扁平化用于下拉选项）
function rebuildTreeNodes() {
  treeNodes = []
  const keyCount = new Map() // 用于生成唯一 id

  messages.forEach((msg, msgIndex) => {
    Object.keys(msg.zfn || {}).forEach(key => {
      const childMsg = msg.zfn[key]
      const id = `msg-${msgIndex}-key-${key}`

      treeNodes.push({
        id,
        key,
        path: childMsg.path || '',
        level: 0,
        parentId: null,
        originalData: childMsg,
        expanded: true
      })

      // 递归处理子节点
      buildChildNodes(childMsg, id, 1, keyCount)
    })
  })
}

function buildChildNodes(message, parentId, level, keyCount) {
  Object.keys(message.zfn || {}).forEach(key => {
    const childMsg = message.zfn[key]
    const count = keyCount.get(key) || 0
    keyCount.set(key, count + 1)
    const id = `${parentId}-child-${key}-${count}`

    treeNodes.push({
      id,
      key,
      path: childMsg.path || '',
      level,
      parentId,
      originalData: childMsg,
      expanded: true
    })

    // 递归处理子节点
    buildChildNodes(childMsg, id, level + 1, keyCount)
  })
}

// 筛选树节点
function filterTreeNodes(keyword) {
  if (!keyword) {
    return treeNodes.filter(node => node.level === 0)
  }

  const lowerKeyword = keyword.toLowerCase()
  const matchedNodes = treeNodes.filter(node =>
    node.key.toLowerCase().includes(lowerKeyword)
  )

  // 返回匹配的节点以及它们的父节点（用于显示层级）
  const resultNodes = new Set()
  matchedNodes.forEach(node => {
    let currentNode = node
    while (currentNode) {
      resultNodes.add(currentNode)
      currentNode = treeNodes.find(n => n.id === currentNode.parentId)
    }
  })

  return Array.from(resultNodes).sort((a, b) => a.level - b.level)
}

// 渲染日志树
function render() {
  if (!logContentEl) {
    console.error('[Panel] logContentEl not found')
    return
  }

  const filtered = filterKeyword
    ? messages.filter(msg => containsKeyword(msg, filterKeyword))
    : messages

  if (filtered.length === 0) {
    logContentEl.innerHTML = '<div class="empty-state">' + (messages.length === 0 ? '暂无日志数据' : '未找到匹配的节点') + '</div>'
    return
  }

  logContentEl.innerHTML = ''
  filtered.forEach(msg => {
    const nodeEl = createLogNode(msg, 0)
    logContentEl.appendChild(nodeEl)
  })
}

// 创建日志节点
function createLogNode(message, level) {
  const container = document.createElement('div')
  container.className = 'log-node'

  Object.keys(message.zfn || {}).forEach(key => {
    const childMsg = message.zfn[key]

    // 创建 item
    const itemEl = document.createElement('div')
    itemEl.className = 'log-item'

    // 创建 header
    const headerEl = document.createElement('div')
    headerEl.className = 'log-item-header'
    headerEl.style.paddingLeft = `${level * 16 + 8}px`

    const iconEl = document.createElement('span')
    iconEl.className = 'expand-icon'
    iconEl.textContent = '▼'

    const keyEl = document.createElement('span')
    keyEl.className = 'log-key'
    keyEl.textContent = key

    headerEl.appendChild(iconEl)
    headerEl.appendChild(keyEl)

    // 创建内容（默认展开）
    const contentEl = document.createElement('div')
    contentEl.className = 'log-item-content'
    contentEl.style.display = 'block'

    // path 行
    const pathRowEl = document.createElement('div')
    pathRowEl.className = 'log-row'
    pathRowEl.innerHTML = `
      <span class="log-label">path:</span>
      <span class="log-value">${childMsg.path || ''}</span>
      <button class="copy-btn">复制</button>
    `
    const copyBtn = pathRowEl.querySelector('.copy-btn')
    copyBtn.addEventListener('click', (e) => {
      e.stopPropagation()
      navigator.clipboard.writeText(childMsg.path || '').then(() => {
        copyBtn.textContent = '已复制!'
        setTimeout(() => copyBtn.textContent = '复制', 1000)
      })
    })
    contentEl.appendChild(pathRowEl)

    // params 行
    if (childMsg.params && Object.keys(childMsg.params).length > 0) {
      const paramsRowEl = document.createElement('div')
      paramsRowEl.className = 'log-row'
      paramsRowEl.innerHTML = `
        <span class="log-label">params:</span>
        <pre class="log-json">${JSON.stringify(childMsg.params, null, 2)}</pre>
      `
      contentEl.appendChild(paramsRowEl)
    }

    // 递归子节点
    if (childMsg.zfn && Object.keys(childMsg.zfn).length > 0) {
      const childNodeEl = createLogNode(childMsg, level + 1)
      contentEl.appendChild(childNodeEl)
    }

    // 点击展开/折叠
    let isExpanded = true
    headerEl.addEventListener('click', () => {
      isExpanded = !isExpanded
      contentEl.style.display = isExpanded ? 'block' : 'none'
      iconEl.textContent = isExpanded ? '▼' : '▶'
    })

    itemEl.appendChild(headerEl)
    itemEl.appendChild(contentEl)
    container.appendChild(itemEl)
  })

  return container
}

// DOM 加载完成后初始化
document.addEventListener('DOMContentLoaded', initPanel)

// 下拉框相关函数
function showDropdown() {
  if (!treeDropdownEl) return
  treeDropdownEl.classList.add('show')
  renderTreeDropdown()
}

function hideDropdown() {
  if (!treeDropdownEl) return
  treeDropdownEl.classList.remove('show')
}

function handleFocus() {
  showDropdown()
}

function handleFilter(e) {
  filterKeyword = e.target.value.toLowerCase()
  render()
  // 有输入时显示下拉框
  if (filterKeyword) {
    showDropdown()
  }
}

function handleNodeSelect(nodeId) {
  selectedNodeId = nodeId
  const node = treeNodes.find(n => n.id === nodeId)
  if (node) {
    // 设置输入框显示选中的 key
    filterInputEl.value = node.key
    // 过滤日志显示该节点的数据
    filterKeyword = node.key.toLowerCase()
    render()
  }
  hideDropdown()
}

function renderTreeDropdown() {
  if (!treeDropdownEl) return

  const filtered = filterTreeNodes(filterKeyword)

  if (filtered.length === 0) {
    treeDropdownEl.innerHTML = '<div class="tree-node" style="color: #999; justify-content: center;">暂无匹配节点</div>'
    return
  }

  treeDropdownEl.innerHTML = ''
  filtered.forEach(node => {
    const nodeEl = document.createElement('div')
    nodeEl.className = 'tree-node'
    if (node.id === selectedNodeId) {
      nodeEl.classList.add('selected')
    }

    // 缩进
    const indentEl = document.createElement('span')
    indentEl.className = 'tree-node-indent'
    indentEl.textContent = node.level > 0 ? '└' : ''
    nodeEl.appendChild(indentEl)

    // 节点 key
    const keyEl = document.createElement('span')
    keyEl.className = 'tree-node-key'
    keyEl.textContent = node.key
    nodeEl.appendChild(keyEl)

    // 点击选择
    nodeEl.addEventListener('click', () => {
      handleNodeSelect(node.id)
    })

    treeDropdownEl.appendChild(nodeEl)
  })
}
