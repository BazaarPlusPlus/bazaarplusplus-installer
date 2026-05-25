# 安装器基础重组

状态：已批准（共 3 个 Spec 中的第 1 个）
日期：2026-05-25
修订：2026-05-25 经 Codex 对抗性审阅后修正

## 背景

安装器正处于重设计阶段。Claude Design 中的新版界面将引入：

- 一个独立的 **战绩**（Chronicle）页面；
- 删除应用内 **Changelog** 与 **Settings** 路由；
- 把 FFmpeg 静默打包进主安装动作（不再作为单独步骤显示）；
- 新增持久化的左侧 NavRail 导航栏；
- 统一各页面的 header / footer / tag 视觉系统；
- 把 "重置战绩" 模态框从安装页移到战绩页。

整个重设计将拆成三个 Spec 依次落地：

- **Spec 1（本文）**：基础重组——纯代码结构调整，外加删除新版设计已经废弃的入口。
- **Spec 2**：新增 NavRail + 战绩页 + 隐藏 FFmpeg 步骤。
- **Spec 3**：header / footer 视觉统一 + About 页改版 + 顶部 UpdateBanner。

本 Spec 的目标是**为后续两个 Spec 铺好结构**：把每个功能的 UI、状态、类型、命令封装就近合并到该功能自身的文件夹下，使 Spec 2/3 的新增工作只需在已建立的模式里复刻即可。

