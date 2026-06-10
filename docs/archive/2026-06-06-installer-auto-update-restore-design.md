---
status: implemented
topic: in-app-updater
archived: 2026-06-11
superseded-by: docs/truth/updater-release.md
---
# 安装器自动更新接回:设计方案

> **范围**:`bazaarplusplus-installer`（React 19 + Tailwind v4 前端 / Rust + Tauri 2 后端）
> **取证基准**:`master` @ `0ab77dd`，工作树干净（除既有未跟踪的 spec）
> **设计日期**:2026-06-06
> **取证原则**:所有代码结论以代码为准，逐条标注 `文件:行号`;框架行为以 Tauri 2 官方文档为准
> **方法**:`superpowers:brainstorming` 协作澄清 → 本设计 → `superpowers:writing-plans` 出实施计划
>
> **✅ 已实现（历史记录）**:本设计已在 `6eb729c`（应用内下载/安装/重启）与 `ec7689f`（头部更新结果提示）落地。§13 任务分解里的 `[ ]` 复选框仅为设计时状态，T1–T8 均已完成（T9 真机验证属外部手动步骤）。§4「现状链路盘点」与附录 A 是**实施前**的取证快照——其中描述的旧代码（跳 GitHub 的 `ShellUpdateModal`、`aboutApi` 丢弃 `Update` 句柄、仅 `updater:allow-check` 的能力等）均已不存在。当前权威以 `docs/architecture.md`、`docs/updater-release-plan.md` 与代码为准。

---

## 目录

