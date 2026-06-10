---
status: implemented
topic: tempo-native-launch
archived: 2026-06-11
superseded-by: docs/truth/launch-modes.md
---
# Tempo 原生启动流程集成实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `~/Downloads/tempo_native_adoption` 适配包集成进 installer，使没有 Steam 的 Tempo Launcher 原生用户也能检测、安装、并通过"捕获-重放"流程启动带模组的游戏；同时保留现有 Steam 用户的 `steam://` 启动路径零行为变化。

**Architecture:** 先在独立分支上原样 vendor 适配包（全部 17 个补丁块已逐一对照现仓库代码核验，能干净落位），然后分 7 个修正任务解决审查发现的问题：双启动流（Steam / Tempo 自动选择）、命令异步化、移除清单单一事实来源、macOS 参数捕获健壮化、Windows 隐藏控制台、状态事件 i18n 化、取消支持。

**Tech Stack:** Rust + Tauri 2（`#[tauri::command(async)]`、`tauri::Emitter` 事件）、React + 类型化 i18n（`messages.ts` 的 `MessageKey` 编译期奇偶校验）、ts-rs 生成绑定（`npm run generate:bindings`）。

---

## 0. 背景：适配包做了什么（启动设计的核心原理）

Tempo Launcher（The Bazaar 官方启动器）在启动游戏前会做完整性校验，游戏目录里存在 BepInEx/doorstop 等模组文件会导致校验失败。适配包移植了 `qaz111ex/The_Bazaar_Gate` 的四步绕过流程（见 `README_ADOPTION.md:7-12`）：

```
[1 备份] 把模组 payload 从游戏目录移走（备份到临时目录）
[2 校验] 启动 Tempo Launcher，目录此时是"原版"，等用户点 PLAY
[3 捕获] 轮询发现 Tempo 拉起的原版 TheBazaar 进程 → 读取其完整命令行
         （内含本次会话的鉴权/会话参数）→ 杀掉这个临时原版进程
[4 重放] 恢复模组 payload（macOS 蹦床模式还要重装蹦床）
         → 用捕获到的参数直接启动游戏可执行文件 → 模组版游戏带着
         合法的 Tempo 会话参数运行
```

macOS 两种现有启动模式都被覆盖：

- **prefix 模式（macOS ≤ 26）**：恢复 payload 后执行 `run_bepinex.sh <捕获参数>`。已验证 `run_bepinex.sh` 两条 exec 路径均转发 `"$@"`（`src-tauri/resources/SourceForBuild/macos/run_bepinex.sh:364,366`）。
- **蹦床模式（macOS 27+）**：校验前临时 `uninstall_trampoline` 还原原版 .app，捕获后 `install_trampoline` 重装，再直接执行 .app 内的 stub。已验证 stub 用 `execv(real, argv)` 原样转发参数（`src-tauri/resources/SourceForBuild/macos/bpp_launcher.c:56`，由 `build.rs:20` 编译进资源）。

**每次启动都必须重新走一遍捕获**（参数是会话级的，不能缓存），所以 UX 上用户每次点"启动游戏"都会看到 Tempo 窗口并需要点一次 PLAY——这是该方案的固有代价，UI 必须明确提示。

---

## 1. 适配包逐块核验结果（17 个补丁操作 × 现仓库代码）

`apply-tempo-native-launch.mjs` 用 `replaceOnce`（替换首个匹配，找不到即抛错）和 `insertAfter`（在首个 marker 后插入，已存在则跳过）打补丁。**全部 17 个操作已逐一对照现仓库验证，均能命中且命中正确位置**：

| # | 操作 | 目标 | 核验结果 |
|---|------|------|----------|
| 1 | copy | 新建 `src-tauri/src/services/tempo.rs`（830 行） | ✅ 全部 `crate::` 调用签名匹配（见 §2） |
| 2 | insertAfter | `services/mod.rs` 的 `pub mod stream_window;`（第 13 行，唯一） | ✅ 插入 `pub mod tempo;` |
| 3 | replaceOnce | `commands/install.rs:7` import 行 | ✅ 逐字匹配 |
| 4 | replaceOnce | `commands/install.rs:66-70` `launch_game` 函数 | ✅ 逐字匹配；⚠️ 新实现仍是同步命令（问题 P0-1） |
| 5 | replaceOnce | `install/mod.rs:42-45` `steam_path` 的 `ok_or_else` | ✅ 改为 `unwrap_or_default()` + `has_steam_path` |
| 6 | replaceOnce | `install/mod.rs:61` 裸 `prepare_steam_for_launch_option_update(steam, false)?;`（12 空格缩进） | ✅ 文件中该串 12 空格缩进仅此一处（第 81 行是 16 空格缩进，不会误中） |
| 7 | replaceOnce | `install/mod.rs:75` `clear_launch_options_for_steam(steam)?;`（唯一） | ✅ |
| 8 | replaceOnce | `install/mod.rs:80-82` `if was_trampolined { prepare… }` 三行块 | ✅ 与 #6 顺序无交叉风险（已验证先后两个 pattern 互不匹配对方目标） |
| 9 | replaceOnce | `install/mod.rs:91` `if patch_launch_options_supported {`（唯一） | ✅ 追加 `&& has_steam_path` |
| 10 | insertAfter | `install/mod.rs:140-142` `launch_game_via_steam` 函数体 | ✅ 后插 `launch_game_via_tempo` 包装函数 |
| 11 | replaceOnce | `bepinex/mod.rs:78-79` install_bepinex 内 macOS prepare(.., true) | ✅ 唯一；包上 `if !steam_path.trim().is_empty()` |
| 12 | replaceOnce | `bepinex/mod.rs:142-143` uninstall_bpp 内 macOS prepare(.., false) | ✅ 唯一 |
| 13 | replaceOnce | `bepinex/mod.rs:159` uninstall_bpp 内 clear_launch_options | ✅ 唯一 |
| 14 | insertAfter | `detect/mod.rs:9` `use …normalize_requested_game_path;` | ✅ 插入 `fallback_game_candidates` import（`pub(crate)`，跨模块可见） |
| 15 | replaceOnce | `detect/mod.rs:60-62` `game_path` 解析链 | ✅ 逐字匹配；类型链 `Option<PathBuf>` + `is_valid_game_path(&Path)`（`detect/game.rs:30`）+ `Vec<PathBuf>` deref-coerce，可编译 |
| 16 | insertAfter | `game_path.rs:128-129` macOS cfg 块（全文件首个/唯一） | ✅ Tempo 路径插在 Steam 候选之前 |
| 17 | insertAfter | `game_path.rs:137-138` Windows cfg 块（4 空格缩进首个；第 1 行无缩进的 cfg 不会误中） | ✅ 插在 `use windows::…GetLogicalDrives;` 之前——Rust 允许块内 item 在语句后，可编译，仅风格略怪 |
| 18 | insertAfter | `useInstallPage.ts:66-74` startup-ready useEffect 块 | ✅ 逐字节匹配；`setMessage`(L32)/`listen`(L2)/`hasTauriRuntime`(L3) 均在作用域 |

