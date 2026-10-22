import { describe, expect, it } from 'vitest';
import {
  CanvasTexture,
  DataTexture,
  LinearMipmapLinearFilter,
  Mesh,
  MeshStandardMaterial,
  MeshStandardNodeMaterial,
  NearestFilter,
  NodeFrame,
  PlaneGeometry,
  SRGBColorSpace,
  type Material,
  type NodeBuilder,
  type Texture,
} from 'three/webgpu';
import { diffuseColor, materialReference, vec4 } from 'three/tsl';
import { palettedMaterial, stagedMaterial } from '../world/characters/stage-light';
import { meshNodeBuilder, type MeshNodeBuilder } from '../world/vegetation/wgsl-test-helpers';
import { releaseTextureStandIns, textureStandIn } from './texture-stand-in';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyNode = any;

/** A sign atlas (filtered, sRGB) or an NPC palette (32 × 32, nearest), as the game makes them. */
function atlas(): Texture {
  const t = new CanvasTexture({ width: 4, height: 4 } as never);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
function palette(): Texture {
  const t = new DataTexture(new Uint8Array(32 * 32 * 4).fill(180), 32, 32);
  t.colorSpace = SRGBColorSpace;
  t.minFilter = NearestFilter;
  t.magFilter = NearestFilter;
  t.needsUpdate = true;
  return t;
}

const signMaterial = (map: Texture) =>
  palettedMaterial(new MeshStandardNodeMaterial({ map, roughness: 0.85, metalness: 0 }));

function built(material: Material): MeshNodeBuilder {
  const builder = meshNodeBuilder(new Mesh(new PlaneGeometry(), material), material);
  builder.build();
  return builder;
}

/** The textures a look's bindings start from: what every new render object of the look uploads. */
function boundTextures(builder: MeshNodeBuilder): Texture[] {
  return builder
    .getBindings()
    .flatMap((group) => group.bindings)
    .filter((b) => b.isSampledTexture)
    .map((b) => b.texture as Texture);
}

/** A draw of `material` with the look `builder` built: three updates its nodes for that object. */
function draw(builder: MeshNodeBuilder, material: Material): void {
  const frame = new NodeFrame() as NodeFrame & { material: unknown; object: unknown };
  frame.material = material;
  frame.object = new Mesh(new PlaneGeometry(), material);
  for (const node of builder.updateNodes) frame.updateNode(node as never);
}

/** The palette path as it was, through three's own material reference (the control). */
class ReferencePalette extends MeshStandardNodeMaterial {
  paletteMap: Texture | null = null;
  override setupDiffuseColor(builder: NodeBuilder): void {
    super.setupDiffuseColor(builder);
    const p = materialReference('paletteMap', 'texture') as AnyNode;
    const d = diffuseColor as AnyNode;
    d.assign(vec4(d.rgb.mul(p.rgb), d.a));
  }
}
function referenceSign(map: Texture): ReferencePalette {
  const m = new ReferencePalette({ roughness: 0.85, metalness: 0 });
  m.paletteMap = map;
  return m;
}

describe('materialTexture (issue 265)', () => {
  it('three binds the first material’s texture in its look (why the stand-in exists)', () => {
    const first = atlas();
    // If this stops holding (a three upgrade), the stale upload is gone at its source.
    expect(boundTextures(built(referenceSign(first)))).toContain(first);
  });

  it('keeps every paletted look’s textures out of its bindings', () => {
    for (const [make, tex] of [
      [signMaterial, atlas()],
      [signMaterial, palette()],
      [(t: Texture) => stagedMaterial(new MeshStandardMaterial({ map: t })), palette()],
    ] as const) {
      const bound = boundTextures(built(make(tex)));
      expect(bound).not.toContain(tex);
      expect(bound).toContain(textureStandIn(tex));
    }
  });

  it('can’t give a later object of the look a texture its first material freed', () => {
    const first = atlas();
    const firstMaterial = signMaterial(first);
    const look = built(firstMaterial);
    draw(look, firstMaterial);
    first.dispose();
    // A later object of the look (Thousand-Bough's signs after Anchorage's atlas was freed) starts
    // from the look's bindings, then reads its own atlas.
    const later = atlas();
    const laterMaterial = signMaterial(later);
    expect(boundTextures(look)).not.toContain(first);
    draw(look, laterMaterial);
    const read = (look.updateNodes as AnyNode[])
      .map((n) => n.node?.value as Texture | undefined)
      .filter((t) => t?.isTexture);
    expect(read).toContain(later);
    expect(read).not.toContain(first);
  });

  it('builds the shader the material’s own texture builds (no new programs)', () => {
    for (const tex of [atlas(), palette()]) {
      const mine = built(signMaterial(tex));
      const theirs = built(referenceSign(tex));
      expect(mine.fragmentShader).toBe(theirs.fragmentShader);
      expect(mine.vertexShader).toBe(theirs.vertexShader);
    }
    // Nearest palettes are still loaded texel by texel, atlases still filtered.
    expect(built(signMaterial(palette())).fragmentShader).toMatch(/textureLoad\(/);
    expect(built(signMaterial(atlas())).fragmentShader).toMatch(/textureSample\(/);
  });

  it('shares a stand-in between alike textures, matches what the shader depends on', () => {
    const a = atlas();
    const b = atlas();
    a.minFilter = b.minFilter = LinearMipmapLinearFilter;
    const s = textureStandIn(a);
    expect(textureStandIn(b)).toBe(s);
    expect(textureStandIn(palette())).not.toBe(s);
    expect([s.format, s.type, s.colorSpace, s.minFilter, s.magFilter, s.wrapS, s.wrapT]).toEqual([
      a.format,
      a.type,
      a.colorSpace,
      a.minFilter,
      a.magFilter,
      a.wrapS,
      a.wrapT,
    ]);
  });

  it('frees the stand-ins’ GPU copies with the voyage', () => {
    const s = textureStandIn(palette());
    let freed = 0;
    s.addEventListener('dispose', () => freed++);
    releaseTextureStandIns();
    expect(freed).toBe(1);
  });
});
