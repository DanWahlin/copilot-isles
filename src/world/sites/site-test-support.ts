import { MeshBasicNodeMaterial, type Material } from 'three/webgpu';
import type { HeightField } from '../contracts';
import type { VillageKit } from '../village/kit';

/** Test-only helpers for building puzzle sites in Node: a canvas stub, a stand-in kit, flat ground. */

class NullCanvasContext {
  fillStyle: unknown = '#000';
  strokeStyle: unknown = '#000';
  font = '';
  textAlign: CanvasTextAlign = 'start';
  textBaseline: CanvasTextBaseline = 'alphabetic';
  lineWidth = 1;
  lineCap: CanvasLineCap = 'butt';
  globalAlpha = 1;
  shadowColor = 'transparent';
  shadowBlur = 0;
  imageSmoothingEnabled = true;

  beginPath(): void {}
  rect(): void {}
  clip(): void {}
  drawImage(): void {}
  moveTo(): void {}
  lineTo(): void {}
  bezierCurveTo(): void {}
  quadraticCurveTo(): void {}
  closePath(): void {}
  fill(): void {}
  stroke(): void {}
  fillRect(): void {}
  strokeRect(): void {}
  clearRect(): void {}
  fillText(): void {}
  arc(): void {}
  ellipse(): void {}
  save(): void {}
  restore(): void {}
  translate(): void {}
  rotate(): void {}
  scale(): void {}
  setLineDash(): void {}
  createLinearGradient(): CanvasGradient {
    return { addColorStop: () => undefined } as unknown as CanvasGradient;
  }
  measureText(text: string): TextMetrics {
    return { width: text.length * 32 } as TextMetrics;
  }
}

export function installCanvasStub(): void {
  const context = new NullCanvasContext();
  globalThis.document = {
    createElement(tag: string): HTMLCanvasElement {
      if (tag !== 'canvas') throw new Error(`Unexpected element in site test: ${tag}`);
      return {
        width: 0,
        height: 0,
        getContext: (kind: string) => (kind === '2d' ? context : null),
      } as HTMLCanvasElement;
    },
    createElementNS(namespace: string, tag: string): Element {
      void namespace;
      if (tag !== 'img') throw new Error(`Unexpected namespaced element in site test: ${tag}`);
      return {
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      } as unknown as Element;
    },
  } as Document;
}

const materialKeys = [
  'stone',
  'paving',
  'plaster',
  'roofTile',
  'thatch',
  'wood',
  'cloth',
  'metal',
  'rope',
  'glow',
  'halo',
] as const;

export function kit(): VillageKit {
  const materials = Object.fromEntries(
    materialKeys.map((key) => {
      const m = new MeshBasicNodeMaterial();
      m.name = `kit ${key}`;
      return [key, m];
    }),
  ) as unknown as Record<(typeof materialKeys)[number], Material>;
  return { pieces: new Map(), materials, dispose: () => undefined } as VillageKit;
}

export const flatHeight: HeightField = {
  heightAt: () => 0,
  normalAt(_x, _z, out) {
    out[0] = 0;
    out[1] = 1;
    out[2] = 0;
    return out;
  },
  masksAt: () => ({ sand: 1, grass: 0, rock: 0, cliff: 0 }),
};

export const ground = (): number => 0;
