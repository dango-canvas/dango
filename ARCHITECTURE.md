# Dango 架构设计与模块索引 (ARCHITECTURE.md)

本文档旨在梳理 Dango 画布系统的代码架构、模块职责边界、核心数据流向与常见缺陷速查路径。无论是人类开发者还是 AI 协作伙伴，在进行任何代码修改前，均可通过本文档实现**秒级精确定位**，避免盲目跨文件检索。

---

## 一、架构总览与核心约束

Dango 遵循**轻量、优雅、高帧率（120Hz）、零外部运行时依赖（Zero-Dependency）**的单文件分发原则：
1. **单向数据流与单例状态**：全局状态集中收敛在 `state.ts`，视图层由 `render.ts` 纯粹根据 `state` 数据派生；
2. **高性能渲染管道**：平移、缩放与拖拽仅操作 CSS `transform` 或轻量修改，避免在高频帧循环中进行 `JSON.stringify` 或重度写盘；
3. **离散保存与确定性提交**：`saveData()` 严格收敛在编辑提交（`finishEdit`）、撤销重做（`undo/redo`）、离散动作（对齐、增删）及拖拽抬手（`mouseup`）时刻。

---

## 二、源码拓扑目录

```text
dango/
├── index.html              # 应用单页模板与基础 DOM 骨架
├── manifest.json           # Web Extension 清单与版本号基准（version anchor）
├── css/
│   ├── main.css            # 样式入口，集中引入 partials
│   └── partials/
│       ├── _variables.css  # 主题变量、调色板、圆角、阴影、层级 z-index 定义
│       ├── _base.css       # 基础重置、body、高分屏抗锯齿
│       ├── _canvas.css     # 画布核心：图元节点 (.node)、连线、组、对齐参考线
│       ├── _ui.css         # 悬浮控制条 (.dock)、操作按钮、工具提示、Hint 气泡
│       ├── _states.css     # 状态类：聚焦模式 (.spotlight)、演讲模式、标记模式
│       ├── _modals.css     # 弹窗体系：设置面板、导出面板、关于面板、搜索栏
│       └── _embed.css      # iframe 嵌入模式与响应式自适应规则
└── js/
    ├── main.ts             # 应用启动器、DOM 就绪编排与顶层生命周期调度
    └── modules/            # 职责单一的功能模块集合（详见下方速查字典）
```

---

## 三、模块职责速查字典 (Module Matrix)

