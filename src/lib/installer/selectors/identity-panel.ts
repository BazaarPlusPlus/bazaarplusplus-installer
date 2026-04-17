import type { IdentityState } from '../../identity/state.ts';
import type { IdentityLoadState, LocalizedText } from './types.ts';

export interface IdentityPanelSelection {
  title: string;
  summary: string;
  shouldCollapse: boolean;
}

export function selectIdentityPanel(input: {
  identityState: IdentityState;
  identityLoadState: IdentityLoadState;
  localized: LocalizedText;
}): IdentityPanelSelection {
  return {
    title:
      input.identityState.kind === 'observation_required'
        ? input.localized('尚未检测到游戏账号', 'No game account detected yet')
        : input.identityState.kind === 'activate_first_account'
          ? input.localized('已检测到游戏账号', 'Game account detected')
          : input.identityState.kind === 'relogin_required'
            ? input.localized('检测到账号切换', 'Game account changed')
            : input.localized('账号已连接', 'Account connected'),
    summary:
      input.identityLoadState === 'loading'
        ? input.localized('正在读取账号状态…', 'Reading account status...')
        : input.identityState.kind === 'observation_required'
          ? input.localized(
              '请先安装最新版 MOD，运行一次游戏，再回来绑定账号。',
              'Install the latest mod, run the game once, then come back to bind the account.'
            )
          : input.identityState.kind === 'activate_first_account'
            ? input.localized(
                `当前账号：${input.identityState.observation.player_username}，点击展开继续。`,
                `Current account: ${input.identityState.observation.player_username}. Click to continue.`
              )
            : input.identityState.kind === 'relogin_required'
              ? input.localized(
                  `当前账号：${input.identityState.observation.player_username}，点击展开重新登录。`,
                  `Current account: ${input.identityState.observation.player_username}. Click to re-login.`
                )
              : '',
    shouldCollapse: input.identityState.kind === 'ready'
  };
}
