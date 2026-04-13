// content/message-listener.js
(function() {
  'use strict'

  console.log('[Console DevTools] Content script injected')

  // 获取扩展 ID
  const extensionId = chrome.runtime.id

  // 注入外部脚本到页面上下文
  const script = document.createElement('script')
  script.src = chrome.runtime.getURL('content/inject-extension-id.js')
  script.setAttribute('data-extension-id', extensionId)
  document.documentElement.appendChild(script)
  script.remove()

  // 监听页面的 postMessage（兼容旧方式）
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
