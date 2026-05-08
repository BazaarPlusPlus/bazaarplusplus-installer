import { call } from '$lib/bridge/commands';

export type UploadStatus =
  | { kind: 'idle' }
  | { kind: 'pending' }
  | { kind: 'success'; remoteId: string }
  | { kind: 'error'; message: string };

export async function uploadScreenshot(screenshotId: string): Promise<UploadStatus> {
  try {
    const result = await call('upload_screenshot_to_bazaardb', {
      request: { screenshot_id: screenshotId },
    });
    return { kind: 'success', remoteId: result.remote_id };
  } catch (err) {
    return { kind: 'error', message: String(err) };
  }
}
