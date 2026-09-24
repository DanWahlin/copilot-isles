import type { ReactNode } from 'react';
import type { ChartIsland } from '../bridge';
import { ARCH_H, ARCH_W, chapterParts } from './archipelago';

/**
 * The archipelago page of the Captain's Chart: each chapter's island drawn with its own shape,
 * colours, and landmark, a voyage route in chapter order, and labels that say what it teaches.
 */
export function ArchipelagoMap({
  islands,
  selected,
  onSelect,
  onOpen,
}: {
  islands: readonly ChartIsland[];
  selected: ChartIsland | null;
  onSelect: (island: ChartIsland) => void;
  onOpen: (island: ChartIsland) => void;
}) {
  const pts = islands.map((i) => [i.x * ARCH_W, i.y * ARCH_H] as [number, number]);
  const current = Math.max(
    0,
    islands.findIndex((i) => i.status === 'current'),
  );
  return (
    <g className="ci-arch">
      <Rhumbs x={COMPASS.x} y={COMPASS.y} />
      <Cartouche />
      <path className="ci-arch-route" d={openCurve(pts)} />
      {current > 0 && <path className="ci-arch-route done" d={openCurve(pts.slice(0, current + 1))} />}
      <CompassRose x={COMPASS.x} y={COMPASS.y} r={64} />
      {islands.map((island, index) => {
        const art = ART[island.id] ?? ART.anchorage!;
        const [x, y] = pts[index]!;
        const { num, title } = chapterParts(island.chapter);
        const locked = island.status === 'locked';
        const act = () => (onSelect(island), !locked && selected?.id === island.id && onOpen(island));
        return (
          <g
            key={island.id}
            className={`ci-arch-island ${island.status}${selected?.id === island.id ? ' selected' : ''}`}
            transform={`translate(${x} ${y})`}
            tabIndex={0}
            role="button"
            aria-pressed={selected?.id === island.id}
            aria-label={`Chapter ${num}, ${island.name}: ${title}. ${statusLabel(island.status)}.`}
            onClick={act}
            onFocus={() => onSelect(island)}
            onMouseEnter={() => onSelect(island)}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), act())}
          >
            {island.status === 'current' && (
              <ellipse className="ci-arch-here" rx={art.rx * 1.55} ry={art.ry * 1.6} />
            )}
            <g className="ci-arch-art">{art.draw()}</g>
            <g className="ci-arch-badge" transform={`translate(${-art.rx * 0.95} ${-art.ry * 0.9})`}>
              <circle r="15" />
              <text dy="0.36em">{num}</text>
              {locked && <LockGlyph />}
            </g>
            {island.status === 'current' && <Pennant x={art.rx * 0.55} y={-art.ry * 0.55} />}
            <g className="ci-arch-label" transform={`translate(0 ${art.ry * 1.25 + 24})`}>
              <text className="name">{island.name}</text>
              <text className="topic" dy="19">
                {title}
              </text>
            </g>
          </g>
        );
      })}
    </g>
  );
}