补丁脚本自身的风险：**没有回滚机制**——若中途某个 `replaceOnce` 抛错，仓库会停在半补丁状态。缓解：Task 0 要求在干净分支上执行，用 git 兜底。

依赖与运行时前提全部满足：`dirs = "6"`（`Cargo.toml:28`）、`serde_json = "1"`、`tauri = 2` 且 `Emitter` 是仓库既有用法（`lib.rs:8,47`）、capabilities `core:default` 已覆盖前端 `listen`、`generate:bindings` / `test:rust` 脚本名与 README 一致（`package.json`）。

---

## 2. `tempo.rs` 逐段审查结论

按源文件顺序，逐块给出"对/错/要改"：

| tempo.rs 位置 | 内容 | 结论 |
|---|---|---|
| 1-13 | imports + 常量（180s 捕获超时 / 500ms 轮询 / 10s 关闭超时） | ✅ 可编译。`OsStr`(L3) 仅 macOS 用到，Windows 构建是 unused-import warning（Task 2 顺手 cfg 掉） |
| 15-46 | 状态/进程/备份的结构体 | ✅ |
| 48-137 | 主流程 `launch_game_via_tempo` | ⚠️ 4 个问题：无并发互斥（P1-6）；`is_trampolined` 的 Err 被 `unwrap_or(false)` 吞掉（P2-11）；失败路径不发 `error` 事件（P1-8）；修复态（蹦床被游戏更新还原）未预检（P2-10） |
| 59-62 | 启动前"游戏已在运行"预检 | ✅ 设计上保守正确；错误文案改为稳定错误码（Task 5） |
| 64-78, 106-112, 127-132 | macOS 蹦床临时卸载/重装 | ✅ 三个函数签名逐一核验匹配：`is_trampolined(&Path)->Result<bool,String>`（`trampoline.rs:498`）、`uninstall_trampoline(&Path)`（`:508`）、`install_trampoline(&AppHandle,&Path)`（`:503`）；失败路径也会重装（L127-132） |
| 139-147 | `emit_status` | ✅ 机制对；内容是硬编码英文（P0-4，Task 5 改） |
| 149-188 | 游戏目录解析 + 校验 | ✅ 复用 `fallback_game_candidates()`（`game_path.rs:125`，`pub(crate)`） |
| 190-297 | Tempo Launcher 定位（显式路径 → 游戏目录祖先 ×4 → 平台标准路径） | ✅ 覆盖 `%LOCALAPPDATA%/%APPDATA%` Squirrel 路径与 `/Applications`、`~/Applications` |
| 299-320 | `default_mod_items()` 移除清单 | ❌ 三处与现实不符（P1-7）：`'BazaarPlusPlus'` 是上游项目的陈旧条目（本仓库数据目录是 `BazaarPlusPlusV4`，`config.rs:1`，且不在 payload 根清单里）；macOS 列了 `doorstop_config.ini` 但该文件仅 Windows 安装（`payload.rs:92-95`）；**漏掉 `.bpp-launch-mode`**（macOS 启动模式标记，写在游戏根目录，`trampoline.rs:24,57-60`）——校验期间它会作为"外来文件"留在目录里。Task 2 改为复用 `payload_root_relative_paths()`（`payload.rs:83`，需提为 `pub(crate)`）+ 标记文件 |
| 322-402 | `BackupSession`（临时目录 = temp_dir/PID-毫秒戳；Drop 兜底恢复） | ✅ 碰撞概率可忽略；Drop 恢复正确。备份用 copy+delete，BepInEx 目录较大时每次启动有秒级开销——可选优化为 rename-优先（见"显式不做"） |
| 404-417 | `safe_relative_item`（拒绝绝对路径和 `..`） | ✅ 有单测（L827-829） |
| 457-480 | `start_launcher`：macOS 用 `open -n` | ⚠️ `-n` 强制开新实例——Launcher 已在运行时会开出第二个。Task 2 去掉 `-n` |
| 482-503 | 等进程出现 / 等进程退出（超时后 SIGKILL/taskkill -F） | ✅ |
| 505-559 | Windows 进程查询：PowerShell CIM `Win32_Process` → JSON | ✅ 过滤串是硬编码字面量，无注入面；`CommandLine` 由 Windows 规范带引号，解析可靠。❌ 未设 `CREATE_NO_WINDOW`：500ms 轮询 × 最长 180s = 数百次 PowerShell 弹黑窗（P1-5，Task 4） |
| 561-591 | macOS 进程查询：`pgrep -f TheBazaar` + `ps -ww -o command=` 二次过滤 | ✅ 二次过滤（须含完整 exe 路径或 `TheBazaar.app`）压低了误报；残余误报只会让预检保守地拒绝启动，可接受 |
| 611-623, 732-778 | 命令行参数提取 | ⚠️ P0-3：Windows 路径带引号→可靠（有单测 L817-824）。macOS `ps` 输出**不带引号**，标准 Tempo 路径含空格（`Application Support`、`Tempo Launcher - Beta`）：当 `ps` 报告的 argv[0] 与我们计算的 exe 路径**逐字相同**时，`starts_with_path`(L763-768) 的整段前缀比较仍正确；但只要拼写不同（符号链接解析、`/private` 前缀、相对路径），就落入 L745-749 的"按空白切第一个 token"兜底——含空格路径会被切碎，**静默产出错误参数**。Task 3 增加"锚定 `.app/Contents/MacOS/TheBazaar` 后缀"的解析层 + 单测 |
| 685-730 | `launch_modded_game` | ✅ 蹦床分支直接执行 stub（参数会被 execv 转发）；prefix 分支执行 `run_bepinex.sh "$@"`。"脚本缺失时裸启动"对未装模组用户是**正确的**原版启动语义，不改；蹦床被还原的病态情况由 Task 6 预检拦截 |
| 780-810 | `split_command_line`（引号 + 反斜杠转义） | ✅ Windows 语义正确，有单测 |
| 812-830 | 2 个单测 | ✅ 保留，Task 3 扩充 |

