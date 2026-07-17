import type { ReactNode } from 'react';

export function PageHeader({
  eyebrow,
  title,
  action
}: {
  eyebrow: string;
  title: string;
  action?: ReactNode;
}) {
  return (
    <div className="bpp-page-header">
      <p className="bpp-page-eyebrow">{eyebrow}</p>
      {action ? (
        <div className="flex items-center justify-between">
          <Title>{title}</Title>
          {action}
        </div>
      ) : (
        <Title>{title}</Title>
      )}
    </div>
  );
}

function Title({ children }: { children: ReactNode }) {
  return <h2 className="bpp-page-title">{children}</h2>;
}
