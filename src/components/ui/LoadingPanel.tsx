import { Loader2 } from 'lucide-react';

export function LoadingPanel({
  label,
  className = 'h-48'
}: {
  label: string;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className={`flex items-center justify-center ${className} text-[rgba(200,170,120,0.8)] gap-2`}
    >
      <Loader2 size={18} className="animate-spin" aria-hidden="true" />
      <span className="text-sm">{label}</span>
    </div>
  );
}
