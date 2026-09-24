import type { ReactNode } from 'react';

/** Renders content strings: `**bold**` for UI labels and `code` spans. No HTML is ever injected. */
export function Rich({ text }: { text: string }): ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((p, i) => {
    if (p.startsWith('**') && p.endsWith('**') && p.length > 4)
      return <strong key={i}>{p.slice(2, -2)}</strong>;
    if (p.startsWith('`') && p.endsWith('`') && p.length > 2) return <code key={i}>{p.slice(1, -1)}</code>;
    return p;
  });
}
