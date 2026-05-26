# Combat Replay FFmpeg Deployment

## Scope

为 mod 端 Combat Replay 视频录制功能提供可选的 FFmpeg 二进制部署能力。Installer 在 install / repair
流程里把平台对应的本地 Source 解压到：

```text
<GameRoot>/BazaarPlusPlusV4/tools/ffmpeg/
```

Mod 端仍只按原契约查找：

```text
<GameRoot>/BazaarPlusPlusV4/tools/ffmpeg/ffmpeg(.exe)
```

找不到本地 binary 时再 fallback 到系统 `PATH`。

## Bundled Source

FFmpeg 不再从远端下载，随 installer 作为 Tauri resource 分发：

```text
src-tauri/resources/FfmpegSource/
├── macos/
│   ├── ffmpeg.zip
│   └── LICENSE.txt
└── windows/
    ├── ffmpeg.zip
    └── LICENSE.txt
```

平台配置把各自 source 映射到相同运行时路径：

```text
FfmpegSource/ffmpeg.zip
FfmpegSource/LICENSE.txt
```

当前只支持两个平台：

| Platform key | Source directory | Required zip root entry |
|---|---|---|
| `windows-x86_64` | `FfmpegSource/windows/` | `ffmpeg.exe` |
| `darwin-aarch64` | `FfmpegSource/macos/` | `ffmpeg` |

macOS x86_64 不再支持；运行到该平台时返回 `bpp_ffmpeg_platform_unsupported`。

## Install Flow

```text
1. 校验 game_path 是合法 BPP 目录
2. 根据当前 OS/arch 选择 platform key
3. 从 Tauri resource 读取 FfmpegSource/ffmpeg.zip 和 LICENSE.txt
4. 解压到 tools/ffmpeg 的相邻临时目录
5. 取出平台要求的 root entry，chmod +x（POSIX）
6. 运行 ffmpeg -version 做 probe
7. 写入 LICENSE.txt 和 version.json
8. 原子替换到 <GameRoot>/BazaarPlusPlusV4/tools/ffmpeg/
```

中间任何一步失败都保留旧的 `tools/ffmpeg/` 不动，避免 mod 端检测到半安装 binary。

`version.json` 记录当前安装信息：

```json
{
  "version": "7.1",
  "platform": "windows-x86_64",
  "sha256": "...",
  "installed_at_utc": "2026-05-22T03:14:15Z"
}
```

其中 `sha256` 是随 installer 打包的 `ffmpeg.zip` 内容 hash，用于审计当前落地来源。

## Detect / Repair / Uninstall

`detect_ffmpeg` 返回以下状态：

| 状态 | 含义 |
|---|---|
| `Bundled { version }` | `tools/ffmpeg` 中的 binary 可执行，且 `ffmpeg -version` 成功 |
| `BundledCorrupted { reason }` | 文件存在但 probe 失败 |
| `SystemAvailable` | 本地未安装，但系统 `PATH` 里有可用 FFmpeg |
| `NotInstalled` | 本地和系统都没有可用 FFmpeg |

`repair_ffmpeg` 复用 install flow 覆盖本地 FFmpeg。`uninstall_bpp` 清理 `tools/ffmpeg/` 子目录，但不删除系统
`PATH` 中的 FFmpeg。

## Error Codes

前端按 Rust 侧错误码前缀做文案分类：

```rust
pub(crate) const FFMPEG_ERR_EXTRACT_FAILED: &str = "bpp_ffmpeg_extract_failed";
pub(crate) const FFMPEG_ERR_PROBE_FAILED: &str = "bpp_ffmpeg_probe_failed";
pub(crate) const FFMPEG_ERR_PLATFORM_UNSUPPORTED: &str = "bpp_ffmpeg_platform_unsupported";
```

由于不再下载远端资源，FFmpeg install flow 不再暴露网络失败或 checksum mismatch 错误。

## Verification

相关改动至少跑：

```text
npm run prebuild-check
npx vitest run scripts/prebuild-check.test.mjs src/lib/installer/ffmpeg-errors.test.ts
cargo test --manifest-path src-tauri/Cargo.toml commands::ffmpeg --lib
npm run check
```

涉及正式发包时再跑完整 release packaging 验证。
