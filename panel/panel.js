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

  function buildChildren(nodeData, parentId, level, parentStableKey, msgIndex) {
    getChildEntries(nodeData).forEach(([key, childMsg]) => {
      // 加入 msgIndex 让相同内容的节点能够区分
      const stableKey = `${msgIndex}|${parentStableKey}|${level}|${key}|${childMsg.path || ''}`
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
          childrenIds: new Set(),
          msgIndex // 记录来自第几条消息
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

      buildChildren(childMsg, nodeId, level + 1, parentStableKey, msgIndex)
    })
  }

  // 为每条消息添加唯一索引
  messages.forEach((msg, msgIndex) => {
    buildChildren(msg, null, 0, 'root', msgIndex)
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

function createLogNode(message, level, keyword = '', selectedNode = null, currentMsgIndex = 0) {
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

    // 检查是否是选中的节点：匹配 msgIndex、key 和 path
    const isSelected = selectedNode &&
      currentMsgIndex === selectedNode.msgIndex &&
      key === selectedNode.key &&
      (childMsg.path || '') === (selectedNode.path || '')

    if (isSelected) {
      itemEl.classList.add('log-item-selected')
    }

    const headerEl = document.createElement('div')
    headerEl.className = 'log-item-header'
    headerEl.style.paddingLeft = `${level * 16 + 8}px`

    const iconEl = document.createElement('span')
    iconEl.className = 'expand-icon'
    iconEl.textContent = '▼'

    const keyEl = document.createElement('span')
    keyEl.className = 'log-key'
    keyEl.textContent = key

    // path 值
    const pathValue = childMsg.path || ''

    headerEl.appendChild(iconEl)
    headerEl.appendChild(keyEl)

    // 如果有 path，显示在 key 右边
    if (pathValue) {
      const pathSeparatorEl = document.createElement('span')
      pathSeparatorEl.className = 'log-path-separator'
      pathSeparatorEl.textContent = ' › '

      const pathEl = document.createElement('span')
      pathEl.className = 'log-path-value'
      pathEl.textContent = pathValue

      const copyBtn = document.createElement('button')
      copyBtn.className = 'copy-btn-inline'
      copyBtn.textContent = '复制'
      copyBtn.addEventListener('click', (e) => {
        e.stopPropagation()
        navigator.clipboard.writeText(pathValue).then(() => {
          copyBtn.textContent = '已复制'
          setTimeout(() => {
            copyBtn.textContent = '复制'
          }, 1000)
        })
      })

      headerEl.appendChild(pathSeparatorEl)
      headerEl.appendChild(pathEl)
      headerEl.appendChild(copyBtn)
    }

    const contentEl = document.createElement('div')
    contentEl.className = 'log-item-content'
    contentEl.style.display = 'block'

    if (isObject(childMsg.params) && Object.keys(childMsg.params).length > 0) {
      const paramsRowEl = document.createElement('div')
      paramsRowEl.className = 'log-row'
      paramsRowEl.style.flexDirection = 'column'
      paramsRowEl.style.alignItems = 'flex-start'

      const paramsLabelEl = document.createElement('span')
      paramsLabelEl.className = 'log-label'
      paramsLabelEl.textContent = 'params:'

      const paramsPreEl = document.createElement('pre')
      paramsPreEl.className = 'log-json'
      paramsPreEl.textContent = JSON.stringify(childMsg.params, null, 2)

      // 检查是否需要展开按钮
      const MAX_HEIGHT = 500
      const isOverflow = paramsPreEl.scrollHeight > MAX_HEIGHT

      paramsRowEl.appendChild(paramsLabelEl)
      paramsRowEl.appendChild(paramsPreEl)

      if (isOverflow) {
        paramsPreEl.style.maxHeight = `${MAX_HEIGHT}px`
        paramsPreEl.style.overflow = 'hidden'
        paramsPreEl.classList.add('log-json-collapsed')

        // 创建展开按钮
        const expandBtn = document.createElement('button')
        expandBtn.className = 'expand-content-btn'
        expandBtn.innerHTML = '▼ 展开'
        expandBtn.addEventListener('click', (e) => {
          e.stopPropagation()
          const isCollapsed = paramsPreEl.classList.contains('log-json-collapsed')
          if (isCollapsed) {
            paramsPreEl.classList.remove('log-json-collapsed')
            paramsPreEl.style.maxHeight = 'none'
            expandBtn.innerHTML = '▲ 收起'
            expandBtn.classList.add('expanded')
          } else {
            paramsPreEl.classList.add('log-json-collapsed')
            paramsPreEl.style.maxHeight = `${MAX_HEIGHT}px`
            expandBtn.innerHTML = '▼ 展开'
            expandBtn.classList.remove('expanded')
            // 滚动到可视区域
            paramsPreEl.scrollIntoView({ behavior: 'smooth', block: 'start' })
          }
        })

        paramsRowEl.appendChild(expandBtn)
      }

      contentEl.appendChild(paramsRowEl)
    }

    if (getChildEntries(childMsg).length > 0) {
      contentEl.appendChild(createLogNode(childMsg, level + 1, keyword, selectedNode, currentMsgIndex))
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

  // 优先使用选中节点筛选，其次使用关键字筛选
  if (selectedNodeId) {
    const selectedNode = treeNodes.find((n) => n.id === selectedNodeId)
    if (selectedNode) {
      // 只显示选中节点所在的消息（通过 msgIndex 过滤）
      filtered = filtered.filter((msg, msgIndex) => msgIndex === selectedNode.msgIndex)
    }
  } else if (filterKeyword) {
    filtered = filtered.filter((msg) => containsKeyword(msg, filterKeyword))
  }

  if (filtered.length === 0) {
    logContentEl.innerHTML = `<div class="empty-state">${messages.length === 0 ? '暂无日志数据' : '未找到匹配节点'}</div>`
    return
  }

  // 获取选中的节点对象用于高亮
  let selectedNode = null
  if (selectedNodeId) {
    selectedNode = treeNodes.find((n) => n.id === selectedNodeId)
  }

  logContentEl.innerHTML = ''
  filtered.forEach((msg, msgIndex) => {
    logContentEl.appendChild(createLogNode(msg, 0, filterKeyword, selectedNode, msgIndex))
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

function handleCopyJson() {
  if (messages.length === 0) {
    alert('暂无数据可复制')
    return
  }
  const data = JSON.stringify(messages, null, 2)
  navigator.clipboard.writeText(data).then(() => {
    const originalText = exportBtnEl.textContent
    exportBtnEl.textContent = '已复制!'
    exportBtnEl.disabled = true
    setTimeout(() => {
      exportBtnEl.textContent = originalText
      exportBtnEl.disabled = false
    }, 1500)
  }).catch((err) => {
    console.error('[Panel] 复制失败:', err)
    alert('复制失败，请重试')
  })
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
    filterKeyword = '' // 清空筛选关键字，显示完整树
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

  connectToBackground()

  if (clearBtnEl) clearBtnEl.addEventListener('click', handleClear)
  if (exportBtnEl) exportBtnEl.addEventListener('click', handleCopyJson)

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

// 连接到 background script（支持重连）
function connectToBackground() {
  if (port) {
    try {
      port.disconnect()
    } catch (e) {}
  }

  try {
    port = chrome.runtime.connect({ name: 'console-devtools-panel' })
    console.log('[Panel] Connected to background')

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
      console.log('[Panel] Disconnected from background')
      port = null
      // 1 秒后尝试重连
      setTimeout(() => {
        if (!port) {
          console.log('[Panel] Attempting to reconnect...')
          connectToBackground()
        }
      }, 1000)
    })

    port.postMessage({ type: 'PANEL_READY' })
  } catch (err) {
    console.error('[Panel] Connect failed:', err)
    // 连接失败后 2 秒重试
    setTimeout(() => {
      if (!port) {
        connectToBackground()
      }
    }, 2000)
  }
}

document.addEventListener('DOMContentLoaded', initPanel)
