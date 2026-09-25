import type { ReactNode } from 'react';

export function OverlayShell({
  title,
  eyebrow,
  children,
  onBack,
  wide = false,
  hideBack = false,
  className = '',
}: {
  title: string;
  eyebrow: string;
  children: ReactNode;
  onBack?: () => void;
  wide?: boolean;
  hideBack?: boolean;
  className?: string;
}) {
  return (
    <main
      className={`ci-overlay ${wide ? 'wide' : ''} ${className}`}
      aria-labelledby={`ci-${title.replaceAll(' ', '-').toLowerCase()}`}
    >
      <section className="ci-panel">
        {!hideBack && onBack && (
          <button className="ci-back" onClick={onBack} aria-label="Back">
            ← Back
          </button>
        )}
        <p className="ci-kicker">{eyebrow}</p>
        <h2 id={`ci-${title.replaceAll(' ', '-').toLowerCase()}`}>{title}</h2>
        {children}
      </section>
    </main>
  );
}