/** The aged-parchment sheet both chart pages draw on: paper, vignette, sea hatching, and a neatline. */
export function Parchment({ w, h }: { w: number; h: number }) {
  const ticks: ReactNode[] = [];
  const band = 12;
  for (let x = 30, i = 0; x < w - 30; x += 40, i++)
    if (i % 2 === 0)
      ticks.push(
        <rect key={`t${x}`} x={x} y={18} width={40} height={band} />,
        <rect key={`b${x}`} x={x} y={h - 18 - band} width={40} height={band} />,
      );
  for (let y = 30, i = 0; y < h - 30; y += 40, i++)
    if (i % 2 === 0)
      ticks.push(
        <rect key={`l${y}`} x={18} y={y} width={band} height={40} />,
        <rect key={`r${y}`} x={w - 18 - band} y={y} width={band} height={40} />,
      );
  return (
    <g className="ci-parchment">
      <defs>
        <filter id="ci-paper-noise" x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.03" numOctaves="3" seed="7" />
          <feColorMatrix type="saturate" values="0" />
          <feComponentTransfer>
            <feFuncA type="table" tableValues="0 .14" />
          </feComponentTransfer>
          <feComposite in2="SourceGraphic" operator="in" />
        </filter>
        <radialGradient id="ci-paper-vignette" cx="50%" cy="48%" r="72%">
          <stop offset="62%" stopColor="#6b4a20" stopOpacity="0" />
          <stop offset="100%" stopColor="#6b4a20" stopOpacity=".32" />
        </radialGradient>
        <pattern id="ci-sea-lines" width="64" height="30" patternUnits="userSpaceOnUse">
          <path d="M6 16c10-7 20 7 30 0 6-4 10-4 16 0" />
        </pattern>
      </defs>
      <rect width={w} height={h} rx="22" className="paper" />
      <rect width={w} height={h} rx="22" filter="url(#ci-paper-noise)" />
      <rect x="30" y="30" width={w - 60} height={h - 60} className="sea" />
      <rect width={w} height={h} rx="22" fill="url(#ci-paper-vignette)" />
      <g className="ticks">{ticks}</g>
      <rect x="18" y="18" width={w - 36} height={h - 36} className="neat outer" />
      <rect x="30" y="30" width={w - 60} height={h - 60} className="neat" />
    </g>
  );
}

export function CompassRose({ x, y, r }: { x: number; y: number; r: number }) {
  const long = r * 0.92;
  const short = r * 0.52;
  const w = r * 0.13;
  const points = [0, 90, 180, 270].map((deg) => {
    const a = ((deg - 90) * Math.PI) / 180;
    const p = [Math.cos(a) * long, Math.sin(a) * long];
    const l = [Math.cos(a - Math.PI / 2) * w, Math.sin(a - Math.PI / 2) * w];
    const rt = [Math.cos(a + Math.PI / 2) * w, Math.sin(a + Math.PI / 2) * w];
    return (
      <g key={deg}>
        <path className="dark" d={`M0 0L${l[0]} ${l[1]}L${p[0]} ${p[1]}Z`} />
        <path className="light" d={`M0 0L${rt[0]} ${rt[1]}L${p[0]} ${p[1]}Z`} />
      </g>
    );
  });
  const diag = [45, 135, 225, 315].map((deg) => {
    const a = ((deg - 90) * Math.PI) / 180;
    const p = [Math.cos(a) * short, Math.sin(a) * short];
    const l = [Math.cos(a - Math.PI / 2) * w * 0.7, Math.sin(a - Math.PI / 2) * w * 0.7];
    const rt = [Math.cos(a + Math.PI / 2) * w * 0.7, Math.sin(a + Math.PI / 2) * w * 0.7];
    return <path key={deg} className="mid" d={`M${l[0]} ${l[1]}L${p[0]} ${p[1]}L${rt[0]} ${rt[1]}Z`} />;
  });
  const ticks = Array.from({ length: 32 }, (_, i) => {
    const a = (i / 32) * Math.PI * 2;
    const r0 = r * (i % 4 === 0 ? 0.78 : 0.84);
    return (
      <line
        key={i}
        x1={Math.cos(a) * r0}
        y1={Math.sin(a) * r0}
        x2={Math.cos(a) * r * 0.9}
        y2={Math.sin(a) * r * 0.9}
      />
    );
  });
  return (
    <g className="ci-compass" transform={`translate(${x} ${y})`} aria-hidden="true">
      <circle r={r * 0.9} className="ring" />
      <circle r={r * 0.78} className="ring thin" />
      {ticks}
      {diag}
      {points}
      <circle r={r * 0.07} className="hub" />
      <text y={-r - 8}>N</text>
    </g>
  );
}

const COMPASS = { x: 585, y: 365 };

