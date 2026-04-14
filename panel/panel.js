// panel/panel.js
console.log('[Panel] panel.js loaded')

let messages = []
let filterKeyword = ''
let selectedNodeId = null
let treeNodes = []
let keyboardIndex = -1
let displayedNodes = []

let logContentEl = null
let filterInputEl = null
let clearBtnEl = null
let exportBtnEl = null
let treeDropdownEl = null
let port = null

const META_NODE_KEYS = new Set(['params', 'path', 'zfn'])

function isObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
}

function isTreeNode(value) {
  return isObject(value) && (
    Object.prototype.hasOwnProperty.call(value, 'params') ||
    Object.prototype.hasOwnProperty.call(value, 'path') ||
    Object.prototype.hasOwnProperty.call(value, 'zfn')
  )
}

function getChildEntries(message) {
  if (!isObject(message)) return []

  const result = []
  const seen = new Set()

  if (isObject(message.zfn)) {
    Object.entries(message.zfn).forEach(([key, value]) => {
      if (!isObject(value)) return
      result.push([key, value])
      seen.add(key)
    })
  }

  Object.entries(message).forEach(([key, value]) => {
    if (META_NODE_KEYS.has(key) || seen.has(key)) return
    if (!isObject(value)) return
    if (!isTreeNode(value)) return
    result.push([key, value])
  })

  return result
}

function containsKeyword(message, keyword) {
  if (!keyword) return true

  function checkNode(node) {
    const children = getChildEntries(node)
    if (children.some(([key]) => key.toLowerCase().includes(keyword))) {
      return true
    }
    return children.some(([, child]) => checkNode(child))
  }

  return checkNode(message)
}

function rebuildTreeNodes() {
  const nodeMap = new Map()

  function buildChildren(nodeData, parentId, level, parentStableKey) {
    getChildEntries(nodeData).forEach(([key, childMsg]) => {
      const stableKey = `${parentStableKey}|${level}|${key}|${childMsg.path || ''}`
      const nodeId = `node-${encodeURIComponent(stableKey)}`

      if (!nodeMap.has(stableKey)) {
        nodeMap.set(stableKey, {
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

      if (parentId) {
        for (const node of nodeMap.values()) {
          if (node.id === parentId) {
            node.childrenIds.add(nodeId)
            break
          }
        }
      }

      buildChildren(childMsg, nodeId, level + 1, stableKey)
    })
  }

  messages.forEach((msg) => {
    buildChildren(msg, null, 0, 'root')
  })

  treeNodes = Array.from(nodeMap.values())
}

function getTreeDisplayNodes(nodes) {
  const result = []
  const roots = nodes.filter((n) => n.level === 0)

  function walk(node) {
    result.push(node)
    const children = nodes.filter((n) => n.parentId === node.id)
    children.forEach(walk)
  }

  roots.forEach(walk)
  return result
}

function filterTreeNodes(keyword) {
  if (!keyword) {
    return getTreeDisplayNodes(treeNodes)
  }

  const lower = keyword.toLowerCase()
  const matched = treeNodes.filter((node) => node.key.toLowerCase().includes(lower))
  const required = new Map()

  function addWithParents(node) {
    if (required.has(node.id)) return
    required.set(node.id, node)
    if (!node.parentId) return
    const parent = treeNodes.find((n) => n.id === node.parentId)
    if (parent) addWithParents(parent)
  }

  matched.forEach(addWithParents)
  return getTreeDisplayNodes(Array.from(required.values()))
}

function hasMatchingChild(message, keyword) {
  const children = getChildEntries(message)
  if (children.some(([key]) => key.toLowerCase().includes(keyword))) {
    return true
  }
  return children.some(([, child]) => hasMatchingChild(child, keyword))
}

function createLogNode(message, level, keyword = '') {
  const container = document.createElement('div')
  container.className = 'log-node'

  getChildEntries(message).forEach(([key, childMsg]) => {
    if (keyword) {
      const selfMatch = key.toLowerCase().includes(keyword)
      if (!selfMatch && !hasMatchingChild(childMsg, keyword)) {
        return
      }
    }

    const itemEl = document.createElement('div')
    itemEl.className = 'log-item'

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

    const contentEl = document.createElement('div')
    contentEl.className = 'log-item-content'
    contentEl.style.display = 'block'

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
        copyBtn.textContent = '已复制'
        setTimeout(() => {
          copyBtn.textContent = '复制'
        }, 1000)
      })
    })
    contentEl.appendChild(pathRowEl)

    if (isObject(childMsg.params) && Object.keys(childMsg.params).length > 0) {
      const paramsRowEl = document.createElement('div')
      paramsRowEl.className = 'log-row'
      paramsRowEl.innerHTML = `
        <span class="log-label">params:</span>
        <pre class="log-json">${JSON.stringify(childMsg.params, null, 2)}</pre>
      `
      contentEl.appendChild(paramsRowEl)
    }

    if (getChildEntries(childMsg).length > 0) {
      contentEl.appendChild(createLogNode(childMsg, level + 1, keyword))
    }

    let expanded = true
    headerEl.addEventListener('click', () => {
      expanded = !expanded
      contentEl.style.display = expanded ? 'block' : 'none'
      iconEl.textContent = expanded ? '▼' : '▶'
    })

    itemEl.appendChild(headerEl)
    itemEl.appendChild(contentEl)
    container.appendChild(itemEl)
  })

  return container
}

