import {
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Matrix4,
  Mesh,
  MeshStandardNodeMaterial,
  Object3D,
  SRGBColorSpace,
} from 'three/webgpu';
import { shown } from './proxies';
import { mergeWithRigidParts, type RigidParts } from './rigid-parts';
import { palettedMaterial } from '../characters/stage-light';

export interface SignStyle {
  /** Letter height as a fraction of the canvas width (it shrinks until the lines fit). */
  size?: number;
  /** 'board' is painted timber with a dark frame; 'cloth' is a cream canvas banner. */
  look?: 'board' | 'cloth';
  /** Per-line colours (defaults to cream on board, ink on cloth). */
  colors?: readonly (string | undefined)[];
  /**
   * 'list': the first line is a centred title and the rest are a left-aligned list (bullets in one
   * column), the block centred on the board. Default: every line centred.
   */
  layout?: 'centered' | 'list';
  /** Paints the board's face this colour (a crew's painted board) instead of bare timber or cream canvas. */
  fill?: string;
  /** Per-line letter size (× `size`), e.g. a big icon over a name. */
  scales?: readonly (number | undefined)[];
}

const FONT = (sz: number) => `600 ${sz}px Georgia, 'Times New Roman', serif`;

/** Paints `lines` into a `px` × `ch` region at the context's origin as a timber board or a canvas banner, with lettering that fits. */
function paintSign(
  ctx: CanvasRenderingContext2D,
  px: number,
  ch: number,
  lines: readonly string[],
  o: SignStyle = {},
): void {
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
  if (o.fill) {
    // Paint over the timber or canvas, a little darker toward the foot.
    ctx.fillStyle = o.fill;
    ctx.fillRect(0, 0, px, ch);
    const shade = ctx.createLinearGradient(0, 0, 0, ch);
    shade.addColorStop(0, 'rgba(255, 255, 255, 0.08)');
    shade.addColorStop(1, 'rgba(0, 0, 0, 0.22)');
    ctx.fillStyle = shade;
    ctx.fillRect(0, 0, px, ch);
  }
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
  const scale = (k: number) => o.scales?.[k] ?? 1;
  const font = (k: number) => FONT(Math.round(size * scale(k)));
  const widest = () =>
    Math.max(
      ...lines.map((l, k) => {
        ctx.font = font(k);
        return ctx.measureText(l).width;
      }),
    );
  const tall = () => lines.reduce((h, _, k) => h + size * scale(k) * 1.18, 0);
  while (size > 10 && (widest() > px * 0.88 || tall() > ch * 0.84)) size -= 2;
  ctx.font = FONT(size);
  ctx.textBaseline = 'middle';
  const list = o.layout === 'list' && lines.length > 1;
  // A list's items share one left edge: the widest item, centred on the board.
  const itemsLeft = list ? (px - Math.max(...lines.slice(1).map((l) => ctx.measureText(l).width))) / 2 : 0;
  let y = ch / 2 - tall() / 2;
  lines.forEach((line, k) => {
    const lh = size * scale(k) * 1.18;
    const mid = y + lh / 2;
    y += lh;
    ctx.font = font(k);
    const left = list && k > 0;
    ctx.textAlign = left ? 'left' : 'center';
    const x = left ? itemsLeft : px / 2;
    ctx.fillStyle = cloth ? 'rgba(255, 250, 235, 0.5)' : 'rgba(255, 236, 200, 0.35)';
    ctx.fillText(line, x, mid + 3);
    ctx.fillStyle = o.colors?.[k] ?? (cloth ? '#3b2616' : '#f3e3c2');
    ctx.fillText(line, x, mid);
  });
}

export interface PaintedSign {
  /** Position, turn, scale and show or hide the sign through this; its set draws it. */
  readonly object: Object3D;
  /** Repaints the board (its set uploads the atlas again). */
  redraw(lines: readonly string[], style?: SignStyle): void;
}

export interface SignOptions extends SignStyle {
  /** The same lettering on the back, readable from both sides. */
  twoSided?: boolean;
  /** Moves the board down (negative) or up from `object`'s origin, in metres (a hanging sign). */
  offsetY?: number;
}

