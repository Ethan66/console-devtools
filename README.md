# Console DevTools

一个 Chrome 扩展程序，用于在开发者工具中过滤和展示嵌套的日志数据。

## 功能特性

- ✅ 通过 postMessage 接收嵌套日志数据
- ✅ 树形展示日志结构
- ✅ 关键字过滤
- ✅ 复制路径
- ✅ 导出 JSON
- ✅ 清空树结构

## 安装

### 1. 构建项目

```bash
# 安装依赖
yarn install

# 构建
yarn build
```

### 2. 生成图标

在浏览器中打开 `icon-generator.html`，下载三个尺寸的图标：
- `icon16.png` - 放到 `icons/` 目录
- `icon48.png` - 放到 `icons/` 目录
- `icon128.png` - 放到 `icons/` 目录

### 3. 加载扩展

1. 打开 Chrome，访问 `chrome://extensions/`
2. 启用"开发者模式"
3. 点击"加载已解压的扩展程序"
4. 选择项目目录

## 使用方法

### 测试扩展

1. 打开项目中的 `test.html` 页面
2. 打开开发者工具（F12）
3. 切换到"Console DevTools"面板
4. 点击页面上的"发送测试消息"按钮
5. 在面板中查看过滤后的日志

### 在你的项目中使用

在你的页面中通过 postMessage 发送日志数据：

```javascript
window.postMessage({
  params: { /* 参数 */ },
  path: "文件路径:行号",
  zfn: {
    functionName: {
      params: { /* 参数 */ },
      path: "文件路径:行号",
      zfn: { /* 子函数 */ }
    }
  }
}, '*')
```

## 消息格式

```typescript
interface LogMessage {
  params: any        // 函数参数
  path: string       // 源码路径（格式: "文件路径:行号"）
  zfn: Record<string, LogMessage>  // 子函数对象
}
```

## 开发

```bash
# 安装依赖
yarn install

# 开发模式
yarn dev

# 构建
yarn build

# 类型检查
yarn type-check
```

## 技术栈

- Chrome Extension API
- Vue 3 (Composition API)
- TypeScript
- Vite

## 项目结构

```
console-devtools/
├── manifest.json          # Chrome 扩展配置
├── background.js          # 后台服务，消息中转
├── content/
│   └── message-listener.js  # 内容脚本，监听 postMessage
├── panel/                 # DevTools 面板
│   ├── devtools.html      # DevTools 页面
│   ├── devtools.js        # 创建面板
│   ├── index.html         # 面板入口
│   ├── main.ts            # Vue 应用入口
│   ├── App.vue            # 主组件
│   ├── components/
│   │   └── LogNode.vue    # 日志节点组件
│   └── types/
│       └── index.ts       # TypeScript 类型定义
├── test.html              # 测试页面
├── icon-generator.html    # 图标生成器
└── icons/                 # 扩展图标
```

## License

MIT