- [1. 背景与现状](#1-背景与现状)
- [2. 目标与非目标](#2-目标与非目标)
- [3. 已确认的产品决策](#3-已确认的产品决策)
- [4. 现状链路盘点（取证）](#4-现状链路盘点取证)
- [5. 架构设计（方案 B）](#5-架构设计方案-b)
- [6. 状态机与数据流](#6-状态机与数据流)
- [7. 弹窗各 phase 形态](#7-弹窗各-phase-形态)
- [8. 配置 / 能力 / 依赖改动](#8-配置--能力--依赖改动)
- [9. 错误处理（无兜底）](#9-错误处理无兜底)
- [10. 平台差异与重启策略](#10-平台差异与重启策略)
- [11. i18n 改动](#11-i18n-改动)
- [12. 测试策略](#12-测试策略)
- [13. 实施任务分解](#13-实施任务分解)
- [14. 验证矩阵](#14-验证矩阵)
- [15. 风险与回归](#15-风险与回归)
- [附录 A:证据与文件清单](#附录-a证据与文件清单)

---

## 1. 背景与现状

安装器**曾经**拥有完整的 Tauri 自动更新（下载进度 + 启动检查 + 更新后 what's-new 页）。时间线（commit 时间为准）:

| 时间 | Commit | 对自动更新 |
| --- | --- | --- |
| 2026-04-04 | `5440936` | 引入 `update.downloadAndInstall(...)`、`checkForUpdatesOnStartup`、`startPendingUpdateDownload`;能力 `updater:default` |
| 2026-04-12 | `4ec6358` | 做强:`src/lib/installer/updater-flow.ts`（268 行 + 117 行测试），带下载进度、版本比较、`maybeOpenWhatsNewAfterAutoUpdate` |
| 2026-06-01 | `8aecac2` | **"Replace installer shell with React prototype" 把整套下载/安装路径删光**，只重新实现了 `check()` |
| 2026-06-05 | `8b8de1f` | 能力 `updater:default` → `updater:allow-check`，从 ACL 层锁死 download-and-install |

**现状**:`check()` 仅用作版本探针，发现新版本后弹窗用 `<a href={github}/releases/latest>` 把用户**跳去 GitHub 手动下载重装**（[ShellUpdateModal.tsx:54-63](../../src/layouts/ShellUpdateModal.tsx)）。与此同时,**构建流水线仍在每次发版签名并托管一套完整、可消费的自动更新包**（`createUpdaterArtifacts` + `latest.json`（带 `url`+`signature`）+ R2 托管），却无人消费 —— 这是一处明确的漂移。本设计将这套基础设施重新接回应用内。

附带修复:现状手动点"检查更新"在**已是最新版时零反馈**（[useAppBootstrap.ts:52-70](../../src/features/about/useAppBootstrap.ts) 的 `current` 分支什么都不做，`updaterCurrent` 文案在 `8aecac2`/`18a2259` 期间被删），本设计顺手恢复。

---

## 2. 目标与非目标

**目标**

- 在现有 React shell 内重新实现 `downloadAndInstall` 全流程:检查 → 展示更新说明 → 一键下载（带进度）→ 安装 → 重启。
- 彻底移除"跳 GitHub 手动下载"路径。
- 顺手修好"已是最新零反馈"的 P0。

**非目标(YAGNI)**

- 跳过此版本 / 本次不再提示的持久化。
- 更新后 what's-new 页（改为安装前在弹窗内展示 `update.body`）。
- 强制阻断式更新。
- 增量/差分更新、后台静默下载。

---

## 3. 已确认的产品决策

| 维度 | 决策 | 含义 |
| --- | --- | --- |
| 更新模型 | **提示后一键安装** | 保留"发现新版本"弹窗,按钮改为"下载并安装",显示下载进度,装完提示重启。用户掌控何时更新。 |
| GitHub 兜底 | **完全移除** | 只走自动更新 + 失败重试,无 GitHub 手动下载退路。下载源为 R2 端点 `bppinstaller.bazaarplusplus.com`（Cloudflare 前置,国内可达性优于 GitHub）。 |
| 更新说明 | **安装前在弹窗内展示** | 取自 `update.body`（源自 `latest.json` 的 `notes`）。 |
| 前端结构 | **方案 B:独立 updater 模块** | 新建 `updater.ts` 服务 + `useUpdater` 状态机 hook + phase 驱动弹窗;`useAppBootstrap` 卸掉更新职责。与 4 月旧版 `updater-flow.ts` 同形、可测、边界清晰。 |
| 重启策略 | **Windows 自动重启 / macOS 手动点"立即重启"** | 见 §10。 |

---

## 4. 现状链路盘点（取证）

**已就位** ✅

- `@tauri-apps/plugin-updater ^2.10.0`（JS）、`tauri-plugin-updater = "2"`（[Cargo.toml:53](../../src-tauri/Cargo.toml)），已在 [lib.rs:33](../../src-tauri/src/lib.rs) 注册。
- `createUpdaterArtifacts: true`、endpoint `bppinstaller.bazaarplusplus.com/latest.json`、pubkey（[tauri.conf.json:29-35](../../src-tauri/tauri.conf.json)）。
- 签名/公证流水线:Developer ID + notarytool（[build.sh:42-45,314-354](../../build.sh)）。
- `latest.json` 生成 + 托管:`scripts/generate-{platform,latest}-manifest.mjs`,产物 `url` = `${baseUrl}/${version}/${platform}/updater/...` + `signature`。

**必须补齐** ❌

1. **relaunch 能力缺失**:`@tauri-apps/plugin-process` 未装(JS)、`tauri-plugin-process` 不在 Cargo.toml、lib.rs 未注册。
2. **ACL 只放行了 check**:[capabilities/default.json:9](../../src-tauri/capabilities/default.json) 仅 `updater:allow-check`。
3. **`check()` 丢弃了 Update 句柄**:[aboutApi.ts:34-37](../../src/features/about/aboutApi.ts) 只取 `version` 就扔掉 `Update` 对象,而 `downloadAndInstall()` 必须在**同一句柄**上调用。

---

## 5. 架构设计（方案 B）

**关键洞察**:因为移除了 GitHub 兜底,更新流程不再依赖 `bootstrap.links.github`,所以 updater 可做成**与 bootstrap 完全独立**的模块。

| 文件 | 动作 | 职责 |
| --- | --- | --- |
| `src/features/about/updater.ts` | **新建** | 服务层:封装 `runCheck()` / `runDownloadInstall(update, onProgress)` / `restart()`;impl 可注入(测试缝);承载启动检查模块级单例 |
| `src/features/about/useUpdater.ts` | **新建** | 状态机 hook:`phase` / `progress` / `version` / `notes` / `error` + `checkNow` / `install` / `restart` / `dismiss` |
| `src/features/about/UpdaterProvider.tsx` | **新建** | Context provider(独立于 `AppBootstrapProvider`) |
| `src/layouts/ShellUpdateModal.tsx` | 改 | 按 phase 渲染;**删** GitHub `<a>` 与 `downloadUrl` prop |
| `src/layouts/GlobalShell.tsx` | 改 | 包 `UpdaterProvider`;由 updater 状态渲染弹窗 |
| `src/layouts/ShellHeader.tsx` | 改 | "检查更新"按钮调 `checkNow()`;头部内联提示"已是最新/错误"(修 P0) |
| `src/features/about/useAppBootstrap.ts` | 改 | **卸掉**全部更新逻辑(`updateMessage`/`updatePrompt`/`checkingUpdate`/`checkUpdates`/启动单例),只剩 bootstrap |
| `src/features/about/aboutApi.ts` | 改 | 移除 `checkForUpdate`(迁到 `updater.ts`),只留 `loadAppBootstrap` |
| `src-tauri/Cargo.toml` | 改 | + `tauri-plugin-process = "2"` |
| `src-tauri/src/lib.rs` | 改 | + `.plugin(tauri_plugin_process::init())` |
| `package.json` | 改 | + `@tauri-apps/plugin-process` |
| `src-tauri/capabilities/default.json` | 改 | + `updater:allow-download-and-install`、`process:allow-restart` |
| `src/i18n/messages.ts` + `.test.ts` | 改 | 新增进度/重启/错误文案;恢复 `updaterCurrent` |
| `src/features/about/updater.test.ts` | **新建** | 注入假 impl,测状态机迁移 |

**模块边界自查**:`updater.ts` —— 做什么(检查/下载安装/重启的 Tauri 封装)、怎么用(纯函数 + 回调)、依赖什么(`@tauri-apps/plugin-{updater,process}`,不依赖 bootstrap)。`useUpdater` —— 做什么(状态机)、怎么用(`UpdaterProvider` 注入)、依赖什么(`updater.ts`)。`ShellUpdateModal` —— 做什么(按 phase 纯展示)、依赖什么(useUpdater 的 props)。三者可独立理解、独立测试。

---

## 6. 状态机与数据流

```
                 checkNow() / startup
   idle ──────────────────────────► checking
                                        │
        ┌───────────────┬───────────────┼───────────────┐
        ▼               ▼               ▼               ▼
   available         current         preview          error
   (开弹窗)        (头部"已是最新")  (头部 dev 提示)   (头部错误)
        │ install()
        ▼
   downloading ─(Progress)─► installing ─► ready ─restart()─► relaunch()
        │
        └────────── throw ──────────► error(保留句柄, 可重试)
```

- **留住 Update 句柄**:hook 内 `useRef<Update|null>`。`checkNow`/启动把句柄存入;`install()` 在同一句柄上调 `runDownloadInstall`。`Update` 是 Tauri `Resource`——**一次失败的 `downloadAndInstall` 可能已消费/关闭句柄,因此 [重试] 不复用旧句柄,而是先 `runCheck` 取新句柄再装**;句柄缺失同理。
- **进度映射**(实测 API:`DownloadEvent` 仅 `Started{contentLength?}` / `Progress{chunkLength}` / `Finished`,见 `node_modules/@tauri-apps/plugin-updater/dist-js/index.d.ts:45-56`):`Started→progress.total`、`Progress→progress.downloaded += chunkLength`、`Finished→phase=installing`。**`downloadAndInstall` 的下载+安装是同一个 Promise,`Finished` 之后再无"安装进度"事件;`installing` 只是"`Finished` 到 Promise resolve"之间的合成态,resolve 后转 `ready`。** `total` 为 `null`(`contentLength` 缺失)时显示不确定态。
- **下载/安装期**:弹窗只显示进度,**隐藏"稍后"**(`downloadAndInstall` 不可干净取消)。
- **并发护栏**:`phase ∈ {checking, downloading, installing}` 时 `checkNow`/`install` 为 no-op,避免启动检查与手动按钮叠加、或重复点击触发第二次下载。
- **两种 error 来源**:`checkNow` 阶段失败 → **头部内联错误**(不开弹窗);`install` 阶段失败 → **弹窗 `error` phase**([重试]/[稍后])。同为 `error`,展示面不同。
- **启动检查**:模块级单例去重(沿用现有 [useAppBootstrap.ts:13](../../src/features/about/useAppBootstrap.ts) 的做法,迁入 `updater.ts`),启动失败静默(只有 `available` 才开弹窗)。
- **dev 短路**:`!hasTauriRuntime()` 时 `runCheck` 返回 `preview`,启动检查直接 return(沿用现状)。

`UpdateCheckResult`(扩展自现状,新增 `notes` 与句柄):

```ts
type UpdateCheckResult =
  | { status: 'preview' }
  | { status: 'current' }
  | { status: 'available'; version: string; notes: string; update: Update };
```

---

## 7. 弹窗各 phase 形态

沿用现有视觉风格([ShellUpdateModal.tsx](../../src/layouts/ShellUpdateModal.tsx) 的 Dialog + 金色边框)。

| phase | 内容 | 按钮 |
| --- | --- | --- |
| available | kicker「应用更新」+「发现新版本 {version}」+ **`notes` 更新内容** | [稍后] [下载并安装] |
| downloading | 进度条 + `12.3 / 45.6 MB (27%)` +「正在下载…」 | (无,隐藏稍后) |
| installing | spinner +「正在安装…」 | (无) |
| ready | 「更新完成,重启后生效」 | [立即重启] |
| error | 「自动更新失败」+ 截断错误详情 | [重试] [稍后] |

---

## 8. 配置 / 能力 / 依赖改动

```jsonc
// src-tauri/capabilities/default.json — 当前只有 "updater:allow-check"
"updater:allow-check",
"updater:allow-download-and-install",   // +(已核对:映射 download_and_install 命令,见 gen/schemas/acl-manifests.json)
"process:allow-restart",                 // +(映射 relaunch();process 插件接入后 Tauri 重新生成 schema 时校验)
```

```toml
# src-tauri/Cargo.toml — [dependencies]
tauri-plugin-process = "2"   # +(与 tauri-plugin-updater 同主版本)
```

```rust
// src-tauri/src/lib.rs:33 附近,与 updater/dialog/opener 并列
.plugin(tauri_plugin_process::init())   // +
```

```jsonc
// package.json — dependencies(执行 `npm install @tauri-apps/plugin-process`,由 npm 写入精确 caret 范围)
"@tauri-apps/plugin-process": "^2"   // 最新 2.x;主版本对齐 @tauri-apps/plugin-updater(^2.10.0)
```

`createUpdaterArtifacts` / endpoint / pubkey / 签名公证 / `latest.json` 生成 **均不动**(已就位)。

---

## 9. 错误处理（无兜底）

因为移除了 GitHub 退路,失败路径必须稳:

- **下载/安装抛错** → `error` phase,显示文案 + 截断错误 + **[重试]**(失败的 `Update` 句柄可能已被消费,[重试] **先 `runCheck` 取新句柄再装**,不复用旧句柄)。
- **启动 `check()` 失败** → 静默(后台检查不打扰)。
- **手动 `check()` 失败** → 头部内联错误文案(`toErrorMessage`)。
- **签名 / pubkey 不匹配** → Tauri 在 check/install 阶段抛错 → `error` phase(运维提示:轮换 minisign key 或 `latest.json` 签名错配会在这里暴露)。
- **`relaunch()` 失败**(罕见) → 提示用户手动重启。

---

## 10. 平台差异与重启策略

| 平台 | 签名状态 | 重启策略 |
| --- | --- | --- |
| **macOS** | Developer ID 签名 + notarytool 公证 → 替换 bundle 后可干净重启 | `downloadAndInstall()` resolve 后置 `ready` phase,用户点**[立即重启]** → `relaunch()` |
| **Windows** | NSIS 升级包仅 minisign 签名(updater 校验 `.sig`),无 Authenticode(首次运行可能 SmartScreen,与现状一致) | NSIS 默认 `installMode` 可能在 `downloadAndInstall` 时强制关闭应用,"ready"那步可能到不了 → **`downloadAndInstall` 后直接 `relaunch()`(自动重启)** |

在 Windows 上,NSIS 安装器通常**自身负责关闭并重启应用**,JS 侧 `relaunch()` 很可能是"进程已退出"后的 best-effort no-op——**不要把重启正确性押在 JS `relaunch()` 上**,以 NSIS `installMode` 的重启行为为准。**这条平台分叉必须在 Windows 真机验证**(macOS 上看不出):验证 `downloadAndInstall` 期间应用是否存活到能渲染 ready 态;若 NSIS 强制关闭,则 Windows 分支不渲染手动按钮、依赖安装器重启。可结合 `tauri.conf.json` 的 `bundle.windows.installMode`(`passive`/`quiet`)调整。

---

## 11. i18n 改动

`src/i18n/messages.ts`(zh + en,en 表保持 key 齐以满足编译期 key parity,见记忆 `installer-i18n-architecture`):

**新增**

| key | zh | en |
| --- | --- | --- |
| `updateInstall` | 下载并安装 | Download & Install |
| `updateDownloading` | 正在下载… | Downloading… |
| `updateInstalling` | 正在安装… | Installing… |
| `updateReady` | 更新完成,重启后生效 | Update ready — restart to apply |
| `updateRestartNow` | 立即重启 | Restart Now |
| `updateError` | 自动更新失败 | Update failed |
| `updateRetry` | 重试 | Retry |
| `updateNotesLabel` | 更新内容 | What's new |

**恢复**(修 P0)

| key | zh | en |
| --- | --- | --- |
| `updaterCurrent` | 已是最新版本 | Already up to date |

**移除**:`updateModalConfirm`(「前往下载」/「Open Download」)—— 被 `updateInstall` 取代。

**保留**:`updateModalKicker` / `updateModalTitle` / `updateModalBody` / `updateModalLater` / `updaterPreview` / `headerCheckUpdate` / `headerCheckingUpdate`。

`src/i18n/messages.test.ts`:更新引用旧 key(`updateModalConfirm`)的断言;key-parity 测试保留。

---

## 12. 测试策略

- **`updater.test.ts`**(新建,核心):注入假 `runCheck`/`runDownloadInstall`/`restart` impl,断言状态机迁移:
  - `checkNow` → `available`(句柄 + notes 捕获);
  - `install` → `downloading`(progress 累加)→ `installing` → `ready`;
  - `install` 抛错 → `error`,句柄保留,`retry` 可重跑;
  - `restart` → 调用 `relaunch`。
  - 属真实行为验证,非覆盖装饰(符合仓库规则)。
- **`messages.test.ts`**:改掉引用旧 key 的断言;parity 测试保留。
- **`npm run check`**:无 ts-rs 绑定变化(不动 Rust DTO);`tsc --noEmit` 过。
- **`cargo test`**:process 插件注册编译通过。
- **`npm run prebuild-check`**:暴露 Rust 警告(见记忆 `verify-rust-warnings-prebuild-check`)+ 校验 Tauri 配置/能力。
- **最终判据(真机)**:Windows + macOS,用 staging 的 bumped `latest.json` 跑通 check → 展示 notes → 下载(进度)→ 安装 → 重启。**核心收益必须真机验证**,`./build.sh --prod` 仅打包、不作冒烟。

---

## 13. 实施任务分解

> 供 `superpowers:writing-plans` / executor 逐条执行;复选框跟踪。

- [ ] **T1 后端底座**:`Cargo.toml` + `tauri-plugin-process`;`lib.rs` 注册;`package.json` + `@tauri-apps/plugin-process`;`capabilities/default.json` + 两个能力。`Run: cargo build`、`npm install`。
- [ ] **T2 服务层 `updater.ts`**:`runCheck`(返回 `{status, version?, notes?, update?}`)、`runDownloadInstall(update, onProgress)`、`restart()`;impl 可注入;模块级启动单例。从 `aboutApi.ts` 迁出 `checkForUpdate`。
- [ ] **T3 状态机 `useUpdater.ts` + `UpdaterProvider.tsx`**:phase/progress/version/notes/error + 动作;`useRef` 留句柄。
- [ ] **T4 `useAppBootstrap`/`aboutApi` 瘦身**:删除全部更新状态与逻辑;`AppBootstrapController` 类型收缩;确认无残留引用。
- [ ] **T5 `ShellUpdateModal` 改 phase 驱动**:删 GitHub `<a>`/`downloadUrl`;新增 notes/进度/重启/错误形态。
- [ ] **T6 `GlobalShell` + `ShellHeader` 接线**:包 `UpdaterProvider`;按钮调 `checkNow`;头部内联"已是最新/错误"(修 P0)。
- [ ] **T7 i18n**:新增 8 个 key + 恢复 `updaterCurrent` + 移除 `updateModalConfirm`(zh+en);调 `messages.test.ts`。
- [ ] **T8 `updater.test.ts`**:状态机单测(注入 impl)。
- [ ] **T9 验证**:`npm run check` + `cargo test` + `npm run prebuild-check`;`grep -rn "releases/latest\|downloadUrl\|updateModalConfirm" src` 应为空;Windows/macOS 真机冒烟(staging `latest.json`)。

依赖关系:T1 → (T2 → T3 → {T4, T5}) → T6 → T7 → T8 → T9。

---

## 14. 验证矩阵

| 任务 | 自动化 | 手动(Windows 为最终判据) |
| --- | --- | --- |
| T1 | `cargo build`、`npm install` | — |
| T2/T3 | `updater.test.ts` | — |
| T4 | `npm run check`(无悬空引用) | — |
| T5/T6 | `npm run check` | 弹窗各 phase 正常;点"检查更新"在已最新时显示"已是最新" |
| T7 | `messages.test.ts` | 中英文案正确 |
| T9 | `prebuild-check`(暴露 Rust 警告) | **真机:check→notes→下载(进度)→安装→重启全通**;macOS 手动重启、Windows 自动重启 |

---

## 15. 风险与回归

- **Windows NSIS 重启行为**(§10):`downloadAndInstall` 可能强制关应用,ready 态到不了 → Windows 走自动 `relaunch`。**真机验证为准**。
- **无兜底**:下载源单点为 R2 端点;失败仅靠 [重试]。R2 经 Cloudflare,国内可达性通常优于 GitHub,但仍需保证 `error`+`retry` 路径稳。
- **句柄生命周期**:`Update` 句柄持有 Rust 侧资源,跨用户交互保留;若应用 reload 句柄失效 → `install` 兜底重新 `runCheck`。
- **`process` 插件版本**:与 `updater`/Tauri 主版本对齐,避免重复版本。
- **能力放开面**:`updater:allow-download-and-install` + `process:allow-restart` 扩大了 ACL;仅 main window 需要,维持 `windows: ["main"]` 作用域。
- **签名链**:pubkey 必须与 `latest.json` 的 minisign 签名匹配;轮换 key 会让 `check`/`install` 抛错(在 `error` phase 暴露,不会静默)。
- **删字段连锁**:`UpdatePrompt.downloadUrl`、`updateModalConfirm` 删除后需 `grep` 确认无残留;`useAppBootstrap` 瘦身后 `AppBootstrapController` 消费方(`ShellHeader` 等)同步更新。

---

## 附录 A:证据与文件清单

**现状关键证据**

- 现状只用 `check()`:[aboutApi.ts:29-38](../../src/features/about/aboutApi.ts)。
- 跳 GitHub:[ShellUpdateModal.tsx:54-63](../../src/layouts/ShellUpdateModal.tsx)、[useAppBootstrap.ts:56,84](../../src/features/about/useAppBootstrap.ts)。
- 能力仅 check:[capabilities/default.json:9](../../src-tauri/capabilities/default.json)。
- 插件已注册:[lib.rs:33](../../src-tauri/src/lib.rs);updater Rust 依赖:[Cargo.toml:53](../../src-tauri/Cargo.toml)。
- 产物 url+signature:`scripts/generate-platform-manifest.mjs:15`、`scripts/generate-latest-manifest.mjs:46-66`。
- 签名/公证:[build.sh:42-45,314-354](../../build.sh)。
- "已是最新零反馈"P0:[useAppBootstrap.ts:52-70](../../src/features/about/useAppBootstrap.ts) 的 `current` 分支无输出;`updaterCurrent` 已被删。
- 旧实现参考(已删):commit `4ec6358` 的 `src/lib/installer/updater-flow.ts`(268 行 + 117 行测试)。

**本设计涉及文件**:见 §5 表。

---

## 附录 B:对抗性评审记录

- **评审**:`/codex:adversarial-review`(working-tree),2026-06-06,baseline `0ab77dd`。
- **结论**:verdict `needs-attention`,但**唯一 finding 针对的是同处工作树的另一份 spec**(`2026-06-06-windows-first-screen-lag-fix.md` 已对当前代码失真——其 P0「首屏命令改 async」已在 `09ef2a8` 落地,`install.rs:13` / `app.rs:55` 现为 `#[tauri::command(async)]`)。**本自动更新方案未被评审实质挑战**(无针对性 finding)。
- **本人复核 + 加固**(评审未触及处,依据实测 plugin-updater API):
  1. `DownloadEvent` 仅 `Started`/`Progress`/`Finished`,`installing` 为合成态(§6);
  2. 失败重试改为重新 `check` 取新句柄,不复用已消费的 `Resource`(§6/§9);
  3. Windows 重启以 NSIS `installMode` 为准,不押注 JS `relaunch()`(§10);
  4. 能力标识 `updater:allow-download-and-install` 已对照 ACL schema 核实存在(§8)。
- **遗留(本任务范围外)**:`windows-first-screen-lag-fix.md` 失真——已另起后台任务跟踪(刷新为历史记录或移除)。