function Rhumbs({ x, y }: { x: number; y: number }) {
  return (
    <g className="ci-rhumbs" aria-hidden="true">
      {Array.from({ length: 16 }, (_, i) => {
        const a = (i / 16) * Math.PI * 2;
        return <line key={i} x1={x} y1={y} x2={x + Math.cos(a) * 1200} y2={y + Math.sin(a) * 1200} />;
      })}
    </g>
  );
}

function Cartouche() {
  return (
    <g className="ci-cartouche" transform="translate(64 64)" aria-hidden="true">
      <text className="title">The Copilot Isles</text>
      <text className="sub" y="22">
        Eight islands · one course
      </text>
      <path d="M0 34h196" />
    </g>
  );
}

function LockGlyph() {
  return (
    <g className="ci-arch-lock" transform="translate(19 5)">
      <circle r="8.5" />
      <path d="M-3.4 -0.6v-2a3.4 3.4 0 0 1 6.8 0v2" />
      <rect x="-4.6" y="-0.8" width="9.2" height="6.4" rx="1.4" />
    </g>
  );
}

function Pennant({ x, y }: { x: number; y: number }) {
  return (
    <g className="ci-arch-pennant" transform={`translate(${x} ${y})`}>
      <line x1="0" y1="0" x2="0" y2="-30" />
      <path d="M0 -30l20 6-20 7z" />
    </g>
  );
}

function statusLabel(status: ChartIsland['status']): string {
  return status === 'current' ? 'You’re here' : status === 'visited' ? 'Charted' : 'Locked';
}

export { statusLabel };

// ---------------------------------------------------------------------------------------------
// Island art. Each island is drawn in local coordinates around (0, 0): shoal, beach, land, relief
// contours, then its own features and landmark. Shapes are seeded so they never change.

interface IslandArt {
  rx: number;
  ry: number;
  draw(): ReactNode;
}

const SAND = '#e9d49b';

function Base({
  d,
  land,
  beach = SAND,
  contours = 2,
}: {
  d: string;
  land: string;
  beach?: string;
  contours?: number;
}) {
  return (
    <>
      <path d={d} className="shoal" transform="scale(1.34)" />
      <path d={d} className="beach" transform="scale(1.1)" fill={beach} />
      <path d={d} className="land" fill={land} />
      {Array.from({ length: contours }, (_, i) => (
        <path key={i} d={d} className="contour" transform={`scale(${0.66 - i * 0.24})`} />
      ))}
    </>
  );
}

