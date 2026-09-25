import { CanvasTexture, ClampToEdgeWrapping, Material, Texture } from 'three/webgpu';
import type { CharacterBody, NpcId, SourceKey } from './types';

type Hex = number;
type Swatch = readonly [x: number, y: number];

interface PaletteSlots {
  readonly skin: Hex;
  readonly hair: Hex;
  readonly shirt: Hex;
  readonly vest: Hex;
  readonly trousers: Hex;
  readonly sash: Hex;
  readonly bandana?: Hex;
  readonly bandanaStripe?: Hex;
  readonly hat?: Hex;
}

type AtlasFamily = 'captain' | 'anne' | 'henry';

interface AtlasSwatches {
  readonly skin: readonly Swatch[];
  readonly hair: readonly Swatch[];
  readonly shirt: readonly Swatch[];
  readonly vest: readonly Swatch[];
  readonly trousers: readonly Swatch[];
  readonly sash: readonly Swatch[];
  readonly bandana: readonly Swatch[];
  readonly bandanaStripe: readonly Swatch[];
  readonly hat: readonly Swatch[];
}

export type CharacterPaletteCache = Map<string, Texture>;

const SOURCE_FAMILY: Record<SourceKey, AtlasFamily> = {
  captain: 'captain',
  anne: 'anne',
  henry: 'henry',
  captain_npc: 'captain',
  anne_npc: 'anne',
  henry_npc: 'henry',
};

/**
 * UV audit of the Quaternius Pirate Kit chibi atlas (1024²; 32 px swatches).
 * Coordinates are `(column,row)` in image space, verified from primitive UV clusters:
 * - Captain body row 7: skin 0, beard/hair 5, tricorn 1/8, shirt 4, coat 7/11, trousers 3.
 * - Anne body row 9: hair 5, skin 4, top 0, sleeve/vest 3/7, trousers/boots 2/8, belt/accent 1.
 * - Henry body row 11: skin 4, hair/shadow 5/7, head cloth 2/9, shirt 3, vest 6, trousers 8.
 */
const ATLAS_SWATCHES: Record<AtlasFamily, AtlasSwatches> = {
  captain: {
    skin: [[0, 7]],
    hair: [[5, 7]],
    shirt: [[4, 7]],
    vest: [
      [7, 7],
      [11, 7],
    ],
    trousers: [[3, 7]],
    sash: [[2, 7]],
    bandana: [],
    bandanaStripe: [],
    hat: [
      [1, 7],
      [8, 7],
    ],
  },
  anne: {
    skin: [[4, 9]],
    hair: [[5, 9]],
    shirt: [[0, 9]],
    vest: [
      [3, 9],
      [7, 9],
    ],
    trousers: [
      [2, 9],
      [8, 9],
    ],
    sash: [[1, 9]],
    bandana: [],
    bandanaStripe: [],
    hat: [],
  },
  henry: {
    skin: [[4, 11]],
    hair: [
      [5, 11],
      [7, 11],
    ],
    shirt: [[3, 11]],
    vest: [[6, 11]],
    trousers: [[8, 11]],
    sash: [
      [1, 11],
      [10, 11],
    ],
    bandana: [[2, 11]],
    bandanaStripe: [[9, 11]],
    hat: [],
  },
};

const SKIN = {
  fair: 0xd6a078,
  lightMedium: 0xc18a5c,
  olive: 0xb17852,
  weatheredMedium: 0xa66f48,
  medium: 0x9c623f,
  deep: 0x604027,
} as const;

const HAIR = {
  black: 0x17120e,
  darkBrown: 0x3a2418,
  chestnut: 0x7a3d21,
  auburn: 0x9d4729,
  blonde: 0xcaa35c,
  grey: 0xb7b3a3,
  white: 0xe5dfcf,
} as const;