| 模块文件 | 核心职责 (Responsibilities) | 关键入口函数 / 数据 | 绝不管辖 (Out of Scope) |
| :--- | :--- | :--- | :--- |
| **`state.ts`** | 全局唯一状态源、历史栈（Undo/Redo）、持久化序列化与反序列化 | `state`, `pushHistory()`, `undo()`, `redo()`, `saveData()`, `loadData()` | DOM 事件监听、视图渲染 |
| **`types.ts`** | 全局核心数据类型定义（Node, Group, Link, ViewState） | `CanvasNode`, `CanvasGroup`, `CanvasLink`, `AppState` | 任何具体业务执行代码 |
| **`dom.ts`** | 核心 DOM 节点缓存字典与轻量选择器辅助工具 | `els` (缓存常用容器), `getStandardRect()` | 复杂业务逻辑与事件绑定 |
| **`render.ts`** | 视图渲染派生引擎、Markdown 标签解析、节点尺寸物理同步 | `render()`, `renderNode()`, `renderLinks()`, `parseMarkdown()` | 用户输入监听、直接写盘 |
| **`interactions.ts`** | 鼠标/触屏画布手势、节点拖拽、**节点文本编辑生命周期**、微磁吸附计算 | `initInteractions()`, `handleNodeEdit()`, `finishEdit()`, `calculateMagneticSnap()` | 弹窗控件管理、快捷键分发 |
| **`shortcuts.ts`** | 全局键盘快捷键分发中心、编辑态按键拦截守卫 | `initShortcuts()`, 模式按键路由 (T/P/F) | 具体业务执行逻辑（委托给 action） |
| **`actions.ts`** | 离散节点动作：排列分布、对齐算法、成组解组、树状拓扑布局 | `alignSelection()`, `distributeSelection()`, `groupSelection()`, `autoLayout()` | 画布连续平移/缩放 |
| **`dock.ts`** | 底部悬浮工具栏 (Dock) 的 DOM 生成、展开/隐藏折叠、移动端避让 | `updateFloatingDock()`, `toggleFloatingDock()`, `initFloatingDock()` | 模态弹窗内容渲染 |
| **`view.ts`** | 视口相机变换矩阵、屏幕坐标与世界坐标互转、平滑镜头跟焦 | `screenToWorld()`, `worldToScreen()`, `animateView()`, `centerView()` | 节点增删改查 |
| **`links.ts`** | 节点间连线几何交点计算、水墨曲线 / 贝塞尔波浪曲线生成 | `getEdgeIntersection()`, `buildAutoCurveLinkPath()`, `buildWavyLinkPath()` | 连线点击事件绑定 |
| **`presenter.ts`** | 演示模式 (P) 与步骤标记模式 (T) 的生命周期与步进控制 | `initPresenter()`, `nextStep()`, `prevStep()`, `tagItemDirect()` | 普通编辑交互 |
| **`hints.ts`** | 键盘流 Hint 模式（单键跳转节点并聚焦） | `toggleHintMode()`, `handleHintKeyDown()` | 节点拖动 |
| **`search.ts`** | 节点全局文本检索、关键词高亮与聚焦跳转 | `initSearch()`, `highlightMatch()` | 节点物理属性修改 |
| **`ui.ts`** | 模态框逻辑（设置/导出/关于）、主题切换、右键上下文菜单 | `initUI()`, `openModal()`, `setTheme()` | 画布图元拖拽 |
| **`io.ts`** | 画布序列化导出（PNG/SVG/JSON/Markdown）与零配置智能文件名推断 | `exportCanvas()`, `sanitizeFilenameTitle()`, `importData()` | 状态撤销重做管理 |
| **`fps.ts`** | 120Hz 帧率监控仪表、1% Low 计算、Frametime Sparkline 绘制 | `initFPS()`, `updateFPS()` | 业务性能埋点 |
| **`directional.ts`**| 方向键 (`ArrowKeys`) 在卡片拓扑间的焦点跳转计算 | `handleDirectionalNavigation()` | 节点位置拖动 |
| **`animation.ts`** | 连线墨流动画、节点弹性下落贝塞尔动画辅助器 | 动画曲线与 GPU 关键帧类注入 | 静态布局逻辑 |
| **`utils.ts`** | 纯几何/数学函数、UUID 生成、中文 Markdown 符号归一化 | `uid()`, `normalizeChineseMarkdownPrefix()` | 有副作用的状态依赖 |
| **`i18n.ts`** | 国际化双语字典（中/英）与切换处理器 | `t()`, `setLanguage()` | 业务具体文本 hardcode |

---

## 四、核心生命周期与数据流向

### 1. 节点编辑与持久化闭环 (Node Lifecycle)
```text
双击画布 / 快捷键回车
    │
    ▼
interactions.ts: handleNodeEdit()
    │  ├─ 节点增加 .editing 类，启用 contenteditable="true"
    │  └─ CSS 生效: white-space: pre (保证换行稳定，拒绝软折行)
    ▼
用户输入文本 (可含 Shift+Enter 换行)
    │
    ▼
按 Enter 或失焦 (Blur)
    │
    ▼
interactions.ts: finishEdit()
    │  ├─ [关键步骤 1] 先提取 nodeEl.innerText (保持换行符不被 nowrap 吞噬)
    │  ├─ [关键步骤 2] nodeEl.contentEditable = 'false' 并移除 .editing
    │  ├─ [关键步骤 3] 数据同步到 state.nodes[i].text
    │  ├─ [关键步骤 4] commitNodeDisplayGeometry() 同步实际尺寸 (node.w / node.h)
    │  └─ [关键步骤 5] 调用 pushHistory() (压入历史栈并自动触发 saveData() 写盘)
    ▼
render.ts: renderNode() -> 解析 parseMarkdown() 渲染为带 <br> 的 HTML
```

### 2. 几何变形与对齐闭环 (Transformed Geometry)
- **普通节点**：由纯文本内容撑开宽度，单行居中，多行贴左（`.has-multiline`）；
- **链接节点**：若识别为合规 URL，DOM 变形为胶囊（`.is-link`，最大宽度 240px，带图标）。`renderNode()` 会强制重置并同步胶囊真实 `offsetWidth / offsetHeight` 回写到 `node.w / node.h`；
- **图片节点**：带有 `.image-node` 与 `box-sizing: border-box`，初始按正方形占位，图片加载完成后同步宽高比例；
- **对齐与对齐线**：`actions.ts: alignSelection()` 与 `interactions.ts: calculateMagneticSnap()` 均依赖 `node.x + node.w / 2` 与 `node.y + node.h / 2`。**必须确保 `node.w` 与 `node.h` 与 DOM 实际渲染边界 100% 同步**。

