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
