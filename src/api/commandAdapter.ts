import type { commands as generatedCommands } from '../types/generated/commands';

type GeneratedCommands = typeof generatedCommands;
type NullablePreviewCommand = 'getHistoryRunDetail' | 'deleteBattleVideo';

type AdaptCommand<K extends keyof GeneratedCommands> =
  GeneratedCommands[K] extends (...args: infer Args) => Promise<infer Result>
    ? (
        ...args: Args
      ) => Promise<Result | (K extends NullablePreviewCommand ? null : never)>
    : never;

/** Shared contract implemented by both the generated native client and Preview. */
export type CommandAdapter = {
  [K in keyof GeneratedCommands]: AdaptCommand<K>;
};