**审查中证伪的两个"问题"**（不要据此改代码）：Tauri `invoke` 没有默认 IPC 超时，"前端 30-60s 超时"的说法不成立；`BackupSession` 的 Drop 在 tauri 命令线程 panic 时由命令边界兜住，无前端可见 panic。

---

## 3. 设计决策（启动游戏的设计）

### D1. 双启动流，按路径自动选择 —— 不照搬适配包的"整体替换"

适配包把 `launch_game` 从 `steam://rungameid/1617400` **替换**成 Tempo 捕获流。这有三个代价：现有 Steam 用户（当前全部用户）被迫从"零交互、即点即玩"降级到"每次启动点一次 PLAY + 文件搬动窗口期"；`launch_game_via_steam` 变死代码（`lib.rs:4` 的 `mod services;` 是私有模块，会触发 dead_code warning）；Steam 副本 + Tempo 副本共存机器上有"从 A 副本删文件、Tempo 校验 B 副本"的错配风险。

**决策：保留两条流，后端按已解析游戏目录自动选择：**

```
flow = if steam_path.is_some() && game_path 含 "steamapps" 组件 → Steam（今天的行为，零变化）
       else                                                     → TempoNative
```

- 路径判定天然解决"双副本错配"：steamapps 下的副本走 Steam 流，Tempo 目录下的副本走捕获流。
- `InstallState` 新增 `launch_flow: "steam" | "tempo"` 字段给 UI 渲染提示文案（"将通过 Tempo Launcher 启动，请在弹窗中点击 PLAY"）。
- `launch_options_unsupported` 警告（`install/mod.rs:178-183`）只在 steam 流下展示——Tempo-native 用户根本不需要 Steam 启动项，现在的警告对他们是噪音。

检测优先级保持适配包语义：`requested(用户手选) > startup(Steam 检测) > fallback(新增 Tempo 候选路径)`。双安装用户默认仍解析到 Steam 副本 → 走 Steam 流，行为不变。

### D2. 命令必须异步化

适配包的 `launch_game` 仍是 `#[tauri::command]` 同步命令——Tauri 2 同步命令**在主线程上执行**。捕获流最长阻塞 180s+，主线程被占死意味着整个窗口冻结、`emit_status` 的事件也无法被 webview 渲染。本仓库已有先例：`get_install_state` 正是为此标了 `#[tauri::command(async)]`（`commands/install.rs:13`）。**决策：`launch_game` 改 `#[tauri::command(async)]`**（同步 fn + async 标记 → Tauri 派独立线程，阻塞无害，事件实时可达）。

### D3. 后端持有并发互斥 + 可取消

前端 `useAsyncAction` 的 single-flight 门只防 UI 重复点击，不防多窗口/重入。后端加 `static AtomicBool` 在飞锁（错误码 `tempo_launch_already_in_progress`）。另加 `cancel_tempo_launch` 命令置取消标志，两个轮询循环检查——180s 等待期用户必须有退出手段（取消走与失败相同的恢复路径：还原 payload、重装蹦床）。

### D4. 状态事件传 phase 码，前端查 i18n 表

仓库已有成熟模式：后端发稳定错误码前缀（`bepinex/mod.rs:21-22` 的 `RESET_BPP_DATA_ERR_*`），前端 `parseResetBppDataError` 映射到本地化文案（`useInstallPage.ts:165-176`）。`messages.ts` 是类型化目录（`MessageKey = keyof typeof zh`，`en: Record<MessageKey, string>` 编译期奇偶校验，`messages.ts:193-195`）。适配包发 9 条硬编码英文并由前端裸 `setMessage`——zh 默认用户会看到全英文进度。**决策：事件 payload 保持 `{phase, message}`（message 留作调试细节），前端按 `phase → MessageKey` 映射展示，未知 phase 忽略（向前兼容）；新增 `error` phase；启动类错误用稳定错误码前缀。**

### D5. 移除清单以 `payload_root_relative_paths()` 为单一事实来源

`payload.rs:83-99` 已是安装/卸载共用的根级 payload 清单（`BepInEx` + macOS `run_bepinex.sh`/`libdoorstop.dylib` + Windows `doorstop_config.ini`/`winhttp.dll`）。tempo.rs 再手写一份必然漂移（已经漂了三处，见 §2）。**决策：提升为 `pub(crate)` 复用，再追加 `.bpp-launch-mode` 标记文件。`BazaarPlusPlusV4/` 数据目录（含 SQLite/回放，可能数百 MB）暂不搬动**——没有证据表明 Tempo 校验会拒绝未知目录；若实测被拒，再升级为 rename 搬移（同卷瞬时完成），不做 copy。

### 显式不做（YAGNI）

- 不做备份的 rename-优先优化（copy 已正确，慢但可接受；实测痛了再说）。
- 不加 UI 的"Tempo Launcher 路径手选"（`requested_launcher_path` 参数留 `None`，自动探测覆盖标准安装；探测不到时错误码提示安装 Tempo Launcher）。
- 不替换 PowerShell/pgrep 为进程巡检 crate（适配包的"零新依赖"取舍正确）。
- 不动 `BazaarPlusPlusV4` 数据目录（见 D5）。

---

## 4. 文件结构

