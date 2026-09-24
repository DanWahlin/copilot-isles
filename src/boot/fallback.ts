const COURSE_URL = 'https://github.com/github/copilot-app-for-beginners';

/**
 * PLAN §14.4 stub: devices without WebGL2 or with software rendering will get the
 * 2D Chart & Logbook mode (Phase 1). For now, explain and link to the course.
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
  h.textContent = 'COPILOT ISLES';
  const p = document.createElement('p');
  p.textContent = `${message} A 2D Chart & Logbook mode is coming. Until then, you can follow the course directly.`;
  const a = document.createElement('a');
  a.href = COURSE_URL;
  a.textContent = 'Open the GitHub Copilot app for Beginners course ↗';
  a.style.color = 'inherit';
  box.append(h, p, a);
  root.append(box);
}
