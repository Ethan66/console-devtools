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
