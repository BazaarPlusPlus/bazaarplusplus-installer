import type { IdentityState } from '../../identity/state.ts';
import type { PageState } from '../state.ts';
import type { IdentityActionBusy, IdentityLoadState } from './types.ts';

export interface IdentityGatesSelection {
  identityBusy: boolean;
  canLoginIdentity: boolean;
}

export function selectIdentityGates(input: {
  identityState: IdentityState;
  pageState: PageState;
  playerObservationPresent: boolean;
  identityLoadState: IdentityLoadState;
  identityActionBusy: IdentityActionBusy;
  identityPassword: string;
  identityConfirmed: boolean;
}): IdentityGatesSelection {
  const identityBusy =
    input.identityLoadState === 'loading' || input.identityActionBusy !== 'idle';

  return {
    identityBusy,
    canLoginIdentity:
      Boolean(input.pageState.effectiveGamePath) &&
      input.playerObservationPresent &&
      Boolean(input.identityPassword.trim()) &&
      input.identityConfirmed &&
      !identityBusy
  };
}