function render() {
  if (!logContentEl) return

  let filtered = messages
  if (filterKeyword) {
    filtered = filtered.filter((msg) => containsKeyword(msg, filterKeyword))
  }

  if (filtered.length === 0) {
    logContentEl.innerHTML = `<div class="empty-state">${messages.length === 0 ? '暂无日志数据' : '未找到匹配节点'}</div>`
    return
  }

  logContentEl.innerHTML = ''
  filtered.forEach((msg) => {
    logContentEl.appendChild(createLogNode(msg, 0, filterKeyword))
  })

  if (treeDropdownEl && treeDropdownEl.classList.contains('show')) {
    renderTreeDropdown()
  }
}

function handleClear() {
  messages = []
  treeNodes = []
  selectedNodeId = null
  filterKeyword = ''
  keyboardIndex = -1
  displayedNodes = []
  if (filterInputEl) filterInputEl.value = ''
  render()
  renderTreeDropdown()
}

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

function showDropdown() {
  if (!treeDropdownEl) return
  treeDropdownEl.classList.add('show')
  renderTreeDropdown()
}

function hideDropdown() {
  if (!treeDropdownEl) return
  treeDropdownEl.classList.remove('show')
  keyboardIndex = -1
}

function handleFocus() {
  showDropdown()
}

function handleFilter(e) {
  filterKeyword = String(e.target.value || '').toLowerCase()
  selectedNodeId = null
  keyboardIndex = -1
  render()
  if (filterKeyword) showDropdown()
}

function highlightSelectedNode() {
  if (!treeDropdownEl) return
  const nodes = treeDropdownEl.querySelectorAll('.tree-node')
  nodes.forEach((node, index) => {
    if (index === keyboardIndex) {
      node.classList.add('selected')
      node.scrollIntoView({ block: 'nearest' })
    } else {
      node.classList.remove('selected')
    }
  })
}

function handleNodeSelect(nodeId) {
  selectedNodeId = nodeId
  const node = treeNodes.find((n) => n.id === nodeId)
  if (node && filterInputEl) {
    filterInputEl.value = node.key
    filterKeyword = node.key.toLowerCase()
    keyboardIndex = -1
    render()
  }
  hideDropdown()
}

