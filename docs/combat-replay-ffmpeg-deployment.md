# Combat Replay FFmpeg Deployment

## Scope

为 mod 端的 Combat Replay 视频录制功能（见 mod 仓库的 `docs/combat-replay-video-recording.md` 与
`docs/reference/combat-replay-recording.md`）提供**可选的 FFmpeg 二进制部署能力**：
让 installer 在 install / repair 流程里多一个可勾选步骤，把平台对应的 LGPL minimal FFmpeg
下载到 `<GameRoot>/BazaarPlusPlus/tools/ffmpeg/`，并在卸载时清理。

本文档描述目标、关键设计决策、实施阶段和验证逻辑。代码尚未落地。

## 背景

### Mod 端已就绪的契约

Mod 已经实现 `CombatReplayVideoRecorder` + `FfmpegLocator`，行为如下：

- 总开关 `CombatReplayVideo / Enabled` 默认 `false`
- FFmpeg 解析顺序：`<GameRoot>/BazaarPlusPlus/tools/ffmpeg/ffmpeg(.exe)` → 系统 `PATH`
- 任何一个能在 2 秒内通过 `ffmpeg -version` 的就算可用；都失败就静默禁用，单行 Info log
- Mod release artifact 不会打包 FFmpeg；目录不存在不报错、不崩溃

**也就是说：installer 唯一要做的事，是把"标准位置那个 binary"准备好**。Mod 本身不下载，也不知道 binary
是谁放的。

### 当前 Installer 的相关能力

| 已就绪 | 用途 |
|---|---|
| `reqwest` (rustls-tls) | HTTPS 下载 |
| `zip 6.0.0` | 解压 |
| `tokio` | 异步任务 |
| Cloudflare R2 `bppinstaller.bazaarplusplus.com` + 已部署 `wrangler` 工具链 | 资源托管 |
| `src-tauri/src/commands/bepinex/` 模块结构 | 安装 / 修复 / 卸载的现成参考 |
| `src/lib/installer/` 前端 controller + selector 分层 | UI 状态编排参考 |

缺的只有：SHA256 校验（加 `sha2` crate）、新的命令模块、对应的 svelte UI 节点。

## 目标

### 功能目标

- Install 流程里多一步可选的 **Install FFmpeg**
- Repair 流程里多一项检查：tools/ffmpeg 损坏或丢失时可重装
- 卸载 BPP 时同时清理 `<GameRoot>/BazaarPlusPlus/tools/`
- 用户已在系统 `PATH` 上装了 FFmpeg 时，UI 明确告知"无需再装"，但仍允许覆盖安装

### 非功能目标

| 维度 | 目标 |
|---|---|
| Installer 包体积 | 不变（FFmpeg 不打进安装包，只下载） |
| 许可证 | 零分发风险：Installer artifact 不含 FFmpeg；R2 上的二进制使用 LGPL minimal + OpenH264 构建 |
| 网络 | 首次下载需要网，下载完成后离线可用 |
| 失败域 | FFmpeg 步骤失败不阻断 BPP 主安装流程；用户可在主流程结束后单独重试 |
| 跨平台 | Windows x86_64 必做；macOS（arm64 / x86_64）作为 Stretch |
| 可观测 | 失败必须给出明确分类错误码：网络 / 校验 / 文件系统 / 探测失败 |

### 明确不做

- **不打包 FFmpeg 到 installer artifact**：installer 体积是用户痛点，必须保留"下载式"分发
- **不在 mod runtime 里下载 FFmpeg**：跨进程下载与许可证审计太麻烦，权责清晰留给 installer
- **不做 FFmpeg 自动更新**：装一次就用，过期了由 repair / 重装走
- **不支持自定义 FFmpeg 参数 / 编解码器选择**：Mod 端固定 `libx264 + yuv420p`
- **不绕开 Tauri 沙盒下载到任意路径**：固定写到 `<GameRoot>/BazaarPlusPlus/tools/ffmpeg/`

## 关键设计决策

### R2 资源布局

复用已有 `bppinstaller` bucket，新增独立前缀，与 installer 版本号解耦——FFmpeg 的版本节奏跟
installer 不一致，强行绑定会导致每次 installer 升级都要重传 FFmpeg。