const OUTFIT = {
  cream: 0xd4c1a0,
  sailcloth: 0xb7a281,
  navy: 0x202a3a,
  blue: 0x315f76,
  teal: 0x2f7777,
  green: 0x2f6e48,
  red: 0x963225,
  oxblood: 0x6e2525,
  ochre: 0xb78332,
  brown: 0x644028,
  charcoal: 0x282923,
  plum: 0x5f426f,
} as const;

export const NPC_PALETTES: Record<NpcId, PaletteSlots> = {
  nell: {
    skin: SKIN.fair,
    hair: HAIR.auburn,
    shirt: OUTFIT.cream,
    vest: OUTFIT.navy,
    trousers: OUTFIT.brown,
    sash: OUTFIT.ochre,
  },
  merchant: {
    skin: SKIN.fair,
    hair: HAIR.chestnut,
    shirt: OUTFIT.cream,
    vest: OUTFIT.blue,
    trousers: OUTFIT.brown,
    sash: OUTFIT.ochre,
    bandana: HAIR.chestnut,
    bandanaStripe: HAIR.chestnut,
  },
  dockhand_a: {
    skin: SKIN.deep,
    hair: HAIR.black,
    shirt: OUTFIT.sailcloth,
    vest: OUTFIT.teal,
    trousers: OUTFIT.blue,
    sash: OUTFIT.ochre,
    bandana: OUTFIT.red,
    bandanaStripe: OUTFIT.cream,
  },
  dockhand_b: {
    skin: SKIN.weatheredMedium,
    hair: HAIR.darkBrown,
    shirt: OUTFIT.cream,
    vest: OUTFIT.oxblood,
    trousers: OUTFIT.teal,
    sash: OUTFIT.ochre,
    bandana: HAIR.darkBrown,
    bandanaStripe: HAIR.darkBrown,
  },
  fisherman: {
    skin: SKIN.olive,
    hair: HAIR.grey,
    shirt: OUTFIT.sailcloth,
    vest: OUTFIT.brown,
    trousers: OUTFIT.teal,
    sash: OUTFIT.ochre,
    bandana: HAIR.grey,
    bandanaStripe: HAIR.grey,
  },
  old_sailor: {
    skin: SKIN.fair,
    hair: HAIR.white,
    shirt: OUTFIT.sailcloth,
    vest: OUTFIT.charcoal,
    trousers: OUTFIT.blue,
    sash: OUTFIT.oxblood,
    hat: OUTFIT.navy,
  },
  child: {
    skin: SKIN.lightMedium,
    hair: HAIR.darkBrown,
    shirt: OUTFIT.cream,
    vest: OUTFIT.teal,
    trousers: OUTFIT.brown,
    sash: OUTFIT.ochre,
    bandana: HAIR.darkBrown,
    bandanaStripe: HAIR.darkBrown,
  },
  suri: {
    skin: SKIN.deep,
    hair: HAIR.black,
    shirt: OUTFIT.cream,
    vest: OUTFIT.green,
    trousers: OUTFIT.brown,
    sash: OUTFIT.ochre,
  },
  pim: {
    skin: SKIN.lightMedium,
    hair: HAIR.chestnut,
    shirt: OUTFIT.cream,
    vest: OUTFIT.red,
    trousers: OUTFIT.teal,
    sash: OUTFIT.green,
    bandana: OUTFIT.green,
    bandanaStripe: OUTFIT.cream,
  },
  pol: {
    skin: SKIN.lightMedium,
    hair: HAIR.chestnut,
    shirt: OUTFIT.cream,
    vest: OUTFIT.green,
    trousers: OUTFIT.teal,
    sash: OUTFIT.red,
  },
  juno: {
    skin: SKIN.medium,
    hair: HAIR.black,
    shirt: OUTFIT.cream,
    vest: OUTFIT.navy,
    trousers: OUTFIT.brown,
    sash: OUTFIT.red,
  },
  lyra: {
    skin: SKIN.fair,
    hair: HAIR.blonde,
    shirt: OUTFIT.cream,
    vest: OUTFIT.plum,
    trousers: OUTFIT.brown,
    sash: OUTFIT.ochre,
  },
  lookout: {
    skin: SKIN.olive,
    hair: HAIR.darkBrown,
    shirt: OUTFIT.cream,
    vest: OUTFIT.blue,
    trousers: OUTFIT.teal,
    sash: OUTFIT.ochre,
  },
};

