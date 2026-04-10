import type {
  InstallationRecordPayload,
  PlayerObservationPayload
} from './types.ts';

export type IdentityState =
  | {
      kind: 'observation_required';
      installation: null;
      observation: null;
    }
  | {
      kind: 'activate_first_account';
      installation: null;
      observation: PlayerObservationPayload;
    }
  | {
      kind: 'relogin_required';
      installation: InstallationRecordPayload;
      observation: PlayerObservationPayload;
    }
  | {
      kind: 'ready';
      installation: InstallationRecordPayload;
      observation: PlayerObservationPayload | null;
    };

export function createIdentityState(input: {
  observation: PlayerObservationPayload | null;
  installation: InstallationRecordPayload | null;
  hasInstallationPrivateKey: boolean;
}): IdentityState {
  const installation =
    input.installation && input.hasInstallationPrivateKey
      ? input.installation
      : null;

  if (!installation && !input.observation) {
    return {
      kind: 'observation_required',
      installation: null,
      observation: null
    };
  }

  if (!installation && input.observation) {
    return {
      kind: 'activate_first_account',
      installation: null,
      observation: input.observation
    };
  }

  if (
    installation &&
    input.observation &&
    installation.player_account_id !== input.observation.player_account_id
  ) {
    return {
      kind: 'relogin_required',
      installation,
      observation: input.observation
    };
  }

  return {
    kind: 'ready',
    installation: installation!,
    observation: input.observation
  };
}
