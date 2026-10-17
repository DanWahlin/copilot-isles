import { Fragment } from 'react';
import { fill } from '../../course/fill';

/** A line of a course's copy: `**bold**` and `code` spans as such, with `{name}` values filled in. */
export function Rich({ text, values }: { text: string; values?: Readonly<Record<string, string | number>> }) {
  return (
    <>
      {(values ? fill(text, values) : text)
        .split(/(\*\*[^*]+\*\*|`[^`]+`)/)
        .map((part, i) =>
          part.startsWith('**') ? (
            <strong key={i}>{part.slice(2, -2)}</strong>
          ) : part.startsWith('`') ? (
            <code key={i}>{part.slice(1, -1)}</code>
          ) : (
            <Fragment key={i}>{part}</Fragment>
          ),
        )}
    </>
  );
}
