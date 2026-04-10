console.log('[DevTools] 页面已加载');

document.addEventListener('DOMContentLoaded', function() {
  console.log('[DevTools] DOM 已加载');

  // 更新时间
  const timeSpan = document.getElementById('time');
  if (timeSpan) {
    timeSpan.textContent = new Date().toLocaleString();
  }

  // 更新状态
  const statusEl = document.getElementById('status');
  if (statusEl) {
    statusEl.textContent = '✅ DevTools 初始化成功！';
  }

  // 创建面板 - 使用原生 JavaScript 版本（避免 Vue 的 CSP 问题）
  chrome.devtools.panels.create(
    'Console DevTools',
    '',
    'panel/index.native.html',
    function(panel) {
      console.log('[DevTools] 面板已创建');

      panel.onShown.addListener(function(window) {
        console.log('[DevTools] 面板已显示');
        if (statusEl) {
          statusEl.textContent = '✅ Console DevTools 面板已显示！请在标签页中查看。';
        }
      });

      panel.onHidden.addListener(function() {
        console.log('[DevTools] 面板已隐藏');
      });
    }
  );
});

function testPanel() {
  alert('DevTools 页面功能正常！Console DevTools 标签应该已经在开发者工具中出现了。');
}
