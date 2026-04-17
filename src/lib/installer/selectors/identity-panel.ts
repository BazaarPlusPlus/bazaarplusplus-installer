import type { IdentityState } from '../../identity/state.ts';
import type { IdentityLoadState, LocalizedText } from './types.ts';

export interface IdentityPanelSelection {
  title: string;
  summary: string;
}

export function selectIdentityPanel(input: {
  identityState: IdentityState;
  identityLoadState: IdentityLoadState;
  localized: LocalizedText;
}): IdentityPanelSelection {
  return {
    title:
      input.identityState.kind === 'observation_required'
        ? input.localized('未检测到游戏账号', 'No game account detected')
        : input.identityState.kind === 'activate_first_account'
          ? input.localized('需要验证当前账号', 'Identity verification required')
          : input.identityState.kind === 'relogin_required'
            ? input.localized('重新连接当前账号', 'Reconnect current account')
            : input.localized('账号已连接', 'Account connected'),
    summary:
      input.identityLoadState === 'loading'
        ? input.localized('正在读取账号状态…', 'Reading account status...')
        : input.identityState.kind === 'observation_required'
          ? input.localized(
              '请先启动一次游戏，以便完成账号识别',
              'Launch the game once to complete account detection.'
            )
          : input.identityState.kind === 'activate_first_account'
            ? input.localized(
                `当前账号：${input.identityState.observation.player_username}。继续后会为这台电脑建立本地凭证。`,
                `Current account: ${input.identityState.observation.player_username}. Continue to create local credentials for this machine.`
              )
            : input.identityState.kind === 'relogin_required'
              ? input.localized(
                  `当前账号：${input.identityState.observation.player_username}。继续后会刷新这台电脑上的本地凭证。`,
                  `Current account: ${input.identityState.observation.player_username}. Continue to refresh the local credentials on this machine.`
                )
              : input.localized(
                  '这台电脑上的本地安装凭证已经就绪。',
                  'Local installation credentials are ready on this machine.'
                )
  };
}