const ART: Record<string, IslandArt> = {
  anchorage: {
    rx: 58,
    ry: 38,
    draw() {
      const d = blob(11, 58, 38, 0.16);
      return (
        <>
          <Base d={d} land="#79a257" />
          <ellipse className="lagoon" cx="10" cy="17" rx="27" ry="14" />
          <path className="reef" d="M-20 34 Q10 52 40 32" />
          <Palm x={-8} y={-14} />
          <Palm x={20} y={-6} s={0.85} />
          <g transform="translate(-36 -6)" className="ink">
            <path className="fill-light" d="M-4 8L-2.6 -12H2.6L4 8Z" />
            <path d="M-4 8L-2.6 -12H2.6L4 8ZM-3.4 -2H3.4M-3 3H3" />
            <path className="fill-dark" d="M-3.6 -12h7.2l-1.2 -5h-4.8z" />
            <path className="rays" d="M5 -15l9 -4M5 -13l10 1M-5 -15l-9 -4M-5 -13l-10 1" />
          </g>
        </>
      );
    },
  },
  meridian: {
    rx: 54,
    ry: 40,
    draw() {
      const d = blob(23, 54, 40, 0.14);
      return (
        <>
          <Base d={d} land="#a3a25c" contours={3} />
          <path className="wall" d="M-34 30 Q0 46 32 28" />
          <g transform="translate(0 -4)" className="ink">
            <path className="fill-stone" d="M-18 10V-6H-10V-12H-4V-6H4V-12H10V-6H18V10Z" />
            <path d="M-18 10V-6H-10V-12H-4V-6H4V-12H10V-6H18V10Z" />
            <path className="fill-roof" d="M-12 -12L-7 -20L-2 -12ZM2 -12L7 -20L12 -12Z" />
            <path className="fill-stone" d="M-4 -6V-22H4V-6Z" />
            <path d="M-4 -6V-22H4V-6Z" />
            <path className="fill-roof" d="M-6 -22L0 -31L6 -22Z" />
            <path d="M-2 10V3a2 2 0 0 1 4 0V10" />
          </g>
        </>
      );
    },
  },
  'thousand-bough': {
    rx: 60,
    ry: 44,
    draw() {
      const d = blob(37, 60, 44, 0.26, 20);
      return (
        <>
          <Base d={d} land="#4b7a44" />
          <path className="river" d="M22 -18 C14 -4 26 8 16 22 S8 36 12 44" />
          <g transform="translate(-4 -2)" className="ink">
            <path
              className="fill-canopy"
              d="M-22 -8a10 10 0 0 1 8-14a12 12 0 0 1 20-4a11 11 0 0 1 16 8a9 9 0 0 1-4 14h-36a8 8 0 0 1-4-4z"
            />
            <path d="M-22 -8a10 10 0 0 1 8-14a12 12 0 0 1 20-4a11 11 0 0 1 16 8a9 9 0 0 1-4 14h-36a8 8 0 0 1-4-4z" />
            <path d="M-2 -4V16M3 -4V16M-10 -3L-12 14M13 -3L15 14M-6 -3L-7 14" />
            <path className="fill-wood" d="M-9 2h18v5h-18z" />
          </g>
        </>
      );
    },
  },
  keelhaven: {
    rx: 54,
    ry: 38,
    draw() {
      const d = blob(41, 54, 38, 0.15);
      return (
        <>
          <Base d={d} land="#8d8458" />
          <path className="harbour" d="M-6 40 C-10 22 -2 10 8 8 C18 10 22 24 16 40 Z" />
          <path className="pier" d="M4 12v18M12 14v16" />
          <g transform="translate(-26 -10)" className="ink">
            <circle className="fill-wood" r="11" />
            <circle r="11" />
            <circle r="4.5" />
            {Array.from({ length: 8 }, (_, i) => {
              const a = (i / 8) * Math.PI * 2;
              return (
                <line
                  key={i}
                  x1={Math.cos(a) * 4.5}
                  y1={Math.sin(a) * 4.5}
                  x2={Math.cos(a) * 16}
                  y2={Math.sin(a) * 16}
                />
              );
            })}
          </g>
          <g transform="translate(28 -14)" className="ink">
            <path className="fill-roof" d="M-10 4L0 -6L10 4Z" />
            <path className="fill-stone" d="M-8 4h16v8h-16z" />
            <path d="M-10 4L0 -6L10 4ZM-8 4h16v8h-16z" />
          </g>
        </>
      );
    },
  },
  guildcrest: {
    rx: 64,
    ry: 34,
    draw() {
      const d = blob(53, 64, 34, 0.18, 16);
      return (
        <>
          <Base d={d} land="#6f8a64" contours={1} />
          <g transform="translate(-10 0)" className="ink">
            <path className="fill-rock" d="M-34 12L-18 -16L-6 4L6 -22L24 12Z" />
            <path d="M-34 12L-18 -16L-6 4L6 -22L24 12Z" />
            <path className="fill-snow" d="M-22 -9L-18 -16L-14 -9L-18 -11ZM1 -13L6 -22L11 -13L6 -15Z" />
          </g>
          <g transform="translate(36 -2)" className="ink">
            <path className="fill-stone" d="M-4 12L-3 -6H3L4 12Z" />
            <path d="M-4 12L-3 -6H3L4 12Z" />
            <path d="M0 -6L-10 -16M0 -6L10 -16M0 -6L-10 4M0 -6L10 4" />
            <path
              className="fill-light"
              d="M-10 -16l3 -1 4 5-3 1zM10 -16l-3 -1-4 5 3 1zM-10 4l3 1 4-5-3-1zM10 4l-3 1-4-5 3-1z"
            />
          </g>
          <Pine x={-44} y={2} />
          <Pine x={-38} y={10} s={0.8} />
          <Pine x={18} y={14} s={0.85} />
        </>
      );
    },
  },
  sunspire: {
    rx: 58,
    ry: 40,
    draw() {
      const d = blob(67, 58, 40, 0.15);
      return (
        <>
          <Base d={d} land="#d9b46a" beach="#efdcaa" contours={1} />
          <ellipse className="oasis" cx="18" cy="16" rx="9" ry="5" />
          <Palm x={24} y={10} s={0.7} />
          <g className="ink">
            <path className="fill-mesa" d="M-40 8L-34 -8H-18L-12 8Z" />
            <path d="M-40 8L-34 -8H-18L-12 8ZM-36 -2H-16" />
            <path className="fill-mesa" d="M-10 4L-6 -14H8L12 4Z" />
            <path d="M-10 4L-6 -14H8L12 4ZM-8 -6H10" />
          </g>
          <g transform="translate(34 -8)" className="ink">
            <path
              className="fill-cactus"
              d="M-2.5 14V-10a2.5 2.5 0 0 1 5 0V14ZM2.5 0h4V-6a2 2 0 0 1 4 0V3a2 2 0 0 1-2 2h-6ZM-2.5 4h-4a2 2 0 0 1-2-2V-3a2 2 0 0 1 4 0V1h2Z"
            />
            <path d="M-2.5 14V-10a2.5 2.5 0 0 1 5 0V14ZM2.5 0h4V-6a2 2 0 0 1 4 0V3a2 2 0 0 1-2 2h-6ZM-2.5 4h-4a2 2 0 0 1-2-2V-3a2 2 0 0 1 4 0V1h2Z" />
          </g>
        </>
      );
    },
  },
  inkwell: {
    rx: 56,
    ry: 36,
    draw() {
      const d = blob(79, 56, 36, 0.13);
      return (
        <>
          <path d={d} className="shoal" transform="scale(1.34)" />
          <path d={d} className="cliff" transform="translate(0 9)" />
          <path d={d} className="cliff-lines" transform="translate(0 9)" />
          <path d={d} className="land" fill="#93ad69" />
          <path d={d} className="contour" transform="scale(0.62)" />
          <g transform="translate(-6 -2)" className="ink">
            <path className="fill-dark" d="M-14 14h14l-2 -10h-10z" />
            <path d="M-14 14h14l-2 -10h-10zM-13 4h12" />
            <path className="fill-light" d="M-6 4C2 -10 14 -22 24 -26C18 -16 8 -6 -4 6Z" />
            <path d="M-6 4C2 -10 14 -22 24 -26C18 -16 8 -6 -4 6ZM-5 5L16 -18" />
          </g>
          <circle className="bloom" cx="26" cy="6" r="4" />
          <circle className="bloom" cx="32" cy="12" r="3" />
          <circle className="bloom" cx="-30" cy="10" r="3.5" />
        </>
      );
    },
  },
  tidewheel: {
    rx: 52,
    ry: 44,
    draw() {
      const d = blob(97, 52, 44, 0.12);
      return (
        <>
          <Base d={d} land="#5c554e" beach="#3e3a37" contours={1} />
          <circle className="crater-rim" cx="-6" cy="2" r="24" />
          <circle className="crater" cx="-6" cy="2" r="17" />
          <path className="steam" d="M-10 -8c-4-6 4-8 0-14M-2 -6c-4-6 4-8 0-14" />
          <g transform="translate(30 -18)" className="ink">
            <path className="fill-brass" d={gear(10, 7, 8)} />
            <path d={gear(10, 7, 8)} />
            <circle r="3" />
          </g>
        </>
      );
    },
  },
};