### 3. 视口变换与坐标系 (Coordinate System)
- **世界坐标（World Space）**：保存在数据模型中的原始坐标（`node.x`, `node.y`）；
- **屏幕坐标（Screen Space）**：浏览器视口与鼠标事件的绝对像素（`e.clientX`, `e.clientY`）；
- **换算桥梁**：
  $$\text{worldX} = \frac{\text{clientX} - \text{state.view.x}}{\text{state.view.scale}}$$
  $$\text{clientX} = \text{worldX} \cdot \text{state.view.scale} + \text{state.view.x}$$
  统一调用 `view.ts: screenToWorld()` 与 `worldToScreen()`，切忌在各处手工重写换算。

---

## 五、样式分层规范 (CSS Architecture)

1. **`_variables.css`**：设计 Token（`--c-white-bg`, `--c-white-border`, `--select-color`, `--node-shadow`）；
2. **`_canvas.css`**：
   - `.node`：基础卡片（默认 `white-space: nowrap; line-height: 1.44;`）；
   - `.node.editing`：编辑态（`white-space: pre !important; text-align: center;`）；
   - `.node.has-multiline`：多行卡片（`text-align: left;`）；
   - `.node.editing.has-multiline`：多行编辑态（`white-space: pre !important; text-align: left !important;`）；
   - `.node.is-link`：链接胶囊（固定高度与内边距）；
   - `.node.image-node`：图片卡片（`box-sizing: border-box;`）；
3. **`_ui.css`**：浮动栏、提示气泡、按钮、图标；
4. **`_states.css`**：特殊场景（`.presentation-hidden`, `.spotlight-active`）。

---

## 六、常见缺陷秒级定位索引 (Troubleshooting Map)

| 遇到的现象 / 需求 | 优先排查文件与关键位置 |
| :--- | :--- |
| **编辑文字时排版跳变、折行、光标乱跳** | `_canvas.css` (`.node.editing`)、`interactions.ts` (`handleNodeEdit`, `finishEdit`) |
| **换行消失、Shift+Enter 无法换行** | `interactions.ts` (`finishEdit` 提取 `innerText` 时序)、`render.ts` (`parseMarkdown`) |
| **悬浮工具栏 (Dock) 显示异常、按钮缺失、状态未同步** | `dock.ts` (`updateFloatingDock`, `toggleFloatingDock`)、`ui.ts` (设置面板切换) |
| **对齐/微磁吸参考线偏离、非对称节点对不齐** | `render.ts` (`renderNode` 尺寸回写)、`actions.ts` (`alignSelection`)、`interactions.ts` (`calculateMagneticSnap`) |
| **新建或修改的节点刷新页面后消失** | `state.ts` (`pushHistory`, `saveData`)、`interactions.ts` (`finishEdit`, `pagehide` 兜底) |
| **快捷键冲突、按键在特定模式未响应** | `shortcuts.ts` (`initShortcuts` 编辑态守卫 `isEditing`) |
| **连线穿透、端点交点偏移、贝塞尔曲率异常** | `links.ts` (`getEdgeIntersection`, `buildAutoCurveLinkPath`) |
| **缩放/平移视口漂移、移动端双指缩放中心偏移** | `view.ts` (`zoomBy`, `screenToWorld`)、`interactions.ts` (`touchstart/touchmove`) |
| **多语言文案缺失或翻译错误** | `i18n.ts` (`LANGUAGES.zh / en`) |
| **导出文件名异常、导出卡片裁切** | `io.ts` (`sanitizeFilenameTitle`, `exportCanvas`) |
| **构建或产物异常** | `build.ts` (Bun 单文件内联打包逻辑)、`manifest.json` |

---

## 七、协作守则 (Collaborative Rules)

- 修改任何几何或交互前，优先运行 `bun test` 确认基准测试全绿；
- 遵循《AGENTS.md》的“局部化与意图保留”原则，保留代码原有注释与边界兜底；
- 若新增模块或重构核心流程，必须同步维护本文档的模块速查表与数据流图。
