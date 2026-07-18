import type { SemanticProblemCode } from '../../types/backend';
import type { Translate } from '../../i18n/LocaleProvider';
import type { MessageKey } from '../../i18n/messages';
import type { UiProblem } from '../shared/problems';

export type HistoryPageProblemCode =
  | SemanticProblemCode
  | 'history_preview_unavailable'
  | 'history_unexpected';

export type HistoryPageProblem = UiProblem<HistoryPageProblemCode>;

export function historyProblemMessageKey(
  problem: HistoryPageProblem
): MessageKey {
  switch (problem.code) {
    case 'history_unavailable':
      return 'historyProblemUnavailable';
    case 'history_read_failed':
      return 'historyProblemReadFailed';
    case 'history_preview_unavailable':
      return 'historyProblemPreviewUnavailable';
    case 'history_unexpected':
      return 'historyProblemUnexpected';
  }
}

export function presentHistoryProblem(
  problem: HistoryPageProblem,
  t: Translate
): string {
  return t(historyProblemMessageKey(problem), problem.params);
}
