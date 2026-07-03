export function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const RESET_BPP_DATA_ERR_GAME_RUNNING = 'bpp_data_reset_blocked_by_game';
const RESET_BPP_DATA_ERR_PARTIAL_FAILURE = 'bpp_data_reset_partial_failure:';
const RESET_BEPINEX_ERR_GAME_RUNNING = 'bepinex_reset_blocked_by_game';
const RESET_BEPINEX_ERR_PARTIAL_FAILURE = 'bepinex_reset_partial_failure:';
const RESET_BPP_DATA_PATH_SEPARATOR = '\u001f';

export type ResetError =
  | { code: 'game_running' }
  | { code: 'partial_failure'; paths: string[] };

// Retained alias: the reset-data and reset-BepInEx errors share one shape.
export type ResetBppDataError = ResetError;

function parseResetError(
  error: unknown,
  gameRunningCode: string,
  partialFailurePrefix: string
): ResetError | null {
  const message = toErrorMessage(error);
  if (message === gameRunningCode) {
    return { code: 'game_running' };
  }

  if (message.startsWith(partialFailurePrefix)) {
    const payload = message.slice(partialFailurePrefix.length);
    const paths = payload
      .split(RESET_BPP_DATA_PATH_SEPARATOR)
      .map((path) => path.trim())
      .filter(Boolean);
    return { code: 'partial_failure', paths };
  }

  return null;
}

export function parseResetBppDataError(error: unknown): ResetError | null {
  return parseResetError(
    error,
    RESET_BPP_DATA_ERR_GAME_RUNNING,
    RESET_BPP_DATA_ERR_PARTIAL_FAILURE
  );
}

export function parseResetBepinexError(error: unknown): ResetError | null {
  return parseResetError(
    error,
    RESET_BEPINEX_ERR_GAME_RUNNING,
    RESET_BEPINEX_ERR_PARTIAL_FAILURE
  );
}
