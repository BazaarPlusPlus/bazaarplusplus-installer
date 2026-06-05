# Native-Feel 前端评审报告

> **范围**：`bazaarplusplus-installer` 前端（React 19 + Tailwind v4 + react-router 7 + Tauri 2，约 4,300 行）
> **评审基准**：`master` @ `2d05f9e`（*Fix install status cards overflowing…*，2026-06-04），工作树干净
> **评审日期**：2026-06-05
> **评审标准**：[`native-feel-skill`](https://github.com/yetone/native-feel-skill) —— 8 条架构 tenet、`06-native-conventions.md` 审计项、`ship-readiness.md` 75 项清单、`03-webview-survival.md` WebView 陷阱
> **取证原则**：所有结论以代码为准，逐条标注 `文件:行号`，可对照上述 commit 复现
> **Resolution note（2026-06-05）**：这是针对基准 commit 的点状评审，不是实时缺陷清单；后续改动需要重新按当前代码取证。

本报告把 native-feel 标准逐条对照真实代码，覆盖六个维度：视觉设计、布局结构、交互体验、组件设计、性能表现、可访问性。

## 目录

- [0. 评审定位](#0-评审定位)
- [1. 最关键的发现](#1-最关键的发现)
- [2. 做得好的地方](#2-做得好的地方)
- [3. 分维度详评](#3-分维度详评)
- [4. 改进清单（P0 / P1 / P2）](#4-改进清单p0--p1--p2)
- [5. Ship-Readiness 对照](#5-ship-readiness-对照)
- [附录 A：对比度实测](#附录-a对比度实测)
- [附录 B：评审覆盖的文件](#附录-b评审覆盖的文件)

---

## 0. 评审定位

这是一个**刻意主题化**的游戏安装器（《The Bazaar》的中世纪金羊皮纸风格），目标不是伪装成"标准 Mac/Windows 应用"。因此 native-feel 中的标准要分两类对待：

- **审美类条款**（系统字体 / 系统强调色 / 系统材质 / 跟随系统亮暗）——对本项目属于**有意取舍**，标注 `[意图取舍]`，不计为缺陷。
- **行为 / 可用性类条款**（光标、文本选择、Escape、焦点管理、对比度、减少动效）——无论主题如何都应满足，这些才是真正要修的问题。

> Native-feel 关键洞见（T3 *adopt the platform; don't compete with it*）：错误通常不在于"hover 太多/太少"，而在于**用网页惯例统一处理本应交给平台的行为**。本应用的多数问题都源于"用 WebView 的浏览器默认行为去渲染桌面 UI"。

---

## 1. 最关键的发现

优先级最高的四条：

| # | 发现 | 维度 | 证据 |
|---|------|------|------|
| **A** | 🔴 **主题字体完全没有加载**。`static/fonts/fonts.css` 声明了 8 个 `@font-face`，但**全仓库没有任何文件 import / link 它**；Vite 的 `publicDir` 未设为 `static`（默认 `public/`，而 `public/` 不存在）；**打包产物 `build/assets/index-*.css` 中 `@font-face` 数为 0，`build/` 内无任何 `.woff2`**。结果：`Cinzel / Cinzel Decorative / IM Fell English / Fira Code` 全部回退到通用 `serif/monospace`——**整个中世纪视觉识别根本没渲染**。 | 视觉 / 性能 | `static/fonts/fonts.css`、`src/styles/index.css:28,37-39`、`index.html`、`vite.config.ts` |
| **B** | 🔴 **无障碍系统性缺失**。全仓库 `role=` 出现 **0 次**、`aria-live` **0 次**、`onKeyDown/keydown/Escape` **0 次**、`tabIndex` **0 次**。两个模态既非 `role="dialog"`、无 `aria-modal`、**无 Escape 关闭、无焦点陷阱、无初始聚焦**；动态错误/进度无 `aria-live` 播报。 | 交互 / 可访问性 | `src/features/install/InstallConfirmModal.tsx:22`、`src/layouts/ShellPaymentModal.tsx:8` |
| **C** | 🟡 **低透明度文字对比度不达标**。大量二级文字用 `rgba(200,170,120,0.4–0.6)` 叠在 `#0b0906` 上：0.4≈**2.3:1**、0.5≈**2.9:1**、0.6≈**3.8:1**，均低于 WCAG AA 正文 4.5:1（多为 10px 大写小字，更严苛）。详见附录 A。 | 可访问性 | `src/features/install/InstallFactItem.tsx:10`、`src/pages/History.tsx:84`、`src/pages/About.tsx:102` |
| **D** | 🟡 **窗口与布局不适配缩放**。`tauri.conf.json` 无 `minWidth/minHeight`、无窗口状态记忆插件；页面用固定 `grid-cols-12/7/4/3` 且**无任何响应式断点**。窗口缩到一定宽度，导航 + 双栏 + 7 列战斗表会挤压/溢出。 | 布局 / 性能感知 | `src-tauri/tauri.conf.json:14-20`、`src/pages/Install.tsx:34`、`src/pages/RunDetail.tsx:138` |

### 潜伏 bug / 死代码（低危但应清理）

- `animate-[fade-up_0.2s_ease-out]` 引用的 **`@keyframes fade-up` 全仓库未定义**（仅 OBS `overlay.css` 有无关的 `reveal-up`）→ 两个模态的入场动画**静默无效**。`src/features/install/InstallConfirmModal.tsx:23`、`src/layouts/ShellPaymentModal.tsx:9`。
- `custom-scrollbar` 类**未定义**（仅 `src/pages/History.tsx:49` 使用）→ 空类，滚动条仍是默认。
- 重复 `flex` 类名（复制痕迹）：`src/layouts/ShellNavRail.tsx:10`（`z-0 flex flex`）、`src/layouts/ShellHeader.tsx:221`、`src/layouts/ShellHeader.tsx:333` 等。

---

## 2. 做得好的地方

值得保留，不要在改动中误伤：

- ✅ **保留了原生标题栏**：`tauri.conf.json` 未设 `decorations:false`，窗口控件/红绿灯由 OS 绘制——满足 ship-readiness 第 27 项，比"自绘假标题栏"更原生。
- ✅ **单实例**：已配置 `tauri-plugin-single-instance`（`src-tauri/src/lib.rs:20`），符合第 64 项。
- ✅ **状态卡截断 + 原生 tooltip**：`min-w-0 + truncate + title=...`（`src/features/install/InstallStatusCard.tsx:18-22`、`src/features/install/InstallStatusPanel.tsx:47-52`）——即基准 commit 的溢出修复，写法到位。
- ✅ **Stream 页无障碍最佳**：`sr-only` + `htmlFor` + `aria-labelledby` + `peer sr-only` 自定义单选（`src/pages/Stream.tsx:113-122,209-227`）。
- ✅ **图标按钮基本都有 `aria-label`**（语言/GitHub/X/删除等），装饰性 SVG 有 `aria-hidden`（`src/layouts/ShellHeader.tsx:369`）。
- ✅ **`<html lang>` 随语言切换同步**（`src/i18n/LocaleProvider.tsx:38-46`）——`index.html` 里的 `zh-CN` 只是首帧初值，挂载后即纠正。
- ✅ **字体本地内置**（`static/fonts/*.woff2`，无 CDN/网络依赖）；**无 smooth-scroll polyfill**；`body{overflow:hidden}` 杜绝文档级滚动。
- ✅ **架构清晰**：feature 目录 + hooks + 生成的 TS bindings，组件职责单一。

---

## 3. 分维度详评

严重度图例：🔴 严重 / 🟡 中等 / 🟢 轻微 / ✅ 良好 / `[意图取舍]` 主题化决策。

### 3.1 视觉设计

| 严重度 | 发现 | 证据 | 修正方向 |
|---|---|---|---|
| 🔴 | 主题字体未加载（发现 A），实际渲染为通用 serif，视觉层次/品牌感塌陷 | `static/fonts/fonts.css` 孤立 | 见 P0-1 |
| 🟡 | Logo **永久旋转**（45s/圈 `infinite`），违反减少动效且使合成器永不空闲 | `src/layouts/ShellHeader.tsx:100` | 改静态，或仅 hover 旋转；至少加 reduced-motion 门控 |
| 🟡 | 二级文字对比度不足（发现 C） | 多处 `rgba(...,0.4-0.6)` | 提升 alpha 至 ≥0.75 或换更亮色值 |
| 🟢 | 发光阴影偏多（`shadow-[0_0_15px...]`），整体偏霓虹 | `src/features/install/InstallActionsPanel.tsx:124` | 收敛 glow，仅主按钮保留（审美可选） |
| 🟢 | 标题层级混用：页面标题 `<h2>` 与面板小节标题 `<h2>` 同级 | `src/components/ui/PageHeader.tsx:31` vs `src/features/install/InstallActionsPanel.tsx:31` | 小节标题降为 `<h3>` |
| `[意图取舍]` | 硬编码金色主题（非系统强调色）、纯色不透明窗背景（非系统材质）、深色不跟随系统亮暗 | `src/styles/index.css:3-29` | 主题化产品，保留即可；如想更原生可加 `window-vibrancy` |

### 3.2 布局结构

| 严重度 | 发现 | 证据 | 修正方向 |
|---|---|---|---|
| 🟡 | 无 `minWidth/minHeight`，窗口可被拖到任意小，布局崩 | `src-tauri/tauri.conf.json:14-20` | 加 `"minWidth": 900, "minHeight": 640` |
| 🟡 | 不记忆窗口尺寸/位置（无 `tauri-plugin-window-state`） | `src-tauri/src/lib.rs` | 接入 window-state 插件（第 15/30 项） |
| 🟡 | 全站固定栅格无响应式：`grid-cols-12`(7/5)、`grid-cols-4`、`grid-cols-3`、战斗表 `grid-cols-7` | `src/pages/Install.tsx:34`、`src/pages/Stream.tsx:188`、`src/pages/History.tsx:41`、`src/pages/RunDetail.tsx:138` | 桌面安装器最务实：锁最小宽度；或加 `lg:`/`md:` 断点堆叠 |
| 🟡 | Stream 配置行（输入框 + 3 按钮同排）在窄窗溢出/挤压 | `src/pages/Stream.tsx:224-259` | flex-wrap 或两行布局 |
| 🟢 | History 行（预览 160 + 英雄 144 + 5 指标 + 详情 + 删除）在 ~744px 内容区已很紧 | `src/pages/History.tsx:112-164` | 指标允许换行/隐藏次要列 |
| ✅ | 内容区 `max-w-5xl mx-auto`，宽屏不过宽 | `src/components/ui/PageShell.tsx:16` | 保留 |

### 3.3 交互体验

| 严重度 | 发现 | 证据 | 修正方向 |
|---|---|---|---|
| 🟡 | **模态/下拉无 Escape 关闭**（C.5 / 第 29、45 项） | `src/features/install/InstallConfirmModal.tsx`、`src/layouts/ShellHeader.tsx:459` | 加 `keydown=Escape`；推荐原生 `<dialog>` |
| 🟡 | 模态遮罩点击不关闭；ShellPaymentModal 仅能点 X 关 | `src/layouts/ShellPaymentModal.tsx:8` | 遮罩点击关闭（内容区 stopPropagation） |
| 🟡 | **链接默认 `cursor:pointer`**（C.1 / 第 21、37、38 项，native 最大"网页味"来源）。无全局光标重置，所有 `<a>`/`NavLink`/`<Link>` 都是手型 | `src/layouts/ShellNavRail.tsx:37`、`src/pages/History.tsx:113` | 全局 `cursor:default`（P0-2） |
| 🟡 | **按钮无 `:active` 按下态**（仅 `hover:brightness`）；native 要求明显按下反馈 | 全部按钮，如 `src/features/install/InstallActionsPanel.tsx:124` | 加 `active:brightness-95 active:translate-y-px` |
| 🟢 | **三种不一致的"展开"交互**：QR 浮层=纯 hover、B站/赞助=点击受控、社交=hover/focus | `src/layouts/ShellHeader.tsx:287` vs `:459` vs `:541` | 统一为点击 + Escape + 点外关闭的 popover |
| 🟢 | 非交互元素带 hover（暗示可点实则不可点） | `src/pages/About.tsx:96` | 去掉静态行的 hover 背景 |
| 🟢 | 文本可被框选（chrome 也能选，网页味，C.2 / 第 22 项） | 无 `user-select` 重置 | 全局 `user-select:none` + 内容区放开（P0-2） |

### 3.4 组件设计

| 严重度 | 发现 | 证据 | 修正方向 |
|---|---|---|---|
| 🟢 | `fade-up` 关键帧未定义 → 模态动画死代码 | `src/features/install/InstallConfirmModal.tsx:23` | 定义 `@keyframes fade-up` 或删类（native 偏"直接出现"，删除更佳） |
| 🟢 | `custom-scrollbar` 未定义 → 空类 | `src/pages/History.tsx:49` | 定义细滚动条或删类 |
| 🟢 | ErrorBanner 在 RunDetail 被**内联复制**而非复用组件 | `src/components/ui/ErrorBanner.tsx:3` vs `src/pages/RunDetail.tsx:44` | 复用 `<ErrorBanner>` |
| 🟢 | 两个模态结构高度重复，无共享 `Dialog` 基组件 | InstallConfirmModal / ShellPaymentModal | 抽 `<Dialog>`（顺带统一 a11y 与 Escape） |
| 🟢 | 多处重复 `flex` 类名 | `src/layouts/ShellNavRail.tsx:10` 等 | 清理 |
| ✅ | 原生 `<input type=checkbox/radio>` 未魔改 → 自动获得平台控件外观（T3 正面） | `src/features/install/InstallConfirmModal.tsx:77` | 保留 |

### 3.5 性能表现

| 严重度 | 发现 | 证据 | 说明 / 修正 |
|---|---|---|---|
| 🟡 | **永久旋转动画**使 WebView 合成线程长期活跃，违背"隐藏/空闲时 CPU<0.5%"（第 49 项），笔记本掉电 | `src/layouts/ShellHeader.tsx:100` | 去掉 infinite 旋转（最高性价比省电项） |
| 🟢 | 全屏 `feTurbulence` 噪声层覆盖主内容区 | `src/layouts/GlobalShell.tsx:50-56` | data-URL 背景仅栅格化一次，影响小，可保留 |
| 🟢 | 字体回退冷启动卡顿风险（A.9）——字体接上后，首个 emoji/CJK 回退会微卡 | — | 启动时预热 fallback 字体（skill A.9 方案） |
| 🟢 | 所有 `transition/animate` 未做 `prefers-reduced-motion` 门控 | 全站 | 全局 reduced-motion 媒体查询（P0-2） |
| 🟢 | `"csp": null` 关闭内容安全策略 | `src-tauri/tauri.conf.json:22` | 非 UI 项，建议补最小 CSP（防御纵深） |

### 3.6 可访问性

| 严重度 | 发现 | 证据 | 修正方向 |
|---|---|---|---|
| 🟡 | 对比度不达标（发现 C，实测见附录 A） | 见附录 A | alpha≥0.75 / 提亮 |
| 🟡 | 模态无 `role="dialog"`/`aria-modal`/`aria-labelledby` | `src/features/install/InstallConfirmModal.tsx:22` | 补齐 ARIA + 关联标题 id |
| 🟡 | 动态错误/进度无 `aria-live`，读屏不播报 | `src/features/install/InstallActionsPanel.tsx:74`、`src/components/ui/ErrorBanner.tsx` | 错误容器加 `role="alert"`/`aria-live="polite"` |
| 🟡 | 无 Escape、无焦点陷阱、无键盘可达性保证（第 27、29、66、70 项） | 全模态/下拉 | Escape + 焦点管理（P1-1） |
| 🟢 | 战斗"表格"用 grid div，丢失表语义（行/列/表头） | `src/pages/RunDetail.tsx:138-162` | 改真 `<table>` 或补 `role="table/row/columnheader"` |
| 🟢 | RunDetail 巨大装饰水印英雄名未 `aria-hidden`，读屏重复念 | `src/pages/RunDetail.tsx:207-211` | 加 `aria-hidden="true"` |
| 🟢 | `focus:outline-none` 仅在 Stream 输入框，靠边框变色代偿 | `src/pages/Stream.tsx:234` | 保留边框态但加可见 focus-visible 环 |
| 🟢 | 自定义 hover 态多、focus 态少（仅 1 处 `focus-visible:`），键盘用户感知弱 | `src/layouts/ShellHeader.tsx:263` | 交互元素统一 `focus-visible:` 样式 |

---

## 4. 改进清单（P0 / P1 / P2）

### P0 — 高影响、低成本，先做

**P0-1 · 让主题字体真正加载**（修复发现 A）。推荐让 Vite 处理 `@font-face`、woff2 自动指纹化：

```css
/* src/styles/index.css 顶部、tailwind 之后 */
@import './fonts.css';   /* 把 fonts.css 移到 src/styles/，url() 改相对路径 ../../static/fonts/xxx.woff2 */
```

最小改动替代方案：`vite.config.ts` 设 `publicDir: 'static'`，并在 `index.html` `<head>` 加
`<link rel="stylesheet" href="/fonts/fonts.css" />`（可对 Cinzel / 正文各加一条 `<link rel="preload" as="font" crossorigin>`）。
改完用 `npm run dev -- --host 127.0.0.1 --port 14207` 在浏览器肉眼确认标题变为 Cinzel Decorative。

**P0-2 · 一段全局 CSS 抹掉三类"网页味"**（cursor / user-select / reduced-motion，覆盖 C.1/C.2/C.6、第 21/22/37/38/39 项）：

```css
/* src/styles/index.css */
*, *::before, *::after { cursor: default; }
input, textarea, [contenteditable="true"] { cursor: text; }
:root { -webkit-user-select: none; user-select: none; }
.selectable, .user-content { -webkit-user-select: text; user-select: text; } /* 历史详情等正文按需放开 */

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: .001ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: .001ms !important;
  }
}
```

**P0-3 · 停掉永久旋转 logo**（性能 + 减少动效 + native）：删除 `src/layouts/ShellHeader.tsx:100` 的 `animate-[spin_45s_linear_infinite]`，改静态或 `group-hover:animate-spin`。

### P1 — 明显体验 / 可访问性，随后做

- **P1-1 · 模态升级**：抽 `<Dialog>` 基组件，内置 `role="dialog" aria-modal="true" aria-labelledby` + Escape 关闭 + 遮罩点击关闭 + 打开时聚焦首个可聚焦元素 + 焦点陷阱。优先考虑原生 `<dialog>.showModal()`（Escape/焦点陷阱/backdrop 免费且更原生）。改造 `InstallConfirmModal`、`ShellPaymentModal`。
- **P1-2 · 窗口约束**：`tauri.conf.json` 加 `"minWidth": 900, "minHeight": 640`；接入 `tauri-plugin-window-state` 记忆尺寸/位置。
- **P1-3 · 对比度**：把二级文字的 `rgba(...,0.4–0.6)` 统一提到 ≥0.75 或改更亮色值；批量涉及 `src/features/install/InstallFactItem.tsx:10`、`src/pages/History.tsx:84,137,205`、`src/pages/About.tsx:102` 及各 `text-[10px]` 标签。
- **P1-4 · 动态播报**：错误/进度容器加 `role="alert"` 或 `aria-live="polite"`（`src/features/install/InstallActionsPanel.tsx:74`、`src/components/ui/ErrorBanner.tsx`）。
- **P1-5 · 按钮按下态**：基础按钮加 `active:` 反馈。
- **P1-6 · 响应式兜底**：要么锁最小宽度（P1-2 已部分覆盖），要么给 `grid-cols-12/7` 加断点；优先处理 Stream 配置行与 RunDetail 7 列表。

### P2 — 打磨 / 清理

- 删 / 定义死类 `fade-up`、`custom-scrollbar`；清理重复 `flex`。
- RunDetail 错误改用 `<ErrorBanner>`；考虑战斗列表改真 `<table>`。
- 装饰水印加 `aria-hidden="true"`（`src/pages/RunDetail.tsx:207`）。
- 统一三处下拉为一致的点击式 popover。
- 给交互元素补 `focus-visible:` 样式；补最小 CSP。
- （可选，更原生）Tauri 加 `window-vibrancy` 让窗背景用系统材质。

---

## 5. Ship-Readiness 对照

节选与本应用相关的审计项：

| 项 | 判定 | 依据 |
|---|---|---|
| 21/37/38 无 `cursor:pointer` | ✗ | 链接默认手型，无重置 |
| 22 chrome 禁用文本选择 | ✗ | 无 `user-select` |
| 27 真实标题栏 | ✓ | 保留原生 decorations |
| 29/45 Escape 有意义 | ✗ | 无任何键盘处理 |
| 33/34 系统强调色/字体 | ◯ `[意图取舍]` | 主题化产品 |
| 39 尊重减少动效 | ✗ | 无 reduced-motion |
| 40 无页面过场 | ✓ | 路由无 fade |
| 49 隐藏/空闲低 CPU | ✗ | 永久旋转动画 |
| 64 Windows 单实例 | ✓ | 已配插件 |
| 66/67 读屏可达 + 焦点播报 | ✗ | 无 dialog 语义/焦点管理 |
| 68 对比度 WCAG AA | ✗ | 低 alpha 文字 |

**结论**：行为/可用性类条款是主要失分区，且**绝大多数是廉价修复**——P0 三项（接字体、一段全局 CSS、停旋转）即可消除最扎眼的"网页味"与最大视觉缺陷。审美类失分属主题化的有意取舍，不必改。

---

## 附录 A：对比度实测

底色 `--color-bg` = `#0b0906`（约 (11,9,6)，相对亮度 ≈ 0.003）。下列为前景色按 alpha 与底色 alpha 混合后，按 WCAG 相对亮度公式估算的对比度（近似值）：

| 前景 | 混合后近似 | 对比度 | WCAG AA 正文(4.5) | AA 大字(3.0) |
|---|---|---|---|---|
| `rgba(200,170,120,0.4)` | `#56493...` | ≈ **2.3:1** | ✗ | ✗ |
| `rgba(200,170,120,0.5)` | `#69593f` | ≈ **2.9:1** | ✗ | ✗（临界） |
| `rgba(200,170,120,0.6)` | `#7d6a4a` | ≈ **3.8:1** | ✗ | ✓ |
| `rgba(228,216,191,0.6)`（导航未选中） | `#8b8475` | ≈ **5.5:1** | ✓ | ✓ |
| `#e8dcc8`（主文本） | — | ≈ **14:1** | ✓ | ✓ |
| `#e8c87a`（金色强调） | — | ≈ **11:1** | ✓ | ✓ |
| `#d96d6d`（错误，叠 8% 红底） | — | ≈ **4.8:1** | ✓ | ✓ |

要点：**主文本、金色强调、状态色对比度都没问题；问题集中在 `≤0.6` alpha 的暖灰二级标签**（且多为 10px 大写小字）。把这类 alpha 提到 ≥0.75 即可全部达标。

> 注：以上为静态估算，未含 `disabled:opacity-40/45`。禁用态按 WCAG 1.4.3 豁免，不计违规，但视觉上偏弱。

## 附录 B：评审覆盖的文件

- 构建/壳：`index.html`、`vite.config.ts`、`src/main.tsx`、`src/App.tsx`、`src/styles/index.css`、`static/fonts/fonts.css`、`src-tauri/tauri.conf.json`、`src-tauri/src/lib.rs`、`build/`（产物核对）
- 布局：`src/layouts/GlobalShell.tsx`、`ShellHeader.tsx`、`ShellNavRail.tsx`、`ShellPaymentModal.tsx`
- 基础组件：`src/components/ui/{PageShell,PageHeader,LoadingPanel,ErrorBanner}.tsx`
- 安装特性：`src/features/install/{InstallActionsPanel,InstallActionButton,InstallConfirmModal,InstallStatusPanel,InstallStatusCard,InstallFactItem}.tsx`
- 页面：`src/pages/{Install,Stream,History,RunDetail,About}.tsx`
- 国际化：`src/i18n/LocaleProvider.tsx`
- 全局 grep：`cursor` / `user-select` / `transition|animate` / `shadow` / `rounded` / `role=` / `aria-*` / `onKeyDown|Escape` / `tabIndex` / `active:` / `focus(-visible)?:` / `@font-face` / `@keyframes`
