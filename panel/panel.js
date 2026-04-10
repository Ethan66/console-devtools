// panel/panel.js - DevTools 面板主脚本
console.log('[Panel] panel.js loaded')

// 全局状态
let messages = []
let filterKeyword = ''
let selectedNodeId = null
let treeNodes = [] // 扁平化的树节点用于下拉选项

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

// 检查是否包含关键字（递归检查）
function containsKeyword(msg, keyword) {
  if (!keyword) return true

  function checkNode(node) {
    const keys = Object.keys(node.zfn || {})
    if (keys.some(key => key.toLowerCase().includes(keyword))) {
      return true
    }
    // 递归检查子节点
    return keys.some(key => checkNode(node.zfn[key]))
  }

  return checkNode(msg)
}

// 检查消息是否包含选中的节点
function containsSelectedNode(msg, nodeId) {
  if (!nodeId) return true

  const node = treeNodes.find(n => n.id === nodeId)
  if (!node) return true

  // 检查消息的 zfn 中是否有匹配的 key
  return Object.keys(msg.zfn || {}).some(key => key === node.key)
}

// 重建树节点（扁平化用于下拉选项）
function rebuildTreeNodes() {
  const nodeMap = new Map() // key: level-key-path, value: node

  messages.forEach((msg, msgIndex) => {
    Object.keys(msg.zfn || {}).forEach(key => {
      const childMsg = msg.zfn[key]
      const uniqueKey = `0-${key}-${childMsg.path || ''}`

      // 根节点去重
      if (!nodeMap.has(uniqueKey)) {
        nodeMap.set(uniqueKey, {
          id: `root-${key}`,
          key,
          path: childMsg.path || '',
          level: 0,
          parentId: null,
          originalData: childMsg,
          expanded: true,
          childrenIds: new Set()
        })
      }

      // 递归处理子节点（去重）
      buildChildNodes(childMsg, `root-${key}`, 1, nodeMap)
    })
  })

  // 转换为数组
  treeNodes = Array.from(nodeMap.values())
}

function buildChildNodes(message, parentId, level, nodeMap) {
  Object.keys(message.zfn || {}).forEach(key => {
    const childMsg = message.zfn[key]
    const uniqueKey = `${level}-${key}-${childMsg.path || ''}`

    if (!nodeMap.has(uniqueKey)) {
      const nodeId = `level-${level}-${key}`
      nodeMap.set(uniqueKey, {
        id: nodeId,
        key,
        path: childMsg.path || '',
        level,
        parentId,
        originalData: childMsg,
        expanded: true,
        childrenIds: new Set()
      })
    }

    // 将当前节点添加到父节点的 childrenIds
    const parentNode = Array.from(nodeMap.values()).find(n => n.id === parentId)
    if (parentNode) {
      parentNode.childrenIds.add(nodeMap.get(uniqueKey).id)
    }

    // 递归处理子节点
    buildChildNodes(childMsg, nodeMap.get(uniqueKey).id, level + 1, nodeMap)
  })
}

// 筛选树节点（保持树形结构）
function filterTreeNodes(keyword) {
  if (!keyword) {
    // 返回所有根节点及其子节点
    return getTreeDisplayNodes(treeNodes)
  }

  const lowerKeyword = keyword.toLowerCase()

  // 找到所有匹配的节点
  const matchedNodes = treeNodes.filter(node =>
    node.key.toLowerCase().includes(lowerKeyword)
  )

  // 收集需要显示的节点（包括祖先节点）
  const resultNodes = new Map()

  function addNodeWithAncestors(node) {
    if (resultNodes.has(node.id)) return

    resultNodes.set(node.id, node)

    // 添加父节点
    if (node.parentId) {
      const parent = treeNodes.find(n => n.id === node.parentId)
      if (parent) {
        addNodeWithAncestors(parent)
      }
    }
  }

  matchedNodes.forEach(node => addNodeWithAncestors(node))

  // 返回树形结构的节点列表
  return getTreeDisplayNodes(Array.from(resultNodes.values()))
}