function Palm({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return (
    <g className="ink palm" transform={`translate(${x} ${y}) scale(${s})`}>
      <path d="M0 10C1 4 2 -2 1 -7" />
      <path
        className="fill-canopy"
        d="M1 -7c-4-3-9-2-11 1c4-1 8 0 11 -1zM1 -7c4-3 9-2 11 1c-4-1-8 0-11-1zM1 -7c-2-4-1-8 2-10c-1 3-1 7-2 10zM1 -7c3-3 7-4 9-2c-3 0-6 1-9 2z"
      />
    </g>
  );
}

function Pine({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return (
    <g className="ink" transform={`translate(${x} ${y}) scale(${s})`}>
      <path className="fill-pine" d="M0 -12L6 0H3L8 8H-8L-3 0H-6Z" />
      <path d="M0 -12L6 0H3L8 8H-8L-3 0H-6ZM0 8V11" />
    </g>
  );
}

function gear(outer: number, inner: number, teeth: number): string {
  const pts: string[] = [];
  for (let i = 0; i < teeth * 2; i++) {
    const a0 = (i / (teeth * 2)) * Math.PI * 2;
    const a1 = ((i + 1) / (teeth * 2)) * Math.PI * 2;
    const r = i % 2 === 0 ? outer : inner;
    pts.push(`${Math.cos(a0) * r} ${Math.sin(a0) * r}`, `${Math.cos(a1) * r} ${Math.sin(a1) * r}`);
  }
  return `M${pts.join('L')}Z`;
}

// ---------------------------------------------------------------------------------------------
// Curves.

function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A smooth, seeded, organic closed outline around (0, 0). */
export function blob(seed: number, rx: number, ry: number, wobble: number, n = 14): string {
  const r = mulberry32(seed);
  const pts: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + (r() - 0.5) * 0.25;
    const k = 1 + (r() - 0.5) * 2 * wobble;
    pts.push([Math.cos(a) * rx * k, Math.sin(a) * ry * k]);
  }
  return closedCurve(pts);
}

const f = (v: number) => Math.round(v * 10) / 10;

function closedCurve(p: readonly [number, number][]): string {
  const n = p.length;
  let d = `M${f(p[0]![0])} ${f(p[0]![1])}`;
  for (let i = 0; i < n; i++) {
    const p0 = p[(i - 1 + n) % n]!;
    const p1 = p[i]!;
    const p2 = p[(i + 1) % n]!;
    const p3 = p[(i + 2) % n]!;
    d += `C${f(p1[0] + (p2[0] - p0[0]) / 6)} ${f(p1[1] + (p2[1] - p0[1]) / 6)} ${f(p2[0] - (p3[0] - p1[0]) / 6)} ${f(p2[1] - (p3[1] - p1[1]) / 6)} ${f(p2[0])} ${f(p2[1])}`;
  }
  return `${d}Z`;
}

/** A smooth open curve through the points (Catmull-Rom), for the voyage route. */
export function openCurve(p: readonly [number, number][]): string {
  if (p.length < 2) return '';
  let d = `M${f(p[0]![0])} ${f(p[0]![1])}`;
  for (let i = 0; i < p.length - 1; i++) {
    const p0 = p[Math.max(0, i - 1)]!;
    const p1 = p[i]!;
    const p2 = p[i + 1]!;
    const p3 = p[Math.min(p.length - 1, i + 2)]!;
    d += `C${f(p1[0] + (p2[0] - p0[0]) / 6)} ${f(p1[1] + (p2[1] - p0[1]) / 6)} ${f(p2[0] - (p3[0] - p1[0]) / 6)} ${f(p2[1] - (p3[1] - p1[1]) / 6)} ${f(p2[0])} ${f(p2[1])}`;
  }
  return d;
}
