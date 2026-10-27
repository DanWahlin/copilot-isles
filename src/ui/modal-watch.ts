/**
 * Marks the page while a modal card is open (any `[aria-modal="true"]`: a quiz, a page, the Logbook,
 * a setup form, the Seal card, the market, a battle's briefing…), so the island HUD's panels behind it
 * step away (`body.ci-modal`, game/hud.css) and none of them overlaps the card. A new card needs no
 * wiring: it's a dialog with `aria-modal`. Returns the stop.
 */
export function watchModals(root: HTMLElement = document.body): () => void {
  let open = false;
  const update = () => {
    const now = root.querySelector('[aria-modal="true"]') !== null;
    if (now === open) return;
    open = now;
    document.body.classList.toggle('ci-modal', now);
  };
  const observer = new MutationObserver(update);
  observer.observe(root, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['aria-modal'],
  });
  update();
  return () => {
    observer.disconnect();
    document.body.classList.remove('ci-modal');
  };
}
