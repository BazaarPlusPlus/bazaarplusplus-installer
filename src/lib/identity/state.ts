import type { AuthRecordPayload, PlayerObservationPayload } from './types.ts';

export type IdentityState =
  | {
      kind: 'observation_required';
      auth: null;
      observation: null;
    }
  | {
      kind: 'login_or_register';
      auth: null;
      observation: PlayerObservationPayload;
    }
  | {
      kind: 'account_mismatch';
      auth: AuthRecordPayload;
      observation: PlayerObservationPayload;
    }
  | {
      kind: 'ready';
      auth: AuthRecordPayload;
      observation: PlayerObservationPayload | null;
    };

export function createIdentityState(input: {
  observation: PlayerObservationPayload | null;
  auth: AuthRecordPayload | null;
}): IdentityState {
  if (!input.auth && !input.observation) {
    return {
      kind: 'observation_required',
      auth: null,
      observation: null
    };
  }

  if (!input.auth && input.observation) {
    return {
      kind: 'login_or_register',
      auth: null,
      observation: input.observation
    };
  }

  if (
    input.auth &&
    input.observation &&
    input.auth.player_account_id !== input.observation.player_account_id
  ) {
    return {
      kind: 'account_mismatch',
      auth: input.auth,
      observation: input.observation
    };
  }

  return {
    kind: 'ready',
    auth: input.auth!,
    observation: input.observation
  };
}
