/**
 * PLAN §14.4 stub: devices without WebGL2 or with software rendering will get the
 * 2D Chart & Logbook mode (Phase 1). For now, explain and link to the course: the catalog's first,
 * loaded on demand so the boot chunk doesn't carry it.
 */
export function showFallback(reason: 'no-webgl2' | 'software'): void {
  const message =
    reason === 'no-webgl2'
      ? "Your browser doesn't support WebGL2, so the 3D isles can't load here."
      : "Your browser isn't using the graphics card (hardware acceleration may be off), so 3D would be too slow.";
  const root = document.getElementById('loading');
  if (!root) return;
  root.innerHTML = '';
  const box = document.createElement('div');
  box.className = 'ld';
  box.style.maxWidth = '32em';
  box.style.padding = '0 1.5em';
  const h = document.createElement('p');
  h.id = 'loadTitle';
  h.textContent = 'KRAKEN ISLES';
  const p = document.createElement('p');
  p.textContent = `${message} A 2D Chart & Logbook mode is coming. Until then, you can follow the course directly.`;
  box.append(h, p);
  root.append(box);
  void import('../course/catalog')
    .then(({ COURSES }) => {
      const c = COURSES[0];
      if (!c?.source?.repo) return;
      const a = document.createElement('a');
      a.href = `https://github.com/${c.source.repo}`;
      a.textContent = `Open the ${c.title} course ↗`;
      a.style.color = 'inherit';
      box.append(a);
    })
    .catch(() => {});
}