结构上参考 [ansxuman/Clauge](https://github.com/ansxuman/Clauge)（同样基于 SvelteKit + Svelte 5 + Tauri v2）：每个 feature 自成 `src/lib/<feature>/` 文件夹，跨 feature 共用的 UI 留在 `src/lib/components/<area>/`；Rust 端按相同形状镜像。

## 目标

- **保持现有产品行为不变**：安装 / 修复 / 卸载流程、Stream 页、About 页的渲染与行为与今天完全一致。
- **唯一可见的变化**：移除已经被新设计废弃的 `/changelog` 与 `/settings` 入口（路由本身、导航条目、相关链接）。
- 把每个 feature 的 UI 组件、状态、类型、命令包装就近放进各自 feature 的文件夹。
- 删除新版设计已经废弃、且当前要么无引用、要么只被被删路由引用的源文件。
- 把 Rust 后端按相同的 feature 形状镜像重塑。
- 在一个 PR 内落地。

## 非目标

- 不引入 NavRail、不新增战绩页、不引入任何可见的 UI 变化（Spec 2）。
- 不删除 `InstallerFfmpegStep.svelte`——只随其他组件迁移到 `installer/components/`。Spec 2 在 FFmpeg 静默打包进主安装动作时再移除它。
- 不做 header / footer / tag 的视觉统一（Spec 3）。
- 不重做 About 页（Spec 3）。
- 不引入 Steam 自动启动的行为变更（独立的后续 Spec）。

## 需删除的文件

下表的文件在本 Spec 落地后**永久消失**。每一项的删除理由都已通过 grep 核实当前没有遗留引用，或唯一引用方就是同表被删除的另一项。

| 路径 | 删除理由 |
| --- | --- |
| `src/lib/whats-new.ts` 及 `.test.ts` | 唯一消费方是 `routes/changelog/`，本 Spec 同时删除该路由。 |
| `src/lib/whats-new-format.ts` 及 `.test.ts` | 同上。 |
| `src/lib/components/InstallerUpdateHighlights.svelte` | 同上。 |
| `src/lib/components/installer/whats-new-layout.test.ts` | 该测试通过字面量路径读源文件，用来防止 whats-new 相关 UI 被回归性地引入到 `InstallerHeader.svelte` / `Installer{Bpp,Bazaar}Step.svelte`。随着 whats-new 系列文件被永久删除，这条回归测试已无防护对象。 |
| `src/routes/changelog/` 整个文件夹 | 教程内容已迁移到 `https://bazaarplusplus.com/tutorial`，外链已经写在 `src/lib/config/endpoints.ts`。 |
| `src/routes/settings/` 整个文件夹 | 该页面只有 header 与返回按钮，无任何功能性 UI。 |

> **注意：`src/lib/updater.ts` 不在本表中。** 之前的草稿曾把它列为 "零引用" 而删除，是错误判断——它实际上被 `installer/updater-flow.ts`、`installer/page-model.ts`、`installer/controllers/updater-controller.ts`、`installer/selectors/updater-button.ts` 通过相对路径引用，不能删除。它会被**迁移**到 `src/lib/installer/updater.ts`（详见下一节）。

### 因路由删除而需要修剪的引用站点

仅以下三处包含指向 `/changelog` 或 `/settings` **Svelte 路由**的链接，需要随路由删除一并清理：

- `src/lib/components/navigation/EmbeddedNav.svelte`：删除 `/changelog` 与 `/settings` 两个导航条目。
- `src/lib/components/installer/InstallerHeader.svelte`：删除 `href="/settings"` 的入口（行 46）。

> **不要修改** `src/lib/components/stream/StreamModePanel.svelte` 第 73 行的 `${baseUrl}/settings`——这条 URL 是本机 Stream 服务的 OBS 标定页地址（`http://127.0.0.1:<port>/settings`），不是 SvelteKit 路由。改它会破坏 Stream 行为。

### 因路由删除而需要修剪的 i18n key

仅删除以下两个 key（en / zh 两张消息表都要删）：

- `navChangelog`
- `navSettings`

保留 `navHome` / `navStream` / `navAbout`：

- `navHome` 仍在使用（`/` 重定向到 `/install` 维持不变，导航中 "首页" 仍指向安装页）。
- `navStream` 仍在使用。
- `navAbout` 仍在使用。

其它 i18n key 一律不动。

## 前端文件迁移

```
src/lib/updater.ts                   → src/lib/installer/updater.ts
src/lib/components/installer/*       → src/lib/installer/components/*
src/lib/components/stream/*          → src/lib/stream/components/*
src/lib/components/supporters/*      → src/lib/about/components/*
src/lib/components/shell/HomeStatusCard.svelte
                                     → src/lib/installer/components/HomeStatusCard.svelte
src/lib/home/summary.ts              → src/lib/installer/home-summary.ts
src/lib/home/summary.test.ts         → src/lib/installer/home-summary.test.ts
src/lib/i18n.ts                      → src/lib/i18n/index.ts
src/lib/locale.ts                    → src/lib/i18n/locale.ts
src/lib/locale.test.ts               → src/lib/i18n/locale.test.ts
```

迁移落地后：

- `src/lib/home/` 文件夹被删除；
- `src/lib/components/shell/` 只剩下 `AppShell.svelte`。

### 与迁移配套的引用改写

执行迁移时必须扫描以下两类引用：

1. **TypeScript / Svelte 导入语句**——`npm run check` 会捕获遗漏，但仍需主动改写以下已知点：
   - `installer/updater-flow.ts`、`installer/page-model.ts` 中的 `'../updater.ts'`；
   - `installer/controllers/updater-controller.ts`、`installer/selectors/updater-button.ts` 中的 `'../../updater.ts'`；
   - 所有从 `$lib/components/installer/*`、`$lib/components/stream/*`、`$lib/components/supporters/*`、`$lib/components/shell/HomeStatusCard.svelte` 导入的站点；
   - 所有从 `$lib/i18n`、`$lib/locale`、`$lib/home/summary` 导入的站点。
2. **测试夹具中的字面量路径字符串**——以下测试通过 `readFileSync` 按相对路径读取源文件，不是 `import`，`npm run check` 不会发现它们：
   - `src/lib/components/installer/install-preview-modal.test.ts`（line 9）；
   - 其他可能存在的同类测试。

实现阶段必须 `grep -r "src/lib/(components|home|i18n|locale|whats-new|updater)" src` 进行一次完整字面量扫描，并把所有命中改写或删除。

## 迁移后的前端结构

```
src/lib/
  installer/                  # 安装 / 修复 / 卸载 + Tauri 自更新器
    components/                 (← components/installer/* + HomeStatusCard.svelte)
    controllers/                (现存)
    selectors/                  (现存)
    api.ts, state.ts, storage.ts, runtime.ts, page-model.ts,
    detect-flow.ts, install-guards.ts, repair-errors.ts,
    ffmpeg-errors.ts, ffmpeg-step-bundle.ts, updater-flow.ts
    updater.ts                  (← lib/updater.ts)
    home-summary.ts             (← home/summary.ts)
    *.test.ts
  stream/                     # OBS 覆盖层 + 录像
    components/                 (← components/stream/*)
    api.ts, state.ts            (现存)
  about/                      # 项目信息 + 支持者
    content.ts, page-model.ts   (现存)
    components/                 (← components/supporters/*)
  i18n/                       # 多语言基础设施
    index.ts                    (← i18n.ts)
    locale.ts, locale.test.ts   (← locale.ts, locale.test.ts)
  bridge/                     # 不动
  config/                     # 不动
  generated/                  # 不动（脚本重新生成）
  components/                 # 仅保留跨 feature 共用的 UI
    AppModal.svelte
    LocaleToggle.svelte
    shell/AppShell.svelte
    navigation/EmbeddedNav.svelte   (已删除 /changelog 与 /settings 条目)
  types.ts                    # 跨 feature 共享类型
```

落地后的路由集合：`/`（重定向到 `/install`，保持不变）、`/install`、`/stream`、`/about`。不再有 `/changelog`、`/settings`。

被删除的两个旧路由不做任何兜底重定向。它们在应用内已经没有任何剩余链接（见上节修剪清单），外部书签若访问会得到 SvelteKit 的标准 404，这是可接受的——这两条路由从未对外宣传过。

## 命名约定

本次重组确立的规则，后续工作（含 Spec 2/3）一律遵守：

- **某文件只被一个 feature 使用** → 放在该 feature 的文件夹内。
- **某文件被两个及以上 feature 使用** → 放在 `src/lib/components/<area>/`（UI）或 `src/lib/<infra>/`（状态 / 工具）。

该规则同时适用于 Svelte 组件与 TypeScript 模块。

## Rust 后端重塑

前端的 feature 形状在 Rust 端同步镜像，安装器作为独立的 feature 根模块出现在 `src-tauri/src/installer/`。

```
src-tauri/src/commands/bepinex/        → src-tauri/src/installer/bepinex/
src-tauri/src/commands/detect/         → src-tauri/src/installer/detect/
src-tauri/src/commands/ffmpeg/         → src-tauri/src/installer/ffmpeg/
src-tauri/src/commands/game_process.rs → src-tauri/src/installer/game_process.rs
src-tauri/src/commands/startup.rs      → src-tauri/src/installer/startup.rs
src-tauri/src/commands/steam.rs        → src-tauri/src/installer/steam.rs
src-tauri/src/commands/vdf.rs          → src-tauri/src/installer/vdf.rs
src-tauri/src/installer_db/            → src-tauri/src/installer/db/

src-tauri/src/commands/stream.rs       → src-tauri/src/stream/commands.rs
src-tauri/src/config.rs                → src-tauri/src/shared/config.rs
```

### `commands/mod.rs` 不能直接删除

旧 `src-tauri/src/commands/mod.rs` 不只是子模块列表，它还定义并 `pub(super) use` 了两个调试宏 `debug_log!` 与 `debug_error!`，被以下 7 个 Rust 源文件使用：

```
src-tauri/src/commands/startup.rs
src-tauri/src/commands/detect/mod.rs
src-tauri/src/commands/detect/steam.rs
src-tauri/src/commands/steam.rs
src-tauri/src/commands/vdf.rs
src-tauri/src/commands/bepinex/mod.rs
```

> 之前的草稿声称 `commands/mod.rs` 在迁移后为空、可直接删除——错误。

处理方式：把这两个宏迁出到 `src-tauri/src/shared/logging.rs`，导出方式由 `pub(super) use` 改为 `pub(crate) use`，所有使用方按新路径引用。

### `crate::config::*` 引用必须改写

`src-tauri/src/config.rs` 移到 `src-tauri/src/shared/config.rs` 后，以下 4 个文件中的 `crate::config::*` 必须改写为 `crate::shared::config::*`：

```
src-tauri/src/stream/path_resolution.rs
src-tauri/src/stream/records/locator.rs
src-tauri/src/commands/stream.rs              → 迁移后路径：src-tauri/src/stream/commands.rs
src-tauri/src/commands/detect/steam.rs        → 迁移后路径：src-tauri/src/installer/detect/steam.rs
```

### 必须新建的文件

- `src-tauri/src/installer/mod.rs`：声明 `pub mod bepinex; pub mod detect; pub mod ffmpeg; pub mod db; pub mod game_process; pub mod startup; pub mod steam; pub mod vdf;`。`installer/mod.rs` 不自动 re-export 子模块内容，调用方按 `crate::installer::<submodule>::<item>` 完整路径引用，避免命名冲突。
- `src-tauri/src/shared/mod.rs`：声明 `pub mod config; pub mod logging;`。
- `src-tauri/src/stream/commands.rs`：从原 `commands/stream.rs` 迁入；`src-tauri/src/stream/mod.rs` 增加 `pub mod commands;`。

### 必须更新的文件

- `src-tauri/src/lib.rs`：
  - 把 `mod commands;`、`mod config;`、`mod installer_db;` 改为 `mod installer;`、`mod shared;`、`mod stream;`（`stream;` 已存在则保留）；
  - 修改 `tauri::generate_handler!` 中所有 `commands::*` 与 `installer_db::*` 路径为新位置；
- 全部 7 个使用 `debug_log!` / `debug_error!` 的 Rust 文件：把 `use super::{debug_log, debug_error};`（或等价形式）改为 `use crate::shared::logging::{debug_log, debug_error};`；
- 全部 4 个使用 `crate::config::*` 的 Rust 文件：按 `crate::shared::config::*` 改写。

### 后端重塑后的结构

```
src-tauri/src/
  installer/        # 安装器 feature
    mod.rs            (新建)
    bepinex/, detect/, ffmpeg/, db/
    game_process.rs, startup.rs, steam.rs, vdf.rs
  stream/           # OBS 覆盖层 + 录像
    mod.rs, server.rs, http.rs, state.rs,
    overlay_settings.rs, path_resolution.rs, records/
    commands.rs       (← commands/stream.rs)
  shared/           # 跨 feature 工具
    mod.rs            (新建)
    config.rs         (← config.rs)
    logging.rs        (← commands/mod.rs 中的 debug 宏)
  lib.rs            # 模块声明与 generate_handler! 全部按新路径
  main.rs
```

后端迁移完成后，必须运行 `npm run generate:bindings`，把刷新后的 `src/lib/generated/bindings/` 一并提交。ts-rs 的输出文件名主要由类型名驱动，理论上模块迁移不会改变文件名，但移动可能影响导出宏的派生顺序，所以一律重新生成并按生成产物提交。

## 验证要求

PR 打开前必须通过：

1. `npm run check`——`svelte-check` + `svelte-kit sync` + 生成绑定，覆盖前端 TS/Svelte 导入完整性。
2. `npm run test`——Vitest + `cargo test --manifest-path src-tauri/Cargo.toml`，运行所有现存测试。
3. **跨平台 Rust 编译验证**——Rust 模块迁移可能在 Windows-only / macOS-only `cfg` 分支下断裂。本机如非目标主机，至少需要在 macOS 与 Windows 上各跑一次 `cargo check --manifest-path src-tauri/Cargo.toml`（远程 CI 触发或本地交叉 / VM 任选）。
4. `npm run prebuild-check`——校验版本对齐、BPP 数据策略、平台资源 ZIP 内容。请注意：该脚本**不**校验 Rust 模块布线或 ts-rs 绑定漂移；这部分的覆盖来自上面第 1 / 3 步以及生成绑定的产物 diff。
5. 字面量路径扫描——`grep -rn "src/lib/(components|home|i18n|locale|whats-new|updater)" src` 必须无非预期命中。
6. `./build.sh` 启动 dev app，依次点击 `/install`、`/stream`、`/about`，确认无 import 报错、无丢失路由、无 console error。

`./build.sh --prod` 不在本 Spec 的必跑列表内——打包与发行行为没有变化。

## 文档更新

本 Spec 落地的同一 PR 内更新以下文档：

- `docs/architecture.md`——完全重写。当前内容描述的是迁移前布局（`src/lib/installer/*` 与 `src/lib/components/*` 分离、`changelog/` 与 `settings/` 路由仍在），落地即过时。新内容描述新约定、列出每个 feature 文件夹及其内容，并把上文 "命名约定" 一节作为放置规则的权威来源。
- `docs/updater-release-plan.md` 与 `docs/combat-replay-ffmpeg-deployment.md`——只查证是否引用了被删路径并修补；不动其它内容。
- **`docs/superpowers/plans/2026-05-08-bazaardb-upload.md`**——该计划文档大量引用已被本 Spec 删除的 `/settings` 路由（共 16 处）。它本身是已落地工作的历史记录，**不重写内容**；本 Spec PR 在该文件开头加一段 "Superseded by 2026-05-25 installer foundation reorg" 的注记，指明：
  - 文档中提到的 `/settings` 路由已被移除；
  - BazaarDB 的连接 / 上传相关 UI 将在 Spec 2 / 3 的新设计内重新落位（具体路径届时确定）；
  - 历史命令、Rust 路径等如已被本 Spec 重塑，读者请以最新代码为准。

后续若再发现其他文档仍引用被删路径，按同样的注记策略处理，不做内容回写。

## 风险与回滚

| 风险 | 缓解 |
| --- | --- |
| 漏改 TypeScript / Svelte 导入 | `npm run check` 在 CI 与本地都会失败，阻塞 PR。 |
| 漏改 Rust 导入或 `tauri::generate_handler!` 引用 | `cargo build` / `cargo test` 失败，阻塞 PR。 |
| 漏改测试夹具中的字面量路径字符串 | 验证清单第 5 步的 grep 扫描兜底；Vitest 运行时也会因找不到文件失败。 |
| Rust 平台 `cfg` 分支断裂（仅 Windows / 仅 macOS） | 验证清单第 3 步要求两个目标都跑 `cargo check`。 |
| ts-rs 绑定漂移 | 后端动迁后强制 `npm run generate:bindings`，并把产物提交进同一 PR；`npm run check` 会检测 TS 端的不一致。 |
| 隐藏的 `lib/updater.ts` 类引用（相对路径） | 验证清单第 5 步的 grep 字面量扫描兜底；Spec 内已枚举已知 4 个引用站点。 |

回滚方式：直接 revert 本 PR。本 Spec 不涉及数据迁移、不改变持久化 schema、不改变任何运行时行为。

## 该 Spec 解锁的后续工作

- **Spec 2 — NavRail + 战绩页**：feature 文件夹模式已建立，新增 `src/lib/chronicle/` 与 `src/routes/chronicle/` 直接复刻同样形状即可。NavRail 作为新增的跨 feature 共用 chrome，位置在 `src/lib/components/shell/NavRail.svelte`，与 `AppShell.svelte` 并列。
- **Spec 3 — 视觉打磨**：header / footer / tag 统一只需修改 `src/lib/components/` 下的共用 chrome；About 改版只需在 `src/lib/about/` 内动手。
