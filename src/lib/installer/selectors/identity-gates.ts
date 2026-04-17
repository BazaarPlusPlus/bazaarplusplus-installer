import type { IdentityState } from '../../identity/state.ts';
import type { PageState } from '../state.ts';
import type { IdentityActionBusy, IdentityLoadState } from './types.ts';

export interface IdentityGatesSelection {
  activationPasswordMatches: boolean;
  identityBusy: boolean;
  canActivateObservedAccount: boolean;
  canLoginIdentity: boolean;
}

export function selectIdentityGates(input: {
  identityState: IdentityState;
  pageState: PageState;
  playerObservationPresent: boolean;
  identityLoadState: IdentityLoadState;
  identityActionBusy: IdentityActionBusy;
  identityPassword: string;
  identityPasswordConfirm: string;
  identityConfirmed: boolean;
}): IdentityGatesSelection {
  const activationPasswordMatches =
    !input.identityPassword.trim() ||
    !input.identityPasswordConfirm.trim() ||
    input.identityPassword.trim() === input.identityPasswordConfirm.trim();
  const identityBusy =
    input.identityLoadState === 'loading' || input.identityActionBusy !== 'idle';

  return {
    activationPasswordMatches,
    identityBusy,
    canActivateObservedAccount:
      input.identityState.kind === 'activate_first_account' &&
      Boolean(input.pageState.effectiveGamePath) &&
      input.playerObservationPresent &&
      Boolean(input.identityPassword.trim()) &&
      Boolean(input.identityPasswordConfirm.trim()) &&
      activationPasswordMatches &&
      input.identityConfirmed &&
      !identityBusy,
    canLoginIdentity:
      Boolean(input.pageState.effectiveGamePath) &&
      input.playerObservationPresent &&
      Boolean(input.identityPassword.trim()) &&
      input.identityConfirmed &&
      !identityBusy
  };
}
