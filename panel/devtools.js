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
