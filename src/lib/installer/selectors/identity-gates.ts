import type { IdentityState } from '../../identity/state.ts';
import type { PageState } from '../state.ts';
import type { IdentityActionBusy, IdentityLoadState } from './types.ts';

export interface IdentityGatesSelection {
  identityBusy: boolean;
  canContinueIdentity: boolean;
  canLogoutIdentity: boolean;
}

export function selectIdentityGates(input: {
  identityState: IdentityState;
  pageState: PageState;
  identityLoadState: IdentityLoadState;
  identityActionBusy: IdentityActionBusy;
  identityPassword: string;
}): IdentityGatesSelection {
  const identityBusy =
    input.identityLoadState === 'loading' || input.identityActionBusy !== 'idle';
  const hasGameRoot = Boolean(input.pageState.effectiveGamePath);

  return {
    identityBusy,
    canContinueIdentity:
      input.identityState.kind === 'login_or_register' &&
      hasGameRoot &&
      Boolean(input.identityPassword.trim()) &&
      !identityBusy,
    canLogoutIdentity:
      (input.identityState.kind === 'ready' ||
        input.identityState.kind === 'account_mismatch') &&
      hasGameRoot &&
      !identityBusy
  };
}