| 文件 | 动作 | 职责 |
|---|---|---|
| `src-tauri/src/services/tempo.rs` | vendor 后修改 | 捕获-重放流程全部逻辑（互斥、取消、备份、进程、参数解析） |
| `src-tauri/src/services/mod.rs` | 补丁自动 | 注册 `pub mod tempo;` |
| `src-tauri/src/commands/install.rs` | 修改 | `launch_game` 异步化 + 走 `launch_game_auto`；新增 `cancel_tempo_launch` |
| `src-tauri/src/commands/registry.rs` | 修改 | 注册 `cancel_tempo_launch` |
| `src-tauri/src/services/install/mod.rs` | 补丁自动 + 修改 | Steam 可选化（补丁）；`LaunchFlow` 选择逻辑、`launch_game_auto`、警告门控 |
| `src-tauri/src/services/install/types.rs` | 修改 | `InstallState` 加 `launch_flow` |
| `src-tauri/src/services/bepinex/mod.rs` | 补丁自动 + 修改 | Steam 可选化（补丁）；re-export `payload_root_relative_paths`、`MARKER_FILE` |
| `src-tauri/src/services/bepinex/payload.rs` | 修改 | `payload_root_relative_paths` 提 `pub(crate)` |
| `src-tauri/src/services/bepinex/trampoline.rs` | 修改 | `MARKER_FILE` 提 `pub(crate)` |
| `src-tauri/src/services/detect/mod.rs` | 补丁自动 | 检测链尾追加 Tempo 候选路径 |
| `src-tauri/src/services/game_path.rs` | 补丁自动 | Tempo 安装路径候选（macOS/Windows） |
| `src/features/install/useInstallPage.ts` | 补丁自动 + 重写监听器 | phase→i18n 映射、launch 错误码映射、cancelLaunch |
| `src/features/install/installApi.ts` | 修改 | `emptyInstallState.launch_flow`、`cancelTempoLaunch()` |
| `src/features/install/InstallActionsPanel.tsx` | 修改 | Tempo 流提示文案 + 取消按钮 |
| `src/api/tauri.ts` | 修改 | `cancel_tempo_launch` 命令映射 |
| `src/api/tauri-command-registry.test.ts` | 修改 | 新命令参数表 |
| `src/i18n/messages.ts` | 修改 | 全部新 key（zh + en） |

---

### Task 0: 干净分支上 vendor 适配包

**Files:** 全部补丁目标（见 §1 表）

- [ ] **Step 0.1: 确认工作区干净并建分支**

```bash
cd /Users/yxinyu/codes/bpp/bazaarplusplus-installer
git status --porcelain        # 必须无输出；补丁脚本没有回滚，靠 git 兜底
git checkout -b tempo-native-launch
```

- [ ] **Step 0.2: 执行补丁脚本**

```bash
node /Users/yxinyu/Downloads/tempo_native_adoption/apply-tempo-native-launch.mjs
```

预期输出：`Tempo native launch patch applied. ...`。§1 已验证全部 marker 唯一且存在，不应抛错；若抛错立即 `git checkout . && git clean -fd src-tauri/src/services/tempo.rs` 复原再排查。

- [ ] **Step 0.3: 编译门**

```bash
npm install            # 如 node_modules 缺失
npm run generate:bindings
npm run check          # tsc --noEmit，监听器插入块应通过
npm run test:rust      # tempo.rs 自带 2 个单测应通过
```

预期：编译通过；**会出现** `launch_game_via_steam` 的 dead_code warning（`lib.rs:4` `mod services;` 私有所致）——这是已知中间状态，Task 1 消除。

- [ ] **Step 0.4: 提交 vendor 基线**

```bash
git add -A
git commit -m "Vendor tempo_native_adoption patch as baseline"
```

---

### Task 1: 双启动流 + 命令异步化 + `launch_flow` 状态字段

**Files:**
- Modify: `src-tauri/src/services/install/mod.rs`
- Modify: `src-tauri/src/services/install/types.rs`
- Modify: `src-tauri/src/commands/install.rs`
- Modify: `src/features/install/installApi.ts`
- Test: `src-tauri/src/services/install/mod.rs`（同文件 `#[cfg(test)]`）

- [ ] **Step 1.1: 写失败的单测（纯函数，真实行为）**

在 `install/mod.rs` 文件末尾追加：

```rust
#[cfg(test)]
mod tests {
    use super::{path_contains_steamapps, resolve_launch_flow, LaunchFlow};

    #[test]
    fn steam_flow_when_steam_present_and_game_under_steamapps() {
        assert_eq!(
            resolve_launch_flow(
                Some("/Users/a/Library/Application Support/Steam"),
                Some("/Users/a/Library/Application Support/Steam/steamapps/common/The Bazaar"),
            ),
            LaunchFlow::Steam
        );
    }

    #[test]
    fn tempo_flow_for_tempo_native_game_dir_even_with_steam_installed() {
        assert_eq!(
            resolve_launch_flow(
                Some("C:\\Program Files (x86)\\Steam"),
                Some("C:\\Users\\a\\AppData\\Roaming\\Tempo Launcher - Beta\\game\\buildx64"),
            ),
            LaunchFlow::TempoNative
        );
    }

    #[test]
    fn tempo_flow_when_steam_missing() {
        assert_eq!(
            resolve_launch_flow(None, Some("/anything/steamapps/common/The Bazaar")),
            LaunchFlow::TempoNative
        );
    }

    #[test]
    fn steamapps_component_match_is_case_insensitive_and_component_exact() {
        assert!(path_contains_steamapps("D:\\SteamLibrary\\SteamApps\\common\\The Bazaar"));
        assert!(!path_contains_steamapps("/Users/a/my-steamapps-notes/game"));
    }
}
```

- [ ] **Step 1.2: 跑测试确认失败**

```bash
npm run test:rust
```

预期：FAIL，`cannot find function resolve_launch_flow`。

- [ ] **Step 1.3: 实现流选择与统一入口**

`install/mod.rs`：删除补丁插入的 `launch_game_via_tempo` 包装函数（`launch_game_via_steam` 之后那段），替换为：

```rust
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum LaunchFlow {
    Steam,
    TempoNative,
}

/// Steam flow only when BOTH a Steam client is detected AND the resolved game
/// dir is a Steam copy (has a `steamapps` path component). Everything else —
/// including a Tempo-native copy on a machine that also has Steam — uses the
/// Tempo capture flow, so files are never removed from one copy while Tempo
/// validates another.
pub(crate) fn resolve_launch_flow(
    steam_path: Option<&str>,
    game_path: Option<&str>,
) -> LaunchFlow {
    let under_steamapps = game_path.map(path_contains_steamapps).unwrap_or(false);
    if steam_path.is_some() && under_steamapps {
        LaunchFlow::Steam
    } else {
        LaunchFlow::TempoNative
    }
}

fn path_contains_steamapps(path: &str) -> bool {
    Path::new(path).components().any(|component| {
        component
            .as_os_str()
            .to_string_lossy()
            .eq_ignore_ascii_case("steamapps")
    })
}

pub fn launch_game_auto(
    app: tauri::AppHandle,
    state: tauri::State<'_, InstallerContextState>,
    game_path: Option<String>,
) -> Result<(), String> {
    let snapshot = detect_for_install(app.clone(), state, game_path)?;
    match resolve_launch_flow(snapshot.steam_path.as_deref(), snapshot.game_path.as_deref()) {
        LaunchFlow::Steam => launch_game_via_steam(),
        LaunchFlow::TempoNative => {
            crate::services::tempo::launch_game_via_tempo(app, snapshot.game_path.clone(), None)
        }
    }
}
```