// 获取树形显示的节点列表（根节点在前，子节点按顺序排列）
function getTreeDisplayNodes(nodes) {
  const result = []
  const rootNodes = nodes.filter(n => n.level === 0)

  function addNodeWithChildren(node) {
    result.push(node)

    // 查找子节点
    const children = nodes.filter(n => n.parentId === node.id)
    children.forEach(child => addNodeWithChildren(child))
  }

  rootNodes.forEach(node => addNodeWithChildren(node))
  return result
}

// 渲染日志树
function render() {
  if (!logContentEl) {
    console.error('[Panel] logContentEl not found')
    return
  }

  let filtered = messages

  // 根据关键字过滤（输入框输入时或选中节点时）
  if (filterKeyword) {
    filtered = filtered.filter(msg => containsKeyword(msg, filterKeyword))
  }

  if (filtered.length === 0) {
    logContentEl.innerHTML = '<div class="empty-state">' + (messages.length === 0 ? '暂无日志数据' : '未找到匹配的节点') + '</div>'
    return
  }

  logContentEl.innerHTML = ''
  filtered.forEach(msg => {
    const nodeEl = createLogNode(msg, 0, filterKeyword)
    logContentEl.appendChild(nodeEl)
  })

  // 如果在渲染日志时有过滤，同时更新下拉框
  if (treeDropdownEl && treeDropdownEl.classList.contains('show')) {
    renderTreeDropdown()
  }
}

// 创建日志节点
function createLogNode(message, level, keyword = '') {
  const container = document.createElement('div')
  container.className = 'log-node'

  Object.keys(message.zfn || {}).forEach(key => {
    const childMsg = message.zfn[key]

    // 如果有 keyword，检查是否需要显示该节点
    if (keyword) {
      const matches = key.toLowerCase().includes(keyword)
      // 如果不匹配且子节点也不匹配，跳过
      if (!matches && !hasMatchingChild(childMsg, keyword)) {
        return
      }
    }

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
      const childNodeEl = createLogNode(childMsg, level + 1, keyword)
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

// 检查节点或其子节点是否匹配关键字
function hasMatchingChild(message, keyword) {
  const keys = Object.keys(message.zfn || {})
  if (keys.some(key => key.toLowerCase().includes(keyword))) {
    return true
  }
  return keys.some(key => hasMatchingChild(message.zfn[key], keyword))
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
  // 输入时清空选中的节点
  selectedNodeId = null
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
    // 使用选中的 key 作为过滤关键字
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

  function renderNode(node, depth) {
    const nodeEl = document.createElement('div')
    nodeEl.className = 'tree-node'
    if (node.level > 0 && node.level <= 5) {
      nodeEl.classList.add(`level-${node.level}`)
    }
    if (node.id === selectedNodeId) {
      nodeEl.classList.add('selected')
    }

    // 检查是否有子节点
    const hasChildren = treeNodes.some(n => n.parentId === node.id)

    // 展开/折叠图标（只显示展开状态，禁用折叠）
    const expandIconEl = document.createElement('span')
    expandIconEl.className = 'tree-node-indent'
    expandIconEl.style.cursor = 'default'

    if (hasChildren) {
      expandIconEl.textContent = '▼'
    } else {
      expandIconEl.textContent = depth > 0 ? '└' : ''
    }

    nodeEl.appendChild(expandIconEl)

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

    // 渲染子节点（始终展开）
    if (hasChildren) {
      const children = treeNodes.filter(n => n.parentId === node.id)
      children.forEach(child => renderNode(child, depth + 1))
    }
  }

  // 只渲染根节点，子节点递归渲染
  const rootNodes = filtered.filter(n => n.level === 0)
  rootNodes.forEach(node => renderNode(node, 0))
}
