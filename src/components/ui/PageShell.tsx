import type { ReactNode } from 'react';
import { PageHeader } from './PageHeader';

export function PageShell({
  eyebrow,
  title,
  action,
  children
}: {
  eyebrow: string;
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="bpp-page">
      <PageHeader eyebrow={eyebrow} title={title} action={action} />
      {children}
    </div>
  );
}
