import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { IMAGES, imageUrl } from '../../learn/content/index';
import type { Answer, Grade } from '../../learn/grade';
import type { HotspotQuiz, Rect } from '../../learn/types';

const pct = (v: number) => `${(v * 100).toFixed(3)}%`;
const rectStyle = (r: Rect) => ({ left: pct(r[0]), top: pct(r[1]), width: pct(r[2]), height: pct(r[3]) });
const LENS_SIZE = 176;
const LENS_ZOOM = 2.2;

/** Median colour of a 4 px ring just outside each mask rect, so patches blend into the screenshot. */
function sampleMaskColours(img: HTMLImageElement, masks: readonly Rect[]): string[] {
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return masks.map(() => '#f4f4f4');
  ctx.drawImage(img, 0, 0);
  return masks.map((m) => {
    const x0 = Math.max(0, Math.floor(m[0] * w) - 4);
    const y0 = Math.max(0, Math.floor(m[1] * h) - 4);
    const x1 = Math.min(w - 1, Math.ceil((m[0] + m[2]) * w) + 4);
    const y1 = Math.min(h - 1, Math.ceil((m[1] + m[3]) * h) + 4);
    const data = ctx.getImageData(x0, y0, x1 - x0 + 1, y1 - y0 + 1).data;
    const cw = x1 - x0 + 1;
    const ch = y1 - y0 + 1;
    const lum: [number, number, number, number][] = [];
    for (let y = 0; y < ch; y++) {
      for (let x = 0; x < cw; x++) {
        if (x >= 4 && x < cw - 4 && y >= 4 && y < ch - 4) continue;
        const i = (y * cw + x) * 4;
        const r = data[i]!;
        const g = data[i + 1]!;
        const b = data[i + 2]!;
        lum.push([r * 0.3 + g * 0.59 + b * 0.11, r, g, b]);
      }
    }
    lum.sort((a, b) => a[0] - b[0]);
    const mid = lum[Math.floor(lum.length / 2)] ?? [0, 244, 244, 244];
    return `rgb(${mid[1]}, ${mid[2]}, ${mid[3]})`;
  });
}

export function Hotspot({
  quiz,
  last,
  onAnswer,
}: {
  quiz: HotspotQuiz;
  last: Grade | null;
  onAnswer: (a: Answer) => void;
}) {
  const img = IMAGES.get(quiz.image);
  const url = imageUrl(quiz.image);
  const frame = useRef<HTMLDivElement>(null);
  const [colours, setColours] = useState<string[]>([]);
  const [marker, setMarker] = useState<{ x: number; y: number } | null>(null);
  const [lens, setLens] = useState<{ x: number; y: number } | null>(null);
  const [shift, setShift] = useState(false);

  useEffect(() => {
    setMarker(null);
    if (!quiz.mask.length) return setColours([]);
    const el = new Image();
    el.onload = () => setColours(sampleMaskColours(el, quiz.mask));
    el.src = url;
  }, [quiz, url]);

  useEffect(() => {
    if (!last) setMarker(null);
  }, [last]);

  useEffect(() => {
    const down = (e: globalThis.KeyboardEvent) => e.key === 'Shift' && setShift(true);
    const up = (e: globalThis.KeyboardEvent) => e.key === 'Shift' && setShift(false);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  if (!img) return null;
  const locked = !!last;

  const norm = (e: MouseEvent) => {
    const r = frame.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
  };
  const click = (e: MouseEvent) => {
    if (locked) return;
    const p = norm(e);
    setMarker(p);
    onAnswer({ type: 'hotspot', x: p.x, y: p.y });
  };
  const pick = (id: string, rect: Rect) => (e: KeyboardEvent) => {
    if (locked || (e.key !== 'Enter' && e.key !== ' ')) return;
    e.preventDefault();
    e.stopPropagation();
    setMarker({ x: rect[0] + rect[2] / 2, y: rect[1] + rect[3] / 2 });
    onAnswer({ type: 'hotspot-target', target: id });
  };

  const hit = last?.hit ? quiz.targets.find((t) => t.id === last.hit) : undefined;
  const correctTargets = quiz.targets.filter((t) => t.correct);

  return (
    <div className="ci-hotspot">
      <div
        ref={frame}
        className={`ci-hotspot-frame${locked ? ' locked' : ''}`}
        style={{ aspectRatio: `${img.width} / ${img.height}` }}
        onClick={click}
        onMouseMove={(e) => setLens(norm(e))}
        onMouseLeave={() => setLens(null)}
        role="group"
        aria-label={`${img.alt}. Click where you'd select, or press Tab to cycle through the choices.`}
      >
        <img src={url} alt={img.alt} draggable={false} />
        {quiz.mask.map((m, i) => (
          <div
            key={i}
            className="ci-hotspot-mask"
            style={{ ...rectStyle(m), background: colours[i] ?? 'transparent', opacity: colours[i] ? 1 : 0 }}
          />
        ))}
        {quiz.targets.map((t) => (
          <button
            key={t.id}
            type="button"
            className="ci-hotspot-target"
            style={rectStyle(t.rect)}
            aria-label={t.label}
            tabIndex={locked ? -1 : 0}
            onKeyDown={pick(t.id, t.rect)}
            onClick={(e) => e.preventDefault()}
          />
        ))}
        {last?.correct &&
          correctTargets.map((t) => (
            <div key={t.id} className="ci-hotspot-ring good" style={rectStyle(t.rect)} />
          ))}
        {last && !last.correct && hit && <div className="ci-hotspot-ring bad" style={rectStyle(hit.rect)} />}
        {marker && (
          <div
            className={`ci-hotspot-marker${last ? (last.correct ? ' good' : ' bad') : ''}`}
            style={{ left: pct(marker.x), top: pct(marker.y) }}
            aria-hidden
          >
            {last ? (last.correct ? '✓' : '✕') : ''}
          </div>
        )}
        {shift && lens && !locked && frame.current && (
          <div
            className="ci-hotspot-lens"
            style={{
              left: pct(lens.x),
              top: pct(lens.y),
              backgroundImage: `url(${url})`,
              backgroundSize: `${frame.current.clientWidth * LENS_ZOOM}px ${frame.current.clientHeight * LENS_ZOOM}px`,
              backgroundPosition: `${LENS_SIZE / 2 - lens.x * frame.current.clientWidth * LENS_ZOOM}px ${
                LENS_SIZE / 2 - lens.y * frame.current.clientHeight * LENS_ZOOM
              }px`,
            }}
            aria-hidden
          />
        )}
      </div>
      <p className="ci-hotspot-help">
        Click to choose · hold <kbd>Shift</kbd> to magnify · <kbd>Tab</kbd> cycles the choices
      </p>
    </div>
  );
}