/** Each board is painted at this width in pixels (its height keeps the board's aspect). */
const SIGN_PX = 1024;
/** Edge pixels repeat this far round each board, so filtering and the first mips don't bleed. */
const GUTTER = 8;
/** WebGPU's default `maxTextureDimension2D`. */
const MAX_ATLAS = 8192;

interface SignEntry {
  readonly object: Object3D;
  readonly w: number;
  readonly h: number;
  readonly offsetY: number;
  readonly twoSided: boolean;
  readonly pw: number;
  readonly ph: number;
  lines: readonly string[];
  style: SignStyle;
  /** Top-left of the board in the atlas, in pixels. */
  x: number;
  y: number;
}

const inverse = new Matrix4();
const place = new Matrix4();
const HIDDEN = new Matrix4().makeScale(0, 0, 0);

/**
 * Painted boards with carved-looking serif text that share one canvas atlas, one material, and one
 * draw. Add the signs, place their `object`s, then call `finalize()` once and add the returned mesh
 * to the scene; `update()` every frame copies each sign's place (and whether it's shown) into the
 * mesh. Each board is a quad in one merged geometry with its atlas rectangle baked into its uvs
 * (a two-sided board is two quads, back to back). A board that moves rewrites only its own four or
 * eight vertices on the CPU, so the set uses the plain `map` material the separate signs used: no
 * new shader or pipeline.
 */
export class SignSet {
  private readonly entries: SignEntry[] = [];
  private canvas: HTMLCanvasElement | null = null;
  private atlas: CanvasTexture | null = null;
  private material: MeshStandardNodeMaterial | null = null;
  private merged: Mesh | null = null;
  private parts: RigidParts | null = null;
  /** The last place written for each board (16 floats each), so `update()` skips boards that didn't move. */
  private placed: Float32Array | null = null;

  constructor(private readonly name: string) {}

  /** The merged mesh (null until `finalize()`). */
  get mesh(): Mesh | null {
    return this.merged;
  }

  get count(): number {
    return this.entries.length;
  }

  add(lines: readonly string[], w: number, h: number, o: SignOptions = {}): PaintedSign {
    if (this.merged) throw new Error(`SignSet ${this.name}: add() after finalize()`);
    const { twoSided = false, offsetY = 0, ...style } = o;
    const object = new Object3D();
    object.name = `sign: ${lines[0]}`;
    const entry: SignEntry = {
      object,
      w,
      h,
      offsetY,
      twoSided,
      pw: SIGN_PX,
      ph: Math.round((SIGN_PX * h) / w),
      lines,
      style,
      x: 0,
      y: 0,
    };
    this.entries.push(entry);
    return {
      object,
      redraw: (next, s) => {
        if (s) entry.style = { ...entry.style, ...s };
        entry.lines = next;
        object.name = `sign: ${next[0]}`;
        if (this.canvas && this.atlas) {
          this.paint(entry);
          this.atlas.needsUpdate = true;
        }
      },
    };
  }

  /** Packs and paints the atlas and builds the one merged mesh. */
  finalize(): Mesh {
    if (this.merged) return this.merged;
    // Boards stack down a column; a set too tall for one starts another beside it.
    const column = SIGN_PX + GUTTER * 2;
    let columns = 1;
    let y = 0;
    let height = 1;
    for (const e of this.entries) {
      const h = e.ph + GUTTER * 2;
      if (y > 0 && y + h > MAX_ATLAS) {
        columns++;
        y = 0;
      }
      e.x = (columns - 1) * column + GUTTER;
      e.y = y + GUTTER;
      y += h;
      height = Math.max(height, y);
    }
    const width = columns * column;
    if (height > MAX_ATLAS || width > MAX_ATLAS)
      throw new Error(`SignSet ${this.name}: atlas ${width} × ${height} px is too big`);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    this.canvas = canvas;
    for (const e of this.entries) this.paint(e);
    const atlas = new CanvasTexture(canvas);
    atlas.colorSpace = SRGBColorSpace;
    atlas.anisotropy = 4;
    this.atlas = atlas;

    // Canvas textures are flipY: v = 1 is the canvas top.
    const boards = this.entries.map((e) =>
      boardGeometry(e, e.x / width, 1 - (e.y + e.ph) / height, e.pw / width, e.ph / height),
    );
    const parts = mergeWithRigidParts([], boards, { bounds: true });
    this.parts = parts;
    this.placed = new Float32Array(this.entries.length * 16).fill(Number.NaN);

    // The atlas as a palette: the same look, and the shadow shares one plain shader (PLAN §15.4).
    const material = palettedMaterial(
      new MeshStandardNodeMaterial({ map: atlas, roughness: 0.85, metalness: 0 }),
    );
    material.name = 'painted signs';
    this.material = material;

    const mesh = new Mesh(parts.geometry, material);
    mesh.name = this.name;
    mesh.castShadow = true;
    mesh.receiveShadow = false;
    this.merged = mesh;
    this.update();
    return mesh;
  }