function handleKeydown(e) {
  if (!treeDropdownEl || !treeDropdownEl.classList.contains('show')) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      showDropdown()
    }
    return
  }

  if (e.key === 'ArrowDown') {
    e.preventDefault()
    if (keyboardIndex < displayedNodes.length - 1) {
      keyboardIndex += 1
      highlightSelectedNode()
    }
    return
  }

  if (e.key === 'ArrowUp') {
    e.preventDefault()
    if (keyboardIndex > 0) {
      keyboardIndex -= 1
      highlightSelectedNode()
    }
    return
  }

  if (e.key === 'Enter') {
    e.preventDefault()
    if (keyboardIndex >= 0 && keyboardIndex < displayedNodes.length) {
      handleNodeSelect(displayedNodes[keyboardIndex].id)
    }
    return
  }

  if (e.key === 'Escape') {
    hideDropdown()
    if (filterInputEl) filterInputEl.blur()
  }
}

function renderTreeDropdown() {
  if (!treeDropdownEl) return

  const filtered = filterTreeNodes(filterKeyword)

  if (filtered.length === 0) {
    treeDropdownEl.innerHTML = '<div class="tree-node" style="color:#999;justify-content:center;">暂无匹配节点</div>'
    displayedNodes = []
    return
  }

  displayedNodes = []
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

    displayedNodes.push(node)

    const hasChildren = treeNodes.some((n) => n.parentId === node.id)

    const indentEl = document.createElement('span')
    indentEl.className = 'tree-node-indent'
    indentEl.style.cursor = 'default'
    indentEl.textContent = hasChildren ? '▼' : (depth > 0 ? '•' : '')

    const keyEl = document.createElement('span')
    keyEl.className = 'tree-node-key'
    keyEl.textContent = node.key

    nodeEl.appendChild(indentEl)
    nodeEl.appendChild(keyEl)
    nodeEl.addEventListener('click', () => handleNodeSelect(node.id))

    treeDropdownEl.appendChild(nodeEl)

    if (hasChildren) {
      const children = treeNodes.filter((n) => n.parentId === node.id)
      children.forEach((child) => renderNode(child, depth + 1))
    }
  }

  const roots = filtered.filter((n) => n.level === 0)
  roots.forEach((node) => renderNode(node, 0))

  if (keyboardIndex >= 0) {
    highlightSelectedNode()
  }
}

function initPanel() {
  logContentEl = document.getElementById('logContent')
  filterInputEl = document.getElementById('filterInput')
  clearBtnEl = document.getElementById('clearBtn')
  exportBtnEl = document.getElementById('exportBtn')
  treeDropdownEl = document.getElementById('treeDropdown')

  try {
    port = chrome.runtime.connect({ name: 'console-devtools-panel' })

    port.onMessage.addListener((message) => {
      if (message && message.type === 'BUFFERED_MESSAGES' && Array.isArray(message.data)) {
        messages = messages.concat(message.data)
      } else {
        messages.push(message)
      }
      rebuildTreeNodes()
      render()
      renderTreeDropdown()
    })

    port.onDisconnect.addListener(() => {
      port = null
    })

    port.postMessage({ type: 'PANEL_READY' })
  } catch (err) {
    console.error('[Panel] connect failed:', err)
  }

  if (clearBtnEl) clearBtnEl.addEventListener('click', handleClear)
  if (exportBtnEl) exportBtnEl.addEventListener('click', handleExport)

  if (filterInputEl) {
    filterInputEl.addEventListener('input', handleFilter)
    filterInputEl.addEventListener('focus', handleFocus)
    filterInputEl.addEventListener('blur', () => setTimeout(hideDropdown, 200))
    filterInputEl.addEventListener('keydown', handleKeydown)
  }

  document.addEventListener('click', (e) => {
    const target = e.target
    if (
      filterInputEl &&
      treeDropdownEl &&
      !filterInputEl.contains(target) &&
      !treeDropdownEl.contains(target)
    ) {
      hideDropdown()
    }
  })

  render()
}

document.addEventListener('DOMContentLoaded', initPanel)
