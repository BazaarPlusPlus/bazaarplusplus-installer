import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { LocaleProvider } from '../../i18n/LocaleProvider';
import { messages } from '../../i18n/messages';
import { ConfirmDialog, type ConfirmDialogProps } from './ConfirmDialog';

function render(overrides: Partial<ConfirmDialogProps> = {}) {
  return renderToStaticMarkup(
    <LocaleProvider>
      <ConfirmDialog
        titleId="test-title"
        title="Test Title"
        tone="danger"
        confirmLabel="Confirm It"
        busy={false}
        onConfirm={() => undefined}
        onClose={() => undefined}
        {...overrides}
      >
        <p>unique-body-marker</p>
      </ConfirmDialog>
    </LocaleProvider>
  );
}

describe('ConfirmDialog', () => {
  it('wires aria-labelledby <-> h2 id, title, localized close/cancel; slot order', () => {
    const html = render();
    expect(html).toContain('aria-labelledby="test-title"');
    expect(html).toContain('id="test-title"');
    expect(html).toContain(`aria-label="${messages.zh.close}"`);
    expect(html).toContain(messages.zh.cancel);
    const ti = html.indexOf('Test Title');
    const bi = html.indexOf('unique-body-marker');
    const ci = html.indexOf(messages.zh.cancel);
    const fi = html.indexOf('Confirm It');
    expect(bi).toBeGreaterThan(ti);
    expect(ci).toBeGreaterThan(bi);
    expect(fi).toBeGreaterThan(ci);
  });

  it('tone axis: danger red gradient + gap-5 + AlertTriangle tint', () => {
    const d = render();
    expect(d).toContain('from-[#d85d5d]');
    expect(d).toContain('text-[rgba(232,120,120,0.9)]');
    expect(d).toContain('p-6 flex flex-col gap-5');
    expect(d).not.toContain('from-[#d4a040]');
    const g = render({ tone: 'gold' });
    expect(g).toContain('from-[#d4a040]');
    expect(g).toContain('text-[rgba(200,148,55,0.8)]');
    expect(g).toContain('p-6 flex flex-col gap-6');
  });

  it('busy WITHOUT busyLabel: spinner + same label; confirm disabled', () => {
    expect(render()).not.toContain('animate-spin');
    expect(render()).not.toContain('disabled=""');
    const busy = render({ busy: true });
    expect(busy).toContain('animate-spin');
    expect(busy).toContain('Confirm It');
    expect(busy).toContain('disabled=""');
  });

  it('busy WITH busyLabel (Install affordance): text swap, NO spinner', () => {
    const busy = render({
      tone: 'gold',
      busyLabel: 'Working…',
      busy: true
    });
    expect(busy).toContain('Working…');
    expect(busy).not.toContain('Confirm It');
    expect(busy).not.toContain('animate-spin');
    expect(busy).toContain('disabled=""');
  });

  it('acknowledge gates confirm and renders tone-styled checkbox', () => {
    const ack = (checked: boolean) =>
      render({
        acknowledge: {
          label: 'ack-label',
          checked,
          onChange: () => undefined
        }
      });
    const off = ack(false);
    expect(off).toContain('type="checkbox"');
    expect(off).toContain('ack-label');
    expect(off).toContain('disabled=""');
    expect(off).not.toContain('checked=""');
    const on = ack(true);
    expect(on).toContain('checked=""');
    expect(on).not.toContain('disabled=""');
  });

  it('confirmDisabled disables confirm even when idle (Cleanup nothing-to-clean)', () => {
    expect(render({ confirmDisabled: true })).toContain('disabled=""');
  });

  it('can make every dismiss control visibly unavailable for an uncancellable action', () => {
    const html = render({ busy: true, dismissDisabled: true });
    expect(html.match(/disabled=""/g)).toHaveLength(3);
  });
});
