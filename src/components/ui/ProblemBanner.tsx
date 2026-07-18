import type { ReactNode } from 'react';

export function ProblemBanner({
  message,
  tone = 'error',
  actions,
  diagnostic,
  diagnosticLabel
}: {
  message: string;
  tone?: 'error' | 'warning';
  actions?: ReactNode;
  diagnostic?: string | null;
  diagnosticLabel?: string;
}) {
  const error = tone === 'error';
  return (
    <div
      role={error ? 'alert' : 'status'}
      aria-live={error ? 'assertive' : 'polite'}
      className={`px-4 py-3 border text-sm selectable ${
        error
          ? 'border-[rgba(217,109,109,0.28)] bg-[rgba(217,109,109,0.08)] text-[#d96d6d]'
          : 'border-[rgba(232,200,122,0.28)] bg-[rgba(232,200,122,0.07)] text-[#e8c87a]'
      }`}
    >
      <div className="flex items-center justify-between gap-4">
        <p className="m-0">{message}</p>
        {actions && (
          <div className="flex items-center gap-3 shrink-0">{actions}</div>
        )}
      </div>
      {diagnostic && diagnosticLabel && (
        <details className="mt-2 text-xs text-[rgba(232,220,200,0.78)]">
          <summary className="cursor-pointer">{diagnosticLabel}</summary>
          <pre className="m-0 mt-2 whitespace-pre-wrap select-text">
            {diagnostic}
          </pre>
        </details>
      )}
    </div>
  );
}