`launch_game_via_steam` 重新被引用，dead_code warning 消失。

- [ ] **Step 1.4: 命令异步化**

`commands/install.rs`：import 行把补丁产物 `launch_game_via_tempo` 换成 `launch_game_auto`；函数改为：

```rust
#[tauri::command(async)]
pub fn launch_game(
    app: tauri::AppHandle,
    state: tauri::State<'_, InstallerContextState>,
    game_path: Option<String>,
) -> Result<FileActionResult, String> {
    launch_game_auto(app, state, game_path)?;
    Ok(FileActionResult { ok: true })
}
```

（`AppHandle`/`State` 被 Tauri 从 IPC 签名滤除，前端入参仍是 `{ gamePath }`，`tauri-command-registry.test.ts:29` 的 `launch_game: ['gamePath']` 不变。）

- [ ] **Step 1.5: `InstallState.launch_flow` + 警告门控**

`install/types.rs` 的 `InstallState` 增加字段（紧随 `steam_launch_options_supported`）：

```rust
    pub launch_flow: String,
```

`install/mod.rs` 的 `install_state_from_snapshot`：

```rust
    let launch_flow = match resolve_launch_flow(env.steam_path.as_deref(), env.game_path.as_deref())
    {
        LaunchFlow::Steam => "steam".to_string(),
        LaunchFlow::TempoNative => "tempo".to_string(),
    };
```

`launch_options_unsupported` 警告包上流判断（Tempo 流不需要 Steam 启动项）：

```rust
    if launch_flow == "steam" && !env.steam_launch_options_supported {
        warnings.push(InstallWarning {
            code: "launch_options_unsupported".to_string(),
            message: "当前平台或 Steam 目录不支持自动写入启动项。".to_string(),
        });
    }
```

`InstallState { ... }` 构造里加 `launch_flow,`。

- [ ] **Step 1.6: 前端空状态补字段**

`installApi.ts` 的 `emptyInstallState` 增加 `launch_flow: 'steam',`。

- [ ] **Step 1.7: 全量验证**

```bash
npm run generate:bindings   # InstallState TS 类型再生成
npm run test:rust           # Step 1.1 的 4 个测试转 PASS
npm run check
```

- [ ] **Step 1.8: Commit**

```bash
git add -A && git commit -m "Keep Steam launch and select Tempo flow by game path"
```

---

### Task 2: tempo.rs 正确性批改（互斥 / 移除清单 / open -n / error 事件 / unused import）

**Files:**
- Modify: `src-tauri/src/services/tempo.rs`
- Modify: `src-tauri/src/services/bepinex/payload.rs:83`
- Modify: `src-tauri/src/services/bepinex/trampoline.rs:24`
- Modify: `src-tauri/src/services/bepinex/mod.rs:5-9`

- [ ] **Step 2.1: 暴露 payload 清单与标记文件名**

`payload.rs:83`：`fn payload_root_relative_paths()` → `pub(crate) fn payload_root_relative_paths()`。
`trampoline.rs:24`：`const MARKER_FILE` → `pub(crate) const MARKER_FILE`。
`bepinex/mod.rs`：re-export 区追加：

```rust
pub(crate) use payload::payload_root_relative_paths;
```

并把 `MARKER_FILE` 加进既有的 `pub(crate) use trampoline::{...}` 列表。

- [ ] **Step 2.2: 移除清单改单一事实来源**

`tempo.rs`：删除 `default_mod_items()`（L299-320），替换为：

```rust
/// Everything the installer puts at the game root, plus the macOS launch-mode
/// marker — all of it must be out of the way while Tempo validates the game.
/// The BazaarPlusPlusV4 data dir is intentionally left in place (large, and no
/// evidence Tempo rejects unknown dirs); escalate to a rename-move if it does.
fn removal_items() -> Vec<String> {
    let mut items: Vec<String> = crate::services::bepinex::payload_root_relative_paths()
        .into_iter()
        .map(str::to_string)
        .collect();
    items.push(crate::services::bepinex::MARKER_FILE.to_string());
    items
}
```

`backup_and_remove` 签名 `items: &[&str]` → `items: &[String]`（循环体内 `safe_relative_item(item)` 不变，`&String` 自动 deref）。主流程 L83 改为：

```rust
        backup.backup_and_remove(&game_dir, &removal_items())?;
```

- [ ] **Step 2.3: 在飞互斥**

`tempo.rs` 顶部：

```rust
use std::sync::atomic::{AtomicBool, Ordering};

static LAUNCH_IN_FLIGHT: AtomicBool = AtomicBool::new(false);

struct InFlightGuard;

impl Drop for InFlightGuard {
    fn drop(&mut self) {
        LAUNCH_IN_FLIGHT.store(false, Ordering::SeqCst);
    }
}
```

`launch_game_via_tempo` 函数体最前面（`emit_status("prepare", ...)` 之前）：

```rust
    if LAUNCH_IN_FLIGHT
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        return Err("tempo_launch_already_in_progress".to_string());
    }
    let _in_flight = InFlightGuard;
```

- [ ] **Step 2.4: 既有错误改稳定错误码（沿用 `RESET_BPP_DATA_ERR_*` 前缀模式）**

L61 的已在运行错误改为：

```rust
        return Err(format!(
            "tempo_game_already_running: {} process(es) matched",
            existing.len()
        ));
```

L214 的找不到 Launcher 错误改为：

```rust
    Err("tempo_launcher_not_found".to_string())
```

L491 的捕获超时错误改为：

```rust
    Err("tempo_capture_timeout".to_string())
```

- [ ] **Step 2.5: 失败时发 error 事件**

L125-134 的错误处理块加一行（在 `return Err(err);` 前）：

```rust
        emit_status(&app, "error", err.clone());
```

- [ ] **Step 2.6: macOS `open` 去掉 `-n`**

L468-470（AppBundle 分支）：删除 `.args(["-n"])` —— `open` 不带 `-n` 会激活已运行实例而不是开第二个。

- [ ] **Step 2.7: `OsStr` import 加 cfg**

L3 改为：

```rust
#[cfg(target_os = "macos")]
use std::ffi::OsStr;
```

- [ ] **Step 2.8: 验证 + Commit**

```bash
npm run test:rust && npm run check
git add -A && git commit -m "Fix tempo launch payload list, concurrency, and status semantics"
```

---

### Task 3: macOS 参数捕获健壮化（TDD）

