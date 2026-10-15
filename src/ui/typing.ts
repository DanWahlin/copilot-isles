/** True when a key event goes to a text field (an input, textarea, select or contenteditable). */
export function isTyping(e: Event): boolean {
  const t = e.target;
  if (typeof HTMLElement === 'undefined' || !(t instanceof HTMLElement)) return false;
  return t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName);
}
