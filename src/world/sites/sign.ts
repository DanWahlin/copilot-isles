import {
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Mesh,
  MeshStandardNodeMaterial,
  PlaneGeometry,
  SRGBColorSpace,
} from 'three/webgpu';

export interface SignStyle {
  /** Letter height as a fraction of the canvas width (it shrinks until the lines fit). */
  size?: number;
  /** 'board' is painted timber with a dark frame; 'cloth' is a cream canvas banner. */
  look?: 'board' | 'cloth';
  /** Per-line colours (defaults to cream on board, ink on cloth). */
  colors?: readonly (string | undefined)[];
}

const FONT = (sz: number) => `600 ${sz}px Georgia, 'Times New Roman', serif`;

/** Paints `lines` onto `canvas` as a timber board or a canvas banner, with lettering that fits. */
function paintSign(canvas: HTMLCanvasElement, lines: readonly string[], o: SignStyle = {}): void {
  const ctx = canvas.getContext('2d')!;
  const px = canvas.width;
  const ch = canvas.height;
  const cloth = o.look === 'cloth';
  const grad = ctx.createLinearGradient(0, 0, 0, ch);
  if (cloth) {
    grad.addColorStop(0, '#f1e6cc');
    grad.addColorStop(1, '#dccaa4');
  } else {
    grad.addColorStop(0, '#9a6b43');
    grad.addColorStop(1, '#7a5031');
  }
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, px, ch);
  if (cloth) {
    // Weave and a hemmed border.
    ctx.strokeStyle = 'rgba(120, 90, 50, 0.08)';
    ctx.lineWidth = 1;
    for (let x = 0; x < px; x += 6) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, ch);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(110, 70, 30, 0.55)';
    ctx.lineWidth = 6;
    ctx.setLineDash([18, 10]);
    ctx.strokeRect(22, 22, px - 44, ch - 44);
    ctx.setLineDash([]);
  } else {
    // Plank seams and grain.
    ctx.strokeStyle = 'rgba(40, 22, 10, 0.35)';
    ctx.lineWidth = 2;
    for (let y = ch / 3; y < ch; y += ch / 3) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(px, y);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(255, 230, 190, 0.06)';
    for (let k = 0; k < 40; k++) {
      const y = (k * 37) % ch;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.bezierCurveTo(px * 0.3, y + 3, px * 0.6, y - 3, px, y + 1);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(30, 16, 6, 0.8)';
    ctx.lineWidth = 14;
    ctx.strokeRect(7, 7, px - 14, ch - 14);
  }
  // Shrink the lettering until the longest line fits inside the frame (and the lines fit the height).
  let size = Math.round(px * (o.size ?? 0.085));
  ctx.font = FONT(size);
  const widest = () => Math.max(...lines.map((l) => ctx.measureText(l).width));
  while (size > 10 && (widest() > px * 0.88 || lines.length * size * 1.18 > ch * 0.84)) {
    size -= 2;
    ctx.font = FONT(size);
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const lh = size * 1.18;
  const y0 = ch / 2 - ((lines.length - 1) * lh) / 2;
  lines.forEach((line, k) => {
    ctx.fillStyle = cloth ? 'rgba(255, 250, 235, 0.5)' : 'rgba(255, 236, 200, 0.35)';
    ctx.fillText(line, px / 2, y0 + k * lh + 3);
    ctx.fillStyle = o.colors?.[k] ?? (cloth ? '#3b2616' : '#f3e3c2');
    ctx.fillText(line, px / 2, y0 + k * lh);
  });
}

export interface PaintedSign {
  readonly mesh: Mesh;
  /** Repaints the board (cheap: one canvas upload). */
  redraw(lines: readonly string[], style?: SignStyle): void;
  dispose(): void;
}

/**
 * A painted board with carved-looking serif text (canvas texture). `twoSided` puts the same
 * lettering on the back, readable from both sides, in one draw.
 */
export function createSign(
  lines: readonly string[],
  w: number,
  h: number,
  o: SignStyle & { twoSided?: boolean } = {},
): PaintedSign {
  const px = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = px;
  canvas.height = Math.round((px * h) / w);
  let style: SignStyle = o;
  paintSign(canvas, lines, style);
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 4;
  const mat = new MeshStandardNodeMaterial({ map: tex, roughness: 0.85, metalness: 0 });
  const geo = o.twoSided ? twoSidedPlane(w, h) : new PlaneGeometry(w, h);
  const mesh = new Mesh(geo, mat);
  mesh.castShadow = true;
  mesh.name = `sign: ${lines[0]}`;
  return {
    mesh,
    redraw(next, s) {
      if (s) style = { ...style, ...s };
      paintSign(canvas, next, style);
      tex.needsUpdate = true;
      mesh.name = `sign: ${next[0]}`;
    },
    dispose() {
      geo.dispose();
      tex.dispose();
      mat.dispose();
    },
  };
}

/** A painted board (the mill's static signs). */
export function paintedSign(lines: readonly string[], w: number, h: number, o: SignStyle = {}): Mesh {
  return createSign(lines, w, h, o).mesh;
}

/** Two back-to-back quads (front faces +z, back faces −z), both mapped left-to-right. */
function twoSidedPlane(w: number, h: number): BufferGeometry {
  const x = w / 2,
    y = h / 2,
    e = 0.004;
  // prettier-ignore
  const pos = [
    -x, -y, e,  x, -y, e,  x, y, e,  -x, y, e,
    x, -y, -e,  -x, -y, -e,  -x, y, -e,  x, y, -e,
  ];
  // prettier-ignore
  const nrm = [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1];
  const uv = [0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1];
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('normal', new BufferAttribute(new Float32Array(nrm), 3));
  g.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2));
  g.setIndex([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7]);
  return g;
}