**Files:**
- Modify: `src-tauri/src/services/tempo.rs`（实现 + `#[cfg(test)]` 区）

- [ ] **Step 3.1: 写失败的单测**

`tempo.rs` tests mod 追加：

```rust
    #[cfg(target_os = "macos")]
    #[test]
    fn parses_macos_unquoted_spaced_path_exact_match() {
        let exe = Path::new(
            "/Users/a/Library/Application Support/Tempo Launcher - Beta/game/buildx64/TheBazaar.app/Contents/MacOS/TheBazaar",
        );
        let args = extract_args_after_executable(
            "/Users/a/Library/Application Support/Tempo Launcher - Beta/game/buildx64/TheBazaar.app/Contents/MacOS/TheBazaar --token abc --user xy",
            exe,
        );
        assert_eq!(args, vec!["--token", "abc", "--user", "xy"]);
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn parses_macos_path_spelling_mismatch_via_suffix_anchor() {
        // `ps` may report a resolved/symlinked spelling that differs from the
        // path we computed; the unquoted spaced path must still parse.
        let exe = Path::new(
            "/Users/a/Library/Application Support/Tempo Launcher - Beta/game/buildx64/TheBazaar.app/Contents/MacOS/TheBazaar",
        );
        let args = extract_args_after_executable(
            "/private/tmp/some copy/TheBazaar.app/Contents/MacOS/TheBazaar --token abc",
            exe,
        );
        assert_eq!(args, vec!["--token", "abc"]);
    }
```

- [ ] **Step 3.2: 跑测试确认第二个失败**

```bash
npm run test:rust
```

预期：`parses_macos_path_spelling_mismatch_via_suffix_anchor` FAIL（兜底逻辑把含空格路径切碎，首参变成 `tmp/some`），第一个 PASS（前缀整段比较本就正确）。

- [ ] **Step 3.3: 实现后缀锚定解析**

`tempo.rs` 在 `extract_args_after_executable` 附近新增：

```rust
/// Anchor on a suffix that uniquely terminates the executable path inside a
/// (possibly unquoted) command line. Handles macOS `ps` output, where argv is
/// joined with spaces and never quoted, and the reported path spelling may
/// differ from the one we computed (symlinks, /private prefix).
fn strip_executable_by_suffix<'a>(command_line: &'a str, game_exe: &Path) -> Option<&'a str> {
    let anchor = executable_anchor(game_exe)?;
    let lowered = command_line.to_ascii_lowercase();
    let needle = anchor.to_ascii_lowercase();
    let start = lowered.find(&needle)?;
    let rest = &command_line[start + needle.len()..];
    match rest.chars().next() {
        None => Some(rest),
        Some('"') => Some(&rest[1..]),
        Some(ch) if ch.is_whitespace() => Some(rest),
        _ => None,
    }
}

fn executable_anchor(game_exe: &Path) -> Option<String> {
    let file_name = game_exe.file_name()?.to_string_lossy().into_owned();
    #[cfg(target_os = "macos")]
    {
        return Some(format!(".app/Contents/MacOS/{file_name}"));
    }
    #[cfg(not(target_os = "macos"))]
    {
        Some(file_name)
    }
}
```

`extract_args_after_executable` 在 `starts_with_path` 分支之后、"切第一个 token"兜底之前插入：

```rust
    if let Some(rest) = strip_executable_by_suffix(trimmed, executable_path) {
        return split_command_line(rest);
    }
```

- [ ] **Step 3.4: 验证 + Commit**

```bash
npm run test:rust   # 两个新测试 + 既有 Windows 测试全 PASS
git add -A && git commit -m "Anchor macOS arg extraction on the executable suffix"
```

---

### Task 4: Windows 隐藏控制台窗口

**Files:**
- Modify: `src-tauri/src/services/tempo.rs`

- [ ] **Step 4.1: 静默命令构造器**

```rust
/// On Windows, console tools spawned from a GUI app flash a console window per
/// invocation; the capture loop polls PowerShell every 500ms for up to 180s.
fn quiet_command(program: &str) -> Command {
    #[allow(unused_mut)]
    let mut command = Command::new(program);
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        command.creation_flags(CREATE_NO_WINDOW);
    }
    command
}
```

替换三处构造：`list_game_processes` 的 `Command::new("powershell")`（L507）、`terminate_process` 的 `Command::new("taskkill")`（L628）、`force_terminate_process` 的 `Command::new("taskkill")`（L650）→ 均改为 `quiet_command("powershell")` / `quiet_command("taskkill")`。

- [ ] **Step 4.2: 验证 + Commit**

```bash
npm run test:rust   # macOS 上编译验证 cfg 不破坏构建；Windows 行为进手工矩阵
git add -A && git commit -m "Hide console windows for Windows process tooling"
```

（注意：`#[cfg(target_os = "windows")]` 分支在 macOS 上不编译；Windows 编译正确性靠手工矩阵第 1 项或 Windows 机器上的 `cargo check` 确认。）

---### Task 5: 状态事件与错误的 i18n

**Files:**
- Modify: `src/i18n/messages.ts`
- Modify: `src/features/install/useInstallPage.ts`

- [ ] **Step 5.1: 增加 message keys（zh 区 + en 区各一份；en 缺 key 会编译失败）**

`messages.ts` `zh` 对象内（建议放在 install 相关 key 附近）：

```ts
  // Tempo native launch
  tempoLaunchHint: '将通过 Tempo Launcher 启动：弹出 Tempo 窗口后请点击 PLAY。',
  tempoLaunchPrepare: '正在准备 Tempo 原生启动…',
  tempoLaunchBackup: '正在备份并临时移除模组文件…',
  tempoLaunchLauncher: 'Tempo Launcher 已启动，请在 Tempo 窗口中点击 PLAY 继续。',
  tempoLaunchCapture: '已捕获游戏会话，正在切换到模组版本…',
  tempoLaunchRestore: '正在恢复模组文件…',
  tempoLaunchLaunching: '正在以模组模式启动游戏…',
  tempoLaunchDone: '游戏正在启动。',
  tempoLaunchFailed: 'Tempo 启动失败，模组文件已恢复。',
  tempoLaunchInProgress: '已有一次启动正在进行中。',
  tempoGameAlreadyRunning: 'The Bazaar 已在运行，请先关闭游戏再启动。',
  tempoLauncherNotFound: '未找到 Tempo Launcher，请先安装 Tempo Launcher。',
  tempoCaptureTimeout: '等待 Tempo 启动游戏超时，请在 Tempo 窗口中点击 PLAY 后重试。',
```

