// Maps the Rust-side `FFMPEG_ERR_*` prefixes to a typed UI error.
// Keep in lockstep with `src-tauri/src/commands/ffmpeg/mod.rs`.
const ERR_NETWORK = 'bpp_ffmpeg_network_failure';
const ERR_INVALID_CHECKSUM = 'bpp_ffmpeg_invalid_checksum';
const ERR_EXTRACT_FAILED = 'bpp_ffmpeg_extract_failed';
const ERR_PROBE_FAILED = 'bpp_ffmpeg_probe_failed';
const ERR_PLATFORM_UNSUPPORTED = 'bpp_ffmpeg_platform_unsupported';

export type FfmpegError =
  | { kind: 'network'; detail?: string }
  | { kind: 'checksum' }
  | { kind: 'extract'; detail?: string }
  | { kind: 'probe'; detail?: string }
  | { kind: 'platform_unsupported' }
  | { kind: 'unknown'; message: string };

export function parseFfmpegError(error: unknown): FfmpegError {
  const raw = error instanceof Error ? error.message : String(error ?? '');
  const detail = (prefix: string) =>
    raw.length > prefix.length + 1 ? raw.slice(prefix.length + 1) : undefined;

  if (raw === ERR_NETWORK || raw.startsWith(`${ERR_NETWORK}:`)) {
    return { kind: 'network', detail: detail(ERR_NETWORK) };
  }
  if (raw === ERR_INVALID_CHECKSUM || raw.startsWith(`${ERR_INVALID_CHECKSUM}:`)) {
    return { kind: 'checksum' };
  }
  if (raw === ERR_EXTRACT_FAILED || raw.startsWith(`${ERR_EXTRACT_FAILED}:`)) {
    return { kind: 'extract', detail: detail(ERR_EXTRACT_FAILED) };
  }
  if (raw === ERR_PROBE_FAILED || raw.startsWith(`${ERR_PROBE_FAILED}:`)) {
    return { kind: 'probe', detail: detail(ERR_PROBE_FAILED) };
  }
  if (raw === ERR_PLATFORM_UNSUPPORTED) {
    return { kind: 'platform_unsupported' };
  }
  return { kind: 'unknown', message: raw };
}

export interface FfmpegErrorCopy {
  title: string;
  body: string;
  retryLabel: string;
}

export function describeFfmpegError(
  error: FfmpegError,
  localized: (zh: string, en: string) => string
): FfmpegErrorCopy {
  switch (error.kind) {
    case 'network':
      return {
        title: localized('下载失败', 'Download failed'),
        body: localized(
          '无法连接到 FFmpeg 下载源。请检查网络后重试，或自行下载 ffmpeg 后放入 BazaarPlusPlus/tools/ffmpeg/ 目录。',
          'Could not reach the FFmpeg download source. Check your network and retry, or place a downloaded ffmpeg into BazaarPlusPlus/tools/ffmpeg/ yourself.'
        ),
        retryLabel: localized('重试', 'Retry')
      };
    case 'checksum':
      return {
        title: localized('校验失败', 'Checksum mismatch'),
        body: localized(
          '下载的文件校验值与发布清单不匹配，已自动丢弃。请稍后再试，问题持续请反馈。',
          'Downloaded file did not match the published checksum and was discarded. Try again later; report it if the failure persists.'
        ),
        retryLabel: localized('重试', 'Retry')
      };
    case 'extract':
      return {
        title: localized('解压失败', 'Extraction failed'),
        body: localized(
          '下载的压缩包无法解压。请重试，或检查磁盘剩余空间和权限。',
          'The downloaded archive could not be extracted. Try again, or check disk space and permissions.'
        ),
        retryLabel: localized('重试', 'Retry')
      };
    case 'probe':
      return {
        title: localized('FFmpeg 无法运行', 'FFmpeg failed to launch'),
        body: localized(
          '安装包解压后，FFmpeg 启动测试失败。可能是杀毒软件拦截或权限不足。请检查后重试。',
          'After extraction, the FFmpeg launch test failed. Antivirus or permission issues are the usual culprits. Check and retry.'
        ),
        retryLabel: localized('重试', 'Retry')
      };
    case 'platform_unsupported':
      return {
        title: localized('当前平台暂不支持', 'Platform not supported yet'),
        body: localized(
          '目前安装器仅支持 Windows 与 macOS。如果你确认平台已就绪，请把 ffmpeg 二进制手动放入 BazaarPlusPlus/tools/ffmpeg/ 即可。',
          'The installer currently only deploys binaries for Windows and macOS. You can drop ffmpeg into BazaarPlusPlus/tools/ffmpeg/ manually if your platform is otherwise ready.'
        ),
        retryLabel: localized('我知道了', 'Got it')
      };
    case 'unknown':
      return {
        title: localized('FFmpeg 安装失败', 'FFmpeg install failed'),
        body: error.message
          ? localized(
              `出现未识别错误：${error.message}`,
              `Unrecognized error: ${error.message}`
            )
          : localized(
              '出现未知错误，请重试。',
              'An unknown error occurred. Please retry.'
            ),
        retryLabel: localized('重试', 'Retry')
      };
  }
}
