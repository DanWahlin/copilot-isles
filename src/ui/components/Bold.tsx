/** A line with its `**bold**` spans as <b>, the rest as plain spans. */
export function Bold({ text }: { text: string }) {
  return (
    <>
      {text
        .split(/(\*\*[^*]+\*\*)/)
        .map((part, i) =>
          part.startsWith('**') ? <b key={i}>{part.slice(2, -2)}</b> : <span key={i}>{part}</span>,
        )}
    </>
  );
}
