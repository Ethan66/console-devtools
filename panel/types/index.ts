// panel/types/index.ts

// 单条消息数据结构
export interface LogMessage {
  params: any
  path: string
  api: string[]
  zfn: Record<string, LogMessage>
}

// 扁平化的树节点（用于下拉选项）
export interface TreeNode {
  id: string                    // 唯一标识
  key: string                   // 原始 key 名称，也是显示文本
  path: string                  // 源码路径
  level: number                 // 层级深度
  parentId?: string             // 父节点 id
  children?: TreeNode[]         // 子节点
  originalData: LogMessage      // 原始数据
  expanded?: boolean            // 是否展开
}

// 面板状态
export interface PanelState {
  messages: LogMessage[]              // 所有接收到的消息
  filteredMessages: LogMessage[]      // 过滤后的消息
  selectedNodeId: string | null       // 当前选中的节点 id
  filterKeyword: string               // 过滤关键字
  treeNodes: TreeNode[]               // 下拉选项树
}
