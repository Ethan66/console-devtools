<template>
  <div class="console-devtools">
    <header class="header">
      <h1>Console DevTools</h1>
    </header>
    <main class="main">
      <div class="control-panel">
        <input
          v-model="filterKeyword"
          type="text"
          placeholder="输入关键字筛选..."
          class="filter-input"
        />
        <button @click="handleClearTree" class="btn btn-danger">清空树结构</button>
        <button @click="handleExportJson" class="btn btn-primary">导出JSON</button>
      </div>
      <div class="log-container">
        <div v-if="filteredMessages.length === 0" class="empty-state">
          {{ messages.length === 0 ? '暂无日志数据' : '未找到匹配的节点' }}
        </div>
        <div v-else class="log-tree">
          <log-node
            v-for="(msg, index) in filteredMessages"
            :key="index"
            :message="msg"
          />
        </div>
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import type { LogMessage } from './types'
import LogNode from './components/LogNode.vue'

const messages = ref<LogMessage[]>([])
const filterKeyword = ref('')

let backgroundPort: chrome.runtime.Port | null = null

onMounted(() => {
  // 连接到 background script
  backgroundPort = chrome.runtime.connect({ name: 'console-devtools-panel' })

  backgroundPort.onMessage.addListener((message) => {
    if (message.type === 'BUFFERED_MESSAGES') {
      messages.value = [...messages.value, ...message.data]
    } else {
      // 单条消息
      messages.value.push(message)
    }
  })
})

onUnmounted(() => {
  if (backgroundPort) {
    backgroundPort.disconnect()
  }
})

const filteredMessages = computed(() => {
  if (!filterKeyword.value) {
    return messages.value
  }
  return messages.value.filter(msg =>
    containsKeyword(msg, filterKeyword.value)
  )
})

function containsKeyword(msg: LogMessage, keyword: string): boolean {
  // 递归检查是否包含关键字
  const keys = Object.keys(msg.zfn || {})
  return keys.some(key => key.toLowerCase().includes(keyword.toLowerCase()))
}

function handleClearTree() {
  messages.value = []
}

function handleExportJson() {
  if (filteredMessages.value.length === 0) {
    alert('暂无数据可导出')
    return
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5)
  const filename = `console-devtools-${timestamp}.json`
  const data = JSON.stringify(filteredMessages.value, null, 2)
  const blob = new Blob([data], { type: 'application/json' })
  const url = URL.createObjectURL(blob)

  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
</script>

<style scoped>
.console-devtools {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #f5f5f5;
}

.header {
  padding: 12px 16px;
  background: #fff;
  border-bottom: 1px solid #e0e0e0;
}

.header h1 {
  font-size: 16px;
  font-weight: 600;
  color: #333;
}

.main {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.control-panel {
  padding: 12px 16px;
  background: #fff;
  border-bottom: 1px solid #e0e0e0;
  display: flex;
  gap: 8px;
  align-items: center;
}

.filter-input {
  flex: 1;
  padding: 6px 12px;
  border: 1px solid #d0d0d0;
  border-radius: 4px;
  font-size: 13px;
}

.btn {
  padding: 6px 12px;
  border: none;
  border-radius: 4px;
  font-size: 13px;
  cursor: pointer;
  white-space: nowrap;
}

.btn-primary {
  background: #1976d2;
  color: white;
}

.btn-danger {
  background: #d32f2f;
  color: white;
}

.log-container {
  flex: 1;
  overflow: auto;
  padding: 16px;
}

.empty-state {
  text-align: center;
  padding: 40px;
  color: #999;
}
</style>
