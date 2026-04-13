// content/inject-extension-id.js
// 这个脚本由 content script 动态注入到页面，用于传递扩展 ID

(function() {
  'use strict'

  // 从 script 标签的 data 属性获取扩展 ID
  const script = document.currentScript
  const extensionId = script?.getAttribute('data-extension-id')

  if (!extensionId) {
    console.error('[InjectExtensionId] 未找到扩展 ID')
    return
  }

  // 注入到页面 window 对象
  window.__CONSOLE_DEVTOOLS_EXTENSION_ID__ = extensionId

  // 派发事件通知页面脚本
  window.dispatchEvent(new CustomEvent('console-devtools-ready', {
    detail: { extensionId: extensionId }
  }))

  console.log('[InjectExtensionId] Extension ID injected:', extensionId)
})()
