import { describe, expect, it } from 'vitest';
import { createStreamViewModel } from './streamViewModel';
import { idleStreamStatus } from '../../api/previewDefaults';

describe('createStreamViewModel', () => {
  it('reports a starting state while route-enter ensure is loading', () => {
    const model = createStreamViewModel({
      status: idleStreamStatus,
      loading: true,
      action: null,
      error: null
    });

    expect(model.state).toBe('starting');
    expect(model.message).toBeNull();
    expect(model.canOpenOverlay).toBe(false);
  });

  it('exposes overlay and settings actions for a healthy session', () => {
    const model = createStreamViewModel({
      status: {
        ...idleStreamStatus,
        running: true,
        port: 17654,
        base_url: 'http://127.0.0.1:17654',
        overlay_url: 'http://127.0.0.1:17654/overlay',
        settings_url: 'http://127.0.0.1:17654/settings'
      },
      loading: false,
      action: null,
      error: null
    });

    expect(model.state).toBe('running');
    expect(model.obsUrl).toBe('http://127.0.0.1:17654/overlay');
    expect(model.canOpenOverlay).toBe(true);
    expect(model.canOpenSettings).toBe(true);
  });

  it('surfaces backend errors above stale status details', () => {
    const model = createStreamViewModel({
      status: { ...idleStreamStatus, last_error: 'Port is occupied' },
      loading: false,
      action: null,
      error: 'Port is occupied'
    });

    expect(model.state).toBe('error');
    expect(model.message).toBe('Port is occupied');
    expect(model.canOpenOverlay).toBe(false);
  });
});
