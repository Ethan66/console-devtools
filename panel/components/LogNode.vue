<template>
  <div class="log-node">
    <div
      v-for="(childMsg, key) in message.zfn"
      :key="key"
      class="log-item"
    >
      <div
        class="log-item-header"
        :style="{ paddingLeft: `${level * 16 + 8}px` }"
        @click="toggleExpand(key)"
      >
        <span class="expand-icon">
          {{ expandedKeys.has(key) ? '▼' : '▶' }}
        </span>
        <span class="log-key">{{ key }}</span>
      </div>

      <div v-if="expandedKeys.has(key)" class="log-item-content">
        <div class="log-row">
          <span class="log-label">path:</span>
          <span class="log-value">{{ childMsg.path }}</span>
          <button @click.stop="copyPath(childMsg.path)" class="copy-btn">
            复制
          </button>
        </div>

        <div v-if="childMsg.params && Object.keys(childMsg.params).length > 0" class="log-row">
          <span class="log-label">params:</span>
          <pre class="log-json">{{ JSON.stringify(childMsg.params, null, 2) }}</pre>
        </div>

        <log-node
          v-if="childMsg.zfn && Object.keys(childMsg.zfn).length > 0"
          :message="childMsg"
          :level="level + 1"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import type { LogMessage } from '../types'

interface Props {
  message: LogMessage
  level?: number
}

const props = withDefaults(defineProps<Props>(), {
  level: 0
})

const expandedKeys = ref<Set<string>>(new Set())

function toggleExpand(key: string) {
  if (expandedKeys.value.has(key)) {
    expandedKeys.value.delete(key)
  } else {
    expandedKeys.value.add(key)
  }
}

async function copyPath(path: string) {
  try {
    await navigator.clipboard.writeText(path)
    console.log('已复制:', path)
  } catch (err) {
    alert('复制失败，请手动复制')
  }
}
</script>

<style scoped>
.log-node {
  font-size: 12px;
}

.log-item {
  margin-bottom: 4px;
}

.log-item-header {
  display: flex;
  align-items: center;
  padding: 4px 0;
  cursor: pointer;
  user-select: none;
}

.log-item-header:hover {
  background: #f0f0f0;
}

.expand-icon {
  display: inline-block;
  width: 16px;
  text-align: center;
  color: #666;
  font-size: 10px;
}

.log-key {
  color: #1976d2;
  font-weight: 500;
}

.log-item-content {
  padding: 4px 0;
  border-left: 1px solid #e0e0e0;
  margin-left: 24px;
}

.log-row {
  display: flex;
  padding: 4px 8px;
  align-items: flex-start;
}

.log-label {
  color: #666;
  min-width: 60px;
  flex-shrink: 0;
}

.log-value {
  color: #333;
  word-break: break-all;
}

.copy-btn {
  margin-left: auto;
  padding: 2px 8px;
  background: #1976d2;
  color: white;
  border: none;
  border-radius: 3px;
  font-size: 11px;
  cursor: pointer;
}

.copy-btn:hover {
  background: #1565c0;
}

.log-json {
  margin: 0;
  padding: 4px 8px;
  background: #f5f5f5;
  border-radius: 3px;
  font-size: 11px;
  overflow-x: auto;
}
</style>
