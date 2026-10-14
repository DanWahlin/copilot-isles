import { createContext, useContext, type ReactNode } from 'react';
import { forkName, type ForkRef } from '../../learn/fork';

const LINK = /^\[([^\]]+)\]\((https:\/\/[^\s)]+)\)$/;

/** The player's fork, for `{fork}` in content strings (the placeholder fork until they give it). */
export const ForkContext = createContext<ForkRef | null>(null);

/**
 * Renders content strings: `**bold**` for UI labels, `code` spans, and `[text](https://…)` links
 * (https only, opened in a new tab). `{fork}` becomes the player's `owner/repo`. No HTML is ever
 * injected.
 */
export function Rich({ text }: { text: string }): ReactNode {
  const fork = useContext(ForkContext);
  const shown = text.includes('{fork}') ? text.replaceAll('{fork}', forkName(fork)) : text;
  const parts = shown.split(/(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\(https:\/\/[^\s)]+\))/g);
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
