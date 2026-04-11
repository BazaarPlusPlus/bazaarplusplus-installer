import test from 'node:test';
import assert from 'node:assert/strict';

import { createAboutPageModel } from './page-model.ts';

test('createAboutPageModel returns English copy', () => {
  const model = createAboutPageModel('en');

  assert.equal(model.localeBadge, 'EN');
  assert.equal(model.paymentModalTitle, 'Support the Project');
  assert.equal(model.paymentActionLabel, 'WePay');
});

test('createAboutPageModel returns Chinese copy', () => {
  const model = createAboutPageModel('zh');

  assert.equal(model.localeBadge, '中');
  assert.equal(model.paymentModalCloseLabel, '关闭');
  assert.equal(model.supporterEntrySubtitle, '查看名单');
});