`en` 对象内：

```ts
  // Tempo native launch
  tempoLaunchHint: 'Launching goes through Tempo Launcher: click PLAY in the Tempo window when it appears.',
  tempoLaunchPrepare: 'Preparing native Tempo launch…',
  tempoLaunchBackup: 'Backing up and temporarily removing mod files…',
  tempoLaunchLauncher: 'Tempo Launcher started — click PLAY in Tempo to continue.',
  tempoLaunchCapture: 'Captured the game session, switching to the modded build…',
  tempoLaunchRestore: 'Restoring mod files…',
  tempoLaunchLaunching: 'Launching the modded game…',
  tempoLaunchDone: 'The Bazaar is starting.',
  tempoLaunchFailed: 'Tempo launch failed. Mod files were restored.',
  tempoLaunchInProgress: 'A launch is already in progress.',
  tempoGameAlreadyRunning: 'The Bazaar is already running. Close it before launching.',
  tempoLauncherNotFound: 'Tempo Launcher was not found. Install Tempo Launcher first.',
  tempoCaptureTimeout: 'Timed out waiting for Tempo to start the game. Click PLAY in Tempo, then try again.',
```

- [ ] **Step 5.2: 重写事件监听器（替换 Task 0 vendor 进来的裸英文版本）**

`useInstallPage.ts`：import 区补 `import type { MessageKey } from '../../i18n/messages';`。把补丁插入的 `tempo-launch-status` useEffect 整块替换为：

```ts
  const TEMPO_PHASE_MESSAGES: Partial<Record<string, MessageKey>> = useMemo(
    () => ({
      prepare: 'tempoLaunchPrepare',
      backup: 'tempoLaunchBackup',
      launcher: 'tempoLaunchLauncher',
      capture: 'tempoLaunchCapture',
      restore: 'tempoLaunchRestore',
      launch: 'tempoLaunchLaunching',
      done: 'tempoLaunchDone',
      error: 'tempoLaunchFailed'
    }),
    []
  );

  useEffect(() => {
    if (!hasTauriRuntime()) return;
    const unlisten = listen<{ phase: string; message: string }>(
      'tempo-launch-status',
      (event) => {
        const key = TEMPO_PHASE_MESSAGES[event.payload.phase];
        if (key) setMessage(t(key));
      }
    );
    return () => {
      void unlisten.then((stop) => stop());
    };
  }, [t, TEMPO_PHASE_MESSAGES]);
```

- [ ] **Step 5.3: launch 错误码映射（沿用 `formatResetBppDataError` 模式）**

`useInstallPage.ts` 底部 helper 区追加：

```ts
function formatTempoLaunchError(error: unknown, t: Translate) {
  const message = toErrorMessage(error);
  if (message.includes('tempo_launch_already_in_progress')) return t('tempoLaunchInProgress');
  if (message.includes('tempo_game_already_running')) return t('tempoGameAlreadyRunning');
  if (message.includes('tempo_launcher_not_found')) return t('tempoLauncherNotFound');
  if (message.includes('tempo_capture_timeout')) return t('tempoCaptureTimeout');
  return message;
}
```

`launch` 回调改为：

```ts
  const launch = useCallback(
    () =>
      run(
        'launch',
        async () => {
          await launchGame(state.selected_game_path ?? undefined);
        },
        { errorMessage: (caught) => formatTempoLaunchError(caught, t) }
      ),
    [run, state.selected_game_path, t]
  );
```

- [ ] **Step 5.4: 启动按钮旁的 Tempo 提示**

`InstallActionsPanel.tsx` 的 `primaryMode === 'launch'` 分支（约 L124-140），按钮下方加：

```tsx
      {page.state.launch_flow === 'tempo' && (
        <p className="m-0 text-xs text-[rgba(214,224,255,0.6)]">
          {t('tempoLaunchHint')}
        </p>
      )}
```

（className 按该文件相邻提示文案的现有样式微调，保持一致。）

- [ ] **Step 5.5: 验证 + Commit**

```bash
npm run check       # MessageKey 奇偶校验 + 监听器类型
npm run test:unit
git add -A && git commit -m "Localize Tempo launch status events and errors"
```

---

### Task 6: macOS 修复态预检

**Files:**
- Modify: `src-tauri/src/services/tempo.rs`
- Modify: `src-tauri/src/services/detect/mod.rs:11`（`is_bepinex_installed` 提为 `pub(crate) use`）
- Modify: `src/i18n/messages.ts` / `useInstallPage.ts`（一个错误码 key）

蹦床被游戏更新还原（marker 仍是 trampoline、`is_trampolined` 为 false）时，捕获流会在 macOS 27+ 上走 prefix 启动——必然失败且报错难懂。检测层已经会把这种状态标记为需要修复（`install/mod.rs:161-163` 的 `trampoline_consistent`），启动前应直接拦截。

- [ ] **Step 6.1: 暴露 `is_bepinex_installed`**

`detect/mod.rs:11`：`use game::{is_bepinex_installed, read_installed_bpp_version};` → `pub(crate) use game::{is_bepinex_installed, read_installed_bpp_version};`（`read_installed_bpp_version` 维持原可见性所需的最小改动即可）。

- [ ] **Step 6.2: 预检逻辑**

`tempo.rs` `launch_game_via_tempo` 中、蹦床临时卸载块（L64-78）之前加：

```rust
    #[cfg(target_os = "macos")]
    {
        let installed = crate::services::detect::is_bepinex_installed(&game_dir);
        let desired = crate::services::macos_version::trampoline_forced()
            || crate::services::bepinex::read_launch_mode_marker(&game_dir)
                == Some(crate::services::bepinex::LaunchMode::Trampoline);
        let applied = crate::services::bepinex::is_trampolined(&game_dir).unwrap_or(false);
        if installed && desired != applied {
            return Err("tempo_install_needs_repair".to_string());
        }
    }
```

（`installed` 门控保证：从未安装模组的用户、和 macOS 27+ 上想原版启动的用户不会被误拦。`is_bepinex_installed` 入参类型以 `detect/game.rs` 实际签名为准——若为 `&Path` 则传 `&game_dir` 即可。）

- [ ] **Step 6.3: 错误码 key**

`messages.ts` 两个 locale 各加：

```ts
  tempoInstallNeedsRepair: '检测到游戏文件被还原，请先点击"重新安装"修复后再启动。',
```

