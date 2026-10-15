// Injected before any page script (page.addInitScript) by tools/video/lib.mjs when a scenario sets
// `cursor: true`. Headless Chrome draws no mouse pointer, so this draws one where the real mouse
// events land (a ring pulses on each press), and fades it after a moment without movement. It only
// listens to the page's own pointer events; it never sends any, and it takes no clicks.
(() => {
  if (window.__recCursor) return;
  window.__recCursor = true;
  const SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" width="26" height="38" viewBox="0 0 26 38">' +
    '<path d="M2 2 L2 31 L9.5 24 L14.5 35.5 L19.5 33.3 L14.6 22 L24.5 22 Z" fill="#fff" ' +
    'stroke="#111" stroke-width="2" stroke-linejoin="round"/></svg>';
  let el = null;
  let ring = null;
  let hideAt = 0;
  let down = false;
  const mount = () => {
    if (el || !document.body) return;
    el = document.createElement('div');
    el.style.cssText =
      'position:fixed;left:0;top:0;width:26px;height:38px;z-index:2147483647;pointer-events:none;' +
      'opacity:0;transition:opacity .25s;filter:drop-shadow(0 2px 3px rgb(0 0 0/45%));will-change:transform';
    el.innerHTML = SVG;
    ring = document.createElement('div');
    ring.style.cssText =
      'position:fixed;left:0;top:0;width:34px;height:34px;margin:-17px 0 0 -17px;border-radius:50%;' +
      'border:3px solid rgb(255 236 190/90%);z-index:2147483646;pointer-events:none;opacity:0;transform:scale(.4)';
    document.body.append(ring, el);
  };
  const show = (x, y) => {
    mount();
    if (!el) return;
    el.style.transform = `translate(${x - 2}px, ${y - 2}px)`;
    el.style.opacity = '1';
    hideAt = performance.now() + 1400;
  };
  const opts = { capture: true, passive: true };
  addEventListener('pointermove', (e) => show(e.clientX, e.clientY), opts);
  addEventListener(
    'pointerdown',
    (e) => {
      down = true;
      show(e.clientX, e.clientY);
      if (!ring) return;
      ring.style.left = `${e.clientX}px`;
      ring.style.top = `${e.clientY}px`;
      ring.animate(
        [
          { opacity: 1, transform: 'scale(.4)' },
          { opacity: 0, transform: 'scale(1.25)' },
        ],
        { duration: 420, easing: 'ease-out' },
      );
    },
    opts,
  );
  addEventListener('pointerup', () => (down = false), opts);
  const tick = () => {
    if (el && !down && el.style.opacity === '1' && performance.now() > hideAt) el.style.opacity = '0';
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
})();
