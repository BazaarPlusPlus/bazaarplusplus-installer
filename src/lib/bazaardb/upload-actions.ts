import { call } from '$lib/bridge/commands';

export type UploadStatus =
  | { kind: 'idle' }
  | { kind: 'pending' }
  | { kind: 'uploaded'; remoteId: string }
  | { kind: 'queued'; reason: string }
  | { kind: 'error'; message: string };

export async function uploadScreenshot(screenshotId: string): Promise<UploadStatus> {
  try {
    const result = await call('upload_screenshot_to_bazaardb', {
      request: { screenshot_id: screenshotId },
    });
    if ('Uploaded' in result) {
      return { kind: 'uploaded', remoteId: result.Uploaded.remote_id };
    }
    return { kind: 'queued', reason: result.Queued.reason };
  } catch (err) {
    return { kind: 'error', message: String(err) };
  }
}