```ts
  tempoInstallNeedsRepair: 'Game files were reverted. Click Reinstall to repair before launching.',
```

`formatTempoLaunchError` 加一行：

```ts
  if (message.includes('tempo_install_needs_repair')) return t('tempoInstallNeedsRepair');
```

- [ ] **Step 6.4: 验证 + Commit**

```bash
npm run test:rust && npm run check
git add -A && git commit -m "Block Tempo launch when the trampoline needs repair"
```

---

### Task 7: 取消支持

**Files:**
- Modify: `src-tauri/src/services/tempo.rs`
- Modify: `src-tauri/src/commands/install.rs`、`src-tauri/src/commands/registry.rs:13` 附近
- Modify: `src/api/tauri.ts`、`src/api/tauri-command-registry.test.ts`
- Modify: `src/features/install/installApi.ts`、`useInstallPage.ts`、`InstallActionsPanel.tsx`、`messages.ts`

- [ ] **Step 7.1: Rust 取消标志**

`tempo.rs`：

```rust
static CANCEL_REQUESTED: AtomicBool = AtomicBool::new(false);

pub(crate) fn request_cancel() {
    CANCEL_REQUESTED.store(true, Ordering::SeqCst);
}

fn cancel_requested() -> bool {
    CANCEL_REQUESTED.load(Ordering::SeqCst)
}
```

`launch_game_via_tempo` 在飞锁获取成功后立刻 `CANCEL_REQUESTED.store(false, Ordering::SeqCst);`。`wait_for_game_process` 与 `wait_for_process_exit` 的轮询循环体首行加：

```rust
        if cancel_requested() {
            return Err("tempo_launch_cancelled".to_string());
        }
```

（错误从闭包冒出后走既有失败路径：恢复 payload、重装蹦床、发 `error` 事件。）

- [ ] **Step 7.2: 命令 + 注册**

`commands/install.rs`：

```rust
#[tauri::command]
pub fn cancel_tempo_launch() -> Result<FileActionResult, String> {
    crate::services::tempo::request_cancel();
    Ok(FileActionResult { ok: true })
}
```

`commands/registry.rs` 的命令表加 `(commands::install, cancel_tempo_launch),`。

- [ ] **Step 7.3: 前端贯通**

`npm run generate:bindings` 后：`src/api/tauri.ts` `TauriCommandMap` 加：

```ts
  cancel_tempo_launch: {
    input: undefined;
    output: FileActionResult;
  };
```

`tauri-command-registry.test.ts` 参数表加 `cancel_tempo_launch: []`。`installApi.ts`：

```ts
export async function cancelTempoLaunch() {
  if (!hasTauriRuntime()) {
    return { ok: true };
  }
  return invokeCommand('cancel_tempo_launch', undefined);
}
```

`useInstallPage.ts`（**不走** `run()`——single-flight 门正被 launch 占用）：

```ts
  const cancelLaunch = useCallback(() => {
    void cancelTempoLaunch();
  }, []);
```

加入返回对象。`InstallActionsPanel.tsx` 启动按钮区，`page.action === 'launch' && page.state.launch_flow === 'tempo'` 时渲染取消按钮（样式对齐相邻次要按钮），onClick={page.cancelLaunch}，文案 key：

```ts
  tempoCancelLaunch: '取消启动',          // zh
  tempoCancelLaunch: 'Cancel launch',     // en
  tempoLaunchCancelled: '已取消启动，模组文件已恢复。',   // zh
  tempoLaunchCancelled: 'Launch cancelled. Mod files were restored.',  // en
```

`formatTempoLaunchError` 加 `tempo_launch_cancelled` → `t('tempoLaunchCancelled')`。

- [ ] **Step 7.4: 验证 + Commit**

```bash
npm run generate:bindings && npm run check && npm run test:unit && npm run test:rust
git add -A && git commit -m "Add cancellation to the Tempo capture flow"
```

---

### Task 8: 最终验证

- [ ] **Step 8.1: 自动化全量 + 强制重编译暴露 warning**

```bash
touch src-tauri/src/lib.rs                      # cargo 缓存会吞掉 warning，强制重编译
npm run test:rust 2>&1 | tee /tmp/tempo-rust.log
grep -i "warning" /tmp/tempo-rust.log           # 期望：无输出
npm run check
npm run test:unit
npm run format
```

- [ ] **Step 8.2: 手工验证矩阵**（适配包 README 六项 + Steam 回归）

| # | 场景 | 期望 |
|---|------|------|
| 1 | Windows，Tempo 原生安装（`%APPDATA%\Tempo Launcher - Beta\game\buildx64`），无 Steam | 自动检出目录；安装成功（无 Steam 报错）；启动走捕获流，全程无黑窗闪烁，进度文案中文 |
| 2 | Windows，Steam 安装 + Steam 客户端 | **回归项**：启动仍打开 `steam://rungameid/1617400`，行为与改动前完全一致 |
| 3 | macOS ≤26 prefix 模式 + Tempo Launcher | 捕获后经 `run_bepinex.sh` 带参启动 |
| 4 | macOS 27+ 蹦床模式 | 临时还原原版 .app → 校验 → 恢复 + 重装蹦床 → stub 带参启动 |
| 5 | 捕获中途失败（关掉 Tempo / 等到超时） | payload 恢复、蹦床重装、本地化错误展示 |
| 6 | 游戏已在运行时点启动 | 立即报"游戏已在运行"（本地化） |
| 7 | 等待期点"取消启动" | 流程中止、payload 恢复、提示已取消 |

---

## Self-Review 备忘

- 类型一致性已核对：`launch_game_via_tempo(app, Option<String>, Option<String>)`（vendor 版签名）与 Task 1 `launch_game_auto` 调用一致；`removal_items() -> Vec<String>` 与 Task 2 修改后的 `backup_and_remove(&[String])` 一致；`MessageKey` 来自 `messages.ts:193` 的真实导出。
- 唯一留给执行者的现场确认点：Task 6 `is_bepinex_installed` 的精确参数类型（`detect/game.rs`），以及 Task 5/7 className 与相邻样式对齐——均已在步骤里标注。
- 提交粒度 = 任务粒度，每个任务独立可编译、可回退。

## Suggested CLAUDE.md additions（供 PR 审阅者定夺，不直接改）

- Tauri 同步命令运行在主线程；任何可能阻塞超过毫秒级的命令必须 `#[tauri::command(async)]`（仓库先例：`get_install_state`）。
