import { describe, expect, it } from 'vitest';
import { createAsyncActionGate, runSingleFlightAction } from './useAsyncAction';

describe('runSingleFlightAction', () => {
  it('rejects a second action while the first action is still running', async () => {
    const gate = createAsyncActionGate<'load' | 'install'>();
    const started: string[] = [];
    const ended: string[] = [];
    let finishFirst: (() => void) | undefined;

    const first = runSingleFlightAction(
      gate,
      'load',
      async () => {
        await new Promise<void>((resolve) => {
          finishFirst = resolve;
        });
      },
      {
        onActionStart: (name) => started.push(name),
        onError: () => undefined,
        onActionEnd: () => ended.push('end')
      }
    );

    const secondTask = { ran: false };
    const second = await runSingleFlightAction(
      gate,
      'install',
      async () => {
        secondTask.ran = true;
      },
      {
        onActionStart: (name) => started.push(name),
        onError: () => undefined,
        onActionEnd: () => ended.push('end')
      }
    );

    expect(second).toBe(false);
    expect(secondTask.ran).toBe(false);
    expect(started).toEqual(['load']);

    finishFirst?.();
    await expect(first).resolves.toBe(true);
    expect(gate.current).toBeNull();
    expect(ended).toEqual(['end']);
  });

  it('returns false and reports a mapped message when the task fails', async () => {
    const gate = createAsyncActionGate<'resetData'>();
    const errors: string[] = [];

    const result = await runSingleFlightAction(
      gate,
      'resetData',
      async () => {
        throw new Error('raw backend code');
      },
      {
        onActionStart: () => undefined,
        onError: (message) => errors.push(message),
        onActionEnd: () => undefined
      },
      { errorMessage: () => 'localized reset error' }
    );

    expect(result).toBe(false);
    expect(errors).toEqual(['localized reset error']);
    expect(gate.current).toBeNull();
  });
});
