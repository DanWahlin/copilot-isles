import type { ReactNode } from 'react';

export function MenuButton({
  children,
  detail,
  initial = false,
  onClick,
}: {
  children: ReactNode;
  detail?: ReactNode;
  initial?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={`ci-menu-button ${detail ? 'has-detail' : ''}`}
      data-initial-focus={initial ? 'true' : undefined}
      onClick={onClick}
    >
      <span>{children}</span>
      {detail && <small>{detail}</small>}
    </button>
  );
}