export function applyCharacterPalette(
  material: Material,
  body: CharacterBody,
  source: SourceKey,
  cache: CharacterPaletteCache,
): void {
  if (!hasMap(material)) return;
  const base = material.map;
  if (!base) return;
  material.map = isNpc(body)
    ? textureForNpc(body, SOURCE_FAMILY[source], base, cache)
    : textureForSource(source, base, cache);
  material.needsUpdate = true;
}

export function disposeCharacterPaletteCache(cache: CharacterPaletteCache): void {
  for (const texture of cache.values()) texture.dispose();
  cache.clear();
}

function textureForNpc(
  body: NpcId,
  family: AtlasFamily,
  base: Texture,
  cache: CharacterPaletteCache,
): Texture {
  const key = `npc:${body}`;
  const existing = cache.get(key);
  if (existing) return existing;
  const built = buildCanvasTexture(base, `npc-palette-${body}`);
  if (!built) return base;
  const { texture, ctx, cell } = built;

  const palette = NPC_PALETTES[body];
  const swatches = ATLAS_SWATCHES[family];
  paint(ctx, swatches.skin, palette.skin, cell);
  paint(ctx, swatches.hair, palette.hair, cell);
  paint(ctx, swatches.shirt, palette.shirt, cell);
  paint(ctx, swatches.vest, palette.vest, cell);
  paint(ctx, swatches.trousers, palette.trousers, cell);
  paint(ctx, swatches.sash, palette.sash, cell);
  paint(ctx, swatches.bandana, palette.bandana ?? palette.hair, cell);
  paint(ctx, swatches.bandanaStripe, palette.bandanaStripe ?? palette.bandana ?? palette.hair, cell);
  paint(ctx, swatches.hat, palette.hat ?? palette.vest, cell);

  texture.needsUpdate = true;
  cache.set(key, texture);
  return texture;
}

function textureForSource(source: SourceKey, base: Texture, cache: CharacterPaletteCache): Texture {
  const key = `source:${source}`;
  const existing = cache.get(key);
  if (existing) return existing;
  const built = buildCanvasTexture(base, `character-atlas-${source}`);
  if (!built) return base;
  cache.set(key, built.texture);
  return built.texture;
}

function buildCanvasTexture(
  base: Texture,
  name: string,
): { texture: CanvasTexture; ctx: CanvasRenderingContext2D; cell: number } | null {
  const image = base.image as CanvasImageSource | undefined;
  if (!image) return null;
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(image, 0, 0, size, size);
  const texture = new CanvasTexture(canvas);
  texture.name = name;
  texture.colorSpace = base.colorSpace;
  texture.flipY = base.flipY;
  texture.wrapS = ClampToEdgeWrapping;
  texture.wrapT = ClampToEdgeWrapping;
  texture.magFilter = base.magFilter;
  texture.minFilter = base.minFilter;
  texture.generateMipmaps = base.generateMipmaps;
  texture.userData.isCharacterVariantTexture = true;
  return { texture, ctx, cell: size / 32 };
}

function paint(ctx: CanvasRenderingContext2D, cells: readonly Swatch[], color: Hex, size: number): void {
  ctx.fillStyle = `#${color.toString(16).padStart(6, '0')}`;
  for (const [x, y] of cells) ctx.fillRect(x * size, y * size, size, size);
}

function isNpc(body: CharacterBody): body is NpcId {
  return body !== 'man' && body !== 'woman';
}

function hasMap(material: Material): material is Material & { map: Texture | null } {
  return 'map' in material;
}