  /** Copies each sign's place (and whether it's shown) into the mesh; uploads only on a change. */
  update(): void {
    const mesh = this.merged;
    const parts = this.parts;
    const placed = this.placed;
    if (!mesh || !parts || !placed) return;
    mesh.updateWorldMatrix(true, false);
    inverse.copy(mesh.matrixWorld).invert();
    for (let i = 0; i < this.entries.length; i++) {
      const object = this.entries[i]!.object;
      object.updateWorldMatrix(true, false);
      place.multiplyMatrices(inverse, object.matrixWorld);
      if (!shown(object, mesh.parent)) place.multiply(HIDDEN);
      const m = place.elements;
      const o = i * 16;
      let moved = false;
      for (let k = 0; k < 16; k++) {
        const v = Math.fround(m[k]!);
        if (placed[o + k] !== v) {
          placed[o + k] = v;
          moved = true;
        }
      }
      if (moved) parts.set(i, place);
    }
    parts.commit();
  }

  dispose(): void {
    this.merged?.removeFromParent();
    this.parts?.geometry.dispose();
    this.atlas?.dispose();
    this.material?.dispose();
  }

  /** Paints one board into its atlas rectangle and repeats its edges into the gutter. */
  private paint(e: SignEntry): void {
    const canvas = this.canvas!;
    const ctx = canvas.getContext('2d')!;
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.beginPath();
    ctx.rect(0, 0, e.pw, e.ph);
    ctx.clip();
    paintSign(ctx, e.pw, e.ph, e.lines, e.style);
    ctx.restore();
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    const { x, y, pw, ph } = e;
    const g = GUTTER;
    ctx.drawImage(canvas, x, y, pw, 1, x, y - g, pw, g);
    ctx.drawImage(canvas, x, y + ph - 1, pw, 1, x, y + ph, pw, g);
    ctx.drawImage(canvas, x, y - g, 1, ph + g * 2, x - g, y - g, g, ph + g * 2);
    ctx.drawImage(canvas, x + pw - 1, y - g, 1, ph + g * 2, x + pw, y - g, g, ph + g * 2);
    ctx.restore();
  }
}

/**
 * One board in its sign's frame: a `w` × `h` quad facing +z, 4 mm proud of the origin and moved by
 * `offsetY`, mapped to its atlas rectangle. A two-sided board adds a back quad facing −z, mapped
 * left to right as seen from behind.
 */
function boardGeometry(e: SignEntry, u0: number, v0: number, uw: number, vh: number): BufferGeometry {
  const x = e.w / 2,
    y0 = e.offsetY - e.h / 2,
    y1 = e.offsetY + e.h / 2,
    z = 0.004,
    u1 = u0 + uw,
    v1 = v0 + vh;
  const pos = [-x, y0, z, x, y0, z, x, y1, z, -x, y1, z];
  const nrm = [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1];
  const uvs = [u0, v0, u1, v0, u1, v1, u0, v1];
  const index = [0, 1, 2, 0, 2, 3];
  if (e.twoSided) {
    pos.push(x, y0, -z, -x, y0, -z, -x, y1, -z, x, y1, -z);
    nrm.push(0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1);
    uvs.push(u0, v0, u1, v0, u1, v1, u0, v1);
    index.push(4, 5, 6, 4, 6, 7);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('normal', new BufferAttribute(new Float32Array(nrm), 3));
  g.setAttribute('uv', new BufferAttribute(new Float32Array(uvs), 2));
  g.setIndex(index);
  return g;
}