```text
bppinstaller/
└── ffmpeg/
    ├── manifest.json
    └── <ffmpeg-version>/
        ├── windows-x86_64/
        │   ├── ffmpeg.zip
        │   └── LICENSE.txt
        ├── darwin-aarch64/
        │   ├── ffmpeg.zip
        │   └── LICENSE.txt
        └── darwin-x86_64/
            ├── ffmpeg.zip
            └── LICENSE.txt
```

`ffmpeg/manifest.json` 形如：

```json
{
  "current_version": "7.1",
  "versions": {
    "7.1": {
      "platforms": {
        "windows-x86_64": {
          "asset_url": "https://bppinstaller.bazaarplusplus.com/ffmpeg/7.1/windows-x86_64/ffmpeg.zip",
          "license_url": "https://bppinstaller.bazaarplusplus.com/ffmpeg/7.1/windows-x86_64/LICENSE.txt",
          "sha256": "...",
          "size_bytes": 28000000,
          "entry_in_archive": "ffmpeg.exe"
        },
        "darwin-aarch64": { "...": "..." }
      }
    }
  }
}
```

Installer **只读取 `current_version` 那一档**——后续若要 pin 旧版可以扩展 UI，但 v1 不上多版本。

### 二进制构建来源

- **Windows x86_64**：选择 [BtbN/FFmpeg-Builds](https://github.com/BtbN/FFmpeg-Builds) 的
  `ffmpeg-master-latest-win64-lgpl-shared` 流派，去掉非必需 codec/filter，目标 `<35MB`
- **macOS arm64 / x86_64**：自建（参考 [osxexperts](https://www.osxexperts.net/) 或自己跑
  `ffmpeg`+`x264`+`openh264` 静态链接），同样剥掉非必需组件
- LICENSE.txt 必须随包附带，写明上游许可证与第三方组件清单（`x264 GPL` 的部分**不能**进 minimal
  build；`openh264 BSD` + `libx264 LGPL build` 或 `OpenH264 only` 都可以接受）

发版前需人工 audit 一次 binary 的 codec 清单（`ffmpeg -codecs` 输出）确认没有 GPL-only 组件。

### 文件落地路径

```text
<GameRoot>/BazaarPlusPlus/tools/ffmpeg/
├── ffmpeg(.exe)        # 主二进制，chmod +x（POSIX）
├── LICENSE.txt         # 必带，便于事后审计
└── version.json        # 标记当前装的版本，加速增量检查
```

`version.json` 形如：

```json
{
  "version": "7.1",
  "platform": "windows-x86_64",
  "sha256": "...",
  "installed_at_utc": "2026-05-22T03:14:15Z"
}
```

下次 detect 时优先读 `version.json`，校验匹配再决定要不要重下；version.json 不存在或 sha 对不上就视为
"需要重装"。

### 检测策略（detect_ffmpeg）

返回一个枚举状态，由前端做对应文案：

| 状态 | 含义 | UI 文案 |
|---|---|---|
| `Bundled { version }` | tools/ffmpeg 存在 + 二进制可执行 + `-version` 退出 0 | "FFmpeg 已就绪（vX.Y）" |
| `BundledCorrupted { reason }` | 文件存在但 probe 失败 | "FFmpeg 损坏，建议重装" |
| `SystemAvailable` | tools/ffmpeg 不存在，但 `which ffmpeg` 能跑通 | "已检测到系统 FFmpeg，可直接使用" |
| `NotInstalled` | 两处都没 | "未安装" |

**禁止只检测 `File::exists`** —— 必须实际起子进程跑 `ffmpeg -version`，2 秒超时，看退出码。这一条
对齐 mod 端 `FfmpegLocator.TryProbe`。

### Install 流程（install_ffmpeg）

```text
1. 校验 game_path 是合法 BPP 目录（复用 payload::ensure_valid_game_path）
2. fetch https://.../ffmpeg/manifest.json
3. 选当前平台条目，得到 asset_url + sha256 + size_bytes
4. tempfile 下载 ffmpeg.zip，边下载边 emit 进度事件
5. 算 SHA256，不匹配 → 删 temp、报错 InvalidChecksum
6. 解压到 <GameRoot>/BazaarPlusPlus/tools/ffmpeg/ 临时子目录
7. 取出 entry_in_archive 指向的 binary，chmod +x（POSIX）
8. 起子进程跑 ffmpeg -version，退出码 ≠ 0 → 报错 ProbeFailed
9. 同步落地 LICENSE.txt + version.json
10. 原子重命名临时目录到 tools/ffmpeg/
```

中间任何一步失败：清理 temp、保留旧的 `tools/ffmpeg/` 不动。**不允许下载到一半留下半残 binary 让 mod
检测到。**

### Uninstall 与 Repair 联动

- `uninstall_bpp` 在已有 `payload::uninstall_payload` 之后增加一行 `tools/ffmpeg/` 清理（注意只清这个
  子目录，不要直接清空 `tools/`，给未来其他工具留位置）
- `repair_bpp` 当前的 `cleanup_legacy_record_directory` 不动；新增一个独立的 `repair_ffmpeg` 命令，
  仅在用户从 UI 点了 "Repair FFmpeg" 时调用，避免把"清空玩家本地数据"和"重置 FFmpeg"绑死

### UI 入口

复用 `InstallerStatusSteps.svelte` 的步骤列表模式，**不**新开页面：

- 新增一个 step：`InstallerFfmpegStep.svelte`（与 `InstallerBppStep.svelte` 并列）
- 仅当 BPP 已安装且 `Settings -> CombatReplayVideo` 启用意图被点亮时显示「Install FFmpeg」按钮；其余
  情况收成一行折叠状态
- 前端 storage 持久化 "用户已主动跳过 FFmpeg" 的偏好，避免每次开 installer 都纠缠用户

控制器层：

- `src/lib/installer/api.ts` 新增 `detectFfmpeg / installFfmpeg / uninstallFfmpeg / repairFfmpeg`
- `src/lib/installer/controllers/ffmpeg-controller.ts` 编排 install 流程（含进度条 + 错误分类）
- `src/lib/installer/selectors/ffmpeg.ts` 派生显示状态

### 错误码契约

参考现有 `REPAIR_ERR_*` 的字符串前缀模式，给前端做模式匹配：

```rust
pub(crate) const FFMPEG_ERR_NETWORK: &str = "bpp_ffmpeg_network_failure";
pub(crate) const FFMPEG_ERR_INVALID_CHECKSUM: &str = "bpp_ffmpeg_invalid_checksum";
pub(crate) const FFMPEG_ERR_EXTRACT_FAILED: &str = "bpp_ffmpeg_extract_failed";
pub(crate) const FFMPEG_ERR_PROBE_FAILED: &str = "bpp_ffmpeg_probe_failed";
pub(crate) const FFMPEG_ERR_GAME_RUNNING: &str = "bpp_ffmpeg_install_blocked_by_game";
pub(crate) const FFMPEG_ERR_PLATFORM_UNSUPPORTED: &str = "bpp_ffmpeg_platform_unsupported";
```

加错误码时同步在 `formatRepairError` 或新建的 `formatFfmpegError` 里加分支，否则前端默认走通用兜底
文案。

## 实施阶段

### Phase 0：资源准备（与代码并行）

1. 准备 Windows / macOS x86_64 / macOS arm64 三个 minimal LGPL build，跑 `ffmpeg -codecs` 截图归档
2. SHA256 计算 + 写 LICENSE.txt
3. `wrangler r2 object put` 上传到 `ffmpeg/<version>/<platform>/`
4. 手写第一版 `ffmpeg/manifest.json`（v1 一个版本三个平台条目即可），上传

完成后 manifest URL 直接 curl 可拿到——这是 Phase 1 解码的前置。

### Phase 1：Rust 后端 + 单平台跑通

| 步骤 | 内容 |
|---|---|
| 1 | `Cargo.toml` 加 `sha2`；新建 `src-tauri/src/commands/ffmpeg/`（mod + manifest + install + probe + uninstall） |
| 2 | 实现 `detect_ffmpeg / install_ffmpeg / uninstall_ffmpeg / repair_ffmpeg` 四个 tauri command |
| 3 | 在 `src-tauri/src/lib.rs` 注册命令；同步 `src/lib/bridge/commands.ts` 的 `TauriCommandMap` |
| 4 | 跑 `npm run generate:bindings` 生成 TS 类型 |
| 5 | 加一个临时 dev-only 按钮，**仅在 Windows** 真跑一次 install → probe → uninstall 闭环 |

**成功标准**：Windows 上 install_ffmpeg 跑完后，mod 端 `FfmpegLocator.Resolve` 在游戏内能识别到 binary
并在 Info log 里报路径。

### Phase 2：UI + Storage + 错误分类

- `InstallerFfmpegStep.svelte` 组件 + selector + controller
- 错误码 -> 文案的分支（中文 + 英文）
- "用户跳过 FFmpeg" 偏好写到现有 `storage.ts`
- 进度事件接入；下载阶段显示进度条，extract / probe 阶段显示 spinner

### Phase 3：macOS 平台 + Repair 流程

- macOS arm64 / x86_64 binary 上线后，去掉 Phase 1 的 `cfg!(target_os = "windows")` 短路
- 解决 macOS quarantine attribute（`xattr -d com.apple.quarantine`）——否则 mod 进程拉起 ffmpeg 会被
  Gatekeeper 拦
- 把 `repair_ffmpeg` 接到 Repair 面板的「Advanced」分组下
- 把 `uninstall_bpp` 顺带清 `tools/ffmpeg/`

> 当前 installer README 已经标注 "macOS 上 BepInEx 还无法正确加载"——FFmpeg 在 macOS 的部署逻辑可以先
> 写好，但端到端验证要等 BepInEx 阻塞解除。

### Phase 4（可选）：版本管理

- manifest 引入多版本 + UI 让用户选择
- 后台轮询 manifest，FFmpeg 有新版本时提示

仅在前三阶段稳定后评估。

## 文件结构

预计新增和修改：

| 文件 | 责任 | 状态 |
|---|---|---|
| `src-tauri/Cargo.toml` | 加 `sha2` 依赖 | 修改 |
| `src-tauri/src/commands/ffmpeg/mod.rs` | 命令导出 + 错误码常量 | 新增 |
| `src-tauri/src/commands/ffmpeg/manifest.rs` | 拉取 + 解析 R2 manifest | 新增 |
| `src-tauri/src/commands/ffmpeg/install.rs` | 下载 + 校验 + 解压 + probe + 原子落地 | 新增 |
| `src-tauri/src/commands/ffmpeg/probe.rs` | `ffmpeg -version` 子进程封装（2s 超时） | 新增 |
| `src-tauri/src/commands/ffmpeg/state.rs` | `detect_ffmpeg` 状态枚举 + `version.json` 读写 | 新增 |
| `src-tauri/src/commands/ffmpeg/uninstall.rs` | 删除 `tools/ffmpeg/` 子目录 | 新增 |
| `src-tauri/src/lib.rs` | 注册新命令；事件 channel | 修改 |
| `src-tauri/src/commands/bepinex/mod.rs` | `uninstall_bpp` 末尾调用 `tools/ffmpeg/` 清理 | 修改 |
| `src/lib/bridge/commands.ts` | 加 `TauriCommandMap` 条目 | 修改 |
| `src/lib/installer/api.ts` | `detectFfmpeg / installFfmpeg / ...` 前端入口 | 修改 |
| `src/lib/installer/controllers/ffmpeg-controller.ts` | 编排 + 错误分类 | 新增 |
| `src/lib/installer/selectors/ffmpeg.ts` | 状态派生 | 新增 |
| `src/lib/components/installer/InstallerFfmpegStep.svelte` | UI step | 新增 |
| `src/lib/installer/storage.ts` | "跳过 FFmpeg 偏好" 字段 | 修改 |
| `src/lib/installer/repair-errors.ts` | `formatFfmpegError` 分支 | 修改 |
| `docs/combat-replay-ffmpeg-deployment.md` | 本文档 | 新增 |
| 上游 `bppinstaller` R2 bucket | `ffmpeg/manifest.json` + 三平台 binary | 新增（运维） |

## 验证逻辑

### Phase 1 验证（后端核心）

| 检查项 | 方法 | 通过条件 |
|---|---|---|
| 网络失败分类 | 把 manifest URL 改成 404 | 报 `FFMPEG_ERR_NETWORK`，无 panic |
| Checksum 失败分类 | 改 manifest 里的 sha256 | 报 `FFMPEG_ERR_INVALID_CHECKSUM`，tools/ 不留半残 |
| Probe 失败分类 | 上传一个 corrupted zip | 报 `FFMPEG_ERR_PROBE_FAILED`，tools/ 不留半残 |
| 原子写入 | 安装过程中 kill 进程 | 重启 installer 后 detect 返回 `NotInstalled`，没有残留半装目录 |
| Mod 端可见 | 安装成功后启动游戏 | mod log 报 `FFmpeg detected: <GameRoot>/BazaarPlusPlus/tools/ffmpeg/ffmpeg(.exe)` |
| 系统 FFmpeg 不被误删 | 用户装系统 ffmpeg，再运行 uninstall_bpp | `which ffmpeg` 仍然可解析 |

### Phase 2 验证（UI）

| 检查项 | 方法 | 通过条件 |
|---|---|---|
| 进度可见 | 限速 1MB/s 跑 install | UI 进度条平滑，文案分阶段切换 |
| 错误文案 | 模拟四种错误码 | 文案与错误码对得上，无 fallback 兜底 |
| 跳过偏好 | 点 "稍后" 关闭 installer 后重开 | 不再主动弹 FFmpeg 安装提示 |
| 系统 FFmpeg 显示 | 临时把系统 ffmpeg 加进 PATH | UI 显示 `SystemAvailable` 文案，按钮变 "Override install" |

### Phase 3 验证（macOS + 卸载）

| 检查项 | 方法 | 通过条件 |
|---|---|---|
| macOS quarantine | 下载后 mod 端直接拉起 | 不弹 Gatekeeper 警告，能跑 `-version` |
| uninstall_bpp | 装好 FFmpeg 后跑 uninstall | `tools/ffmpeg/` 被删除，`tools/` 父目录如果只剩这一个子目录也一起清掉 |
| repair_ffmpeg | 手动篡改 ffmpeg.exe | 触发 repair 后状态恢复正常 |

### 跨 Phase 兜底

每次合并前必跑：

1. 按 installer 仓库 `.rules`：UI/TS 改动跑 `npm run check`；脚本改动跑对应 node test
2. 关闭 mod 端 `CombatReplayVideoEnabled` 后 installer 流程不应有任何回归
3. `wrangler r2 object delete` 删掉 manifest.json 后 installer 不崩，detect 状态返回 `NotInstalled`
   + 一条 warn

## 风险与回滚

| 风险 | 缓解 |
|---|---|
| FFmpeg 上游 binary 含意外 GPL 组件 | 发版前手动 audit `ffmpeg -codecs`，归档截图；只用 LGPL minimal 源 |
| 用户网络环境拉不下 R2 | UI 给"我已自行下载 ffmpeg 到 tools/ffmpeg/"的旁路说明，绕过 installer |
| macOS notarization 不让 ffmpeg 跑 | 接 quarantine 处理；最坏情况先在 macOS 上 fallback 到「系统 PATH」 |
| 不同 manifest 版本与现有 installer 不兼容 | manifest 加 `schema_version` 字段，installer 拒绝未来更高版本 |
| 半残 binary 让 mod 误以为 FFmpeg 可用 | 严格走"临时目录 → probe 成功 → 原子重命名"，禁止中途暴露 |

**回滚**：

- 全功能由 R2 manifest 控制：把 `current_version` 改成历史版本就能 roll back 二进制版本；
- 真要彻底关闭这个能力，把 manifest 设为 404 即可——installer detect 会落到 `NotInstalled`、不影响主
  装机流程
- Installer 端本身的回滚：feature flag（`src/lib/installer/storage.ts` 加一个 `enableFfmpegStep`
  字段）默认关，灰度时单独打开

## 相关文档

- mod 仓库：`docs/combat-replay-video-recording.md`（功能整体设计）
- mod 仓库：`docs/reference/combat-replay-recording.md`（运行时事件 + 文件契约）
- 本仓库：`docs/architecture.md`（命令分层、UI 边界、构建入口）
- 本仓库：`docs/updater-release-plan.md`（R2 上传与 manifest 生成的现有模式参考）
