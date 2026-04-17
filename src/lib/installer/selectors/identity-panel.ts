import type { IdentityState } from '../../identity/state.ts';
import type { IdentityLoadState, LocalizedText } from './types.ts';

export interface IdentityPanelSelection {
  title: string;
  summary: string;
  accountHighlight?: string;
}

export function selectIdentityPanel(input: {
  identityState: IdentityState;
  identityLoadState: IdentityLoadState;
  localized: LocalizedText;
}): IdentityPanelSelection {
  if (input.identityLoadState === 'loading') {
    return {
      title: input.localized('账号', 'Account'),
      summary: input.localized('读取中…', 'Loading...')
    };
  }

  switch (input.identityState.kind) {
    case 'observation_required':
      return {
        title: input.localized('账号', 'Account'),
        summary: input.localized('未检测到游戏账号', 'No game account detected')
      };
    case 'login_or_register':
      return {
        title: input.localized('账号', 'Account'),
        summary: input.localized('检测到游戏账号', 'Detected game account'),
        accountHighlight: input.identityState.observation.player_username
      };
    case 'account_mismatch':
      return {
        title: input.localized('账号', 'Account'),
        summary: input.localized(
          '账号不一致，请登出后重新登录',
          'Account mismatch — sign out and sign in again'
        )
      };
    case 'ready':
      return {
        title: input.localized('账号', 'Account'),
        summary: input.localized('已登录', 'Signed in as'),
        accountHighlight: input.identityState.auth.player_username
      };
  }
}
