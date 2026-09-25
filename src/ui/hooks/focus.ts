export function focusable(root: HTMLElement): HTMLElement[] {
  return Array.from(
    root.querySelectorAll<HTMLElement>(
      'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), [tabindex="0"]',
    ),
  ).filter((el) => el.offsetParent !== null);
}

export function initialFocusable(root: HTMLElement): HTMLElement | null {
  return root.querySelector<HTMLElement>('[data-initial-focus="true"]') ?? focusable(root)[0] ?? null;
}
