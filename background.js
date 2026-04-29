// background.js
console.log('[Console DevTools] Background script started')

// 存储消息缓存（当 panel 未打开时）
let messageBuffer = []
const MAX_BUFFER_SIZE = 100

// 当前的 panel 连接
let panelPort = null

function isArrayPayload(payload) {
  return Array.isArray(payload)
}

function bufferMessage(message) {
  if (messageBuffer.length >= MAX_BUFFER_SIZE) {
    messageBuffer.shift()
  }
  messageBuffer.push(message)
  console.log('[Background] Message buffered, total:', messageBuffer.length)
}

function clearPanelPort(port) {
  if (!port || panelPort === port) {
    panelPort = null
  }
}

function forwardToPanel(message) {
  if (!panelPort) {
    return false
  }

  try {
    panelPort.postMessage(message)
    console.log('[Background] Forwarded successfully')
    return true
  } catch (error) {
    console.error('[Background] Forward failed:', error)
    clearPanelPort(panelPort)
    return false
  }
}

// 监听 content script 的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('[Background] Received message:', request.type, request.data ? 'with data' : 'no data', 'from:', sender.tab?.id || 'devtools')
  if (request.type === 'CONSOLE_DEVTOOLS_CONTENT_READY') {
    console.log('[Console DevTools] Content script ready')
    sendResponse({ status: 'ok' })
  } else if (request.type === 'CONSOLE_DEVTOOLS_MESSAGE') {
    console.log('[Background] Message received, panelPort:', panelPort ? 'connected' : 'not connected', 'buffer size:', messageBuffer.length)
    // 忽略数组类型的 payload
    if (isArrayPayload(request.data)) {
      console.warn('[Background] Ignore array payload from runtime message')
      sendResponse({ status: 'ignored-array' })
      return true
    }

    // 如果有 panel 连接，直接转发
    if (panelPort) {
      console.log('[Background] Forwarding to panel')
      if (!forwardToPanel(request.data)) {
        bufferMessage(request.data)
      }
    } else {
      // 否则缓存消息
      bufferMessage(request.data)
    }
    sendResponse({ status: 'ok' })
  }
  return true // 保持消息通道开启
})

// 监听 panel 连接（内部连接）
chrome.runtime.onConnect.addListener((port) => {
  console.log('[Background] onConnect:', port.name)
  if (port.name === 'console-devtools-panel') {
    console.log('[Console DevTools] Panel connected')
    panelPort = port

    // 发送缓存的消息
    if (messageBuffer.length > 0) {
      console.log('[Background] Sending buffered messages:', messageBuffer.length)
      port.postMessage({
        type: 'BUFFERED_MESSAGES',
        data: messageBuffer
      })
      messageBuffer = []
    }

    // 监听 panel 断开
    port.onDisconnect.addListener(() => {
      console.log('[Console DevTools] Panel disconnected')
      clearPanelPort(port)
    })
  }
})

// 监听来自外部页面的连接（externally_connectable 配置后生效）
chrome.runtime.onConnectExternal.addListener((port) => {
  console.log('[Background] onConnectExternal:', port.name, 'from tab:', port.sender?.tab?.id)

  if (port.name === 'console-devtools') {
    console.log('[Console DevTools] Page connected, panelPort status:', panelPort ? 'connected' : 'not connected')

    // 监听页面消息并转发给 panel
    port.onMessage.addListener((message) => {
      console.log('[Background] Message from page:', JSON.stringify(message).slice(0, 100))
      // 忽略数组类型的 payload
      if (isArrayPayload(message)) {
        console.warn('[Background] Ignore array payload from external page')
        return
      }

      if (panelPort) {
        console.log('[Background] Forwarding to panel')
        if (!forwardToPanel(message)) {
          bufferMessage(message)
        }
      } else {
        // 缓存消息
        bufferMessage(message)
      }
    })

    port.onDisconnect.addListener(() => {
      console.log('[Console DevTools] Page disconnected')
    })
  }
})
