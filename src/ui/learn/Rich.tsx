import type { ReactNode } from 'react';

const LINK = /^\[([^\]]+)\]\((https:\/\/[^\s)]+)\)$/;

/**
 * Renders content strings: `**bold**` for UI labels, `code` spans, and `[text](https://…)` links
 * (https only, opened in a new tab). No HTML is ever injected.
 */
export function Rich({ text }: { text: string }): ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\(https:\/\/[^\s)]+\))/g);
  return parts.map((p, i) => {
    if (p.startsWith('**') && p.endsWith('**') && p.length > 4)
      return <strong key={i}>{p.slice(2, -2)}</strong>;
    if (p.startsWith('`') && p.endsWith('`') && p.length > 2) return <code key={i}>{p.slice(1, -1)}</code>;
    const link = LINK.exec(p);
    if (link)
      return (
        <a key={i} className="ci-rich-link" href={link[2]} target="_blank" rel="noopener noreferrer">
          {link[1]}
        </a>
      );
    return p;
  });
}
