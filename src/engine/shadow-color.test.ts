import { describe, expect, it } from 'vitest';
import { MeshStandardNodeMaterial, type NodeBuilder } from 'three/webgpu';
import { color } from 'three/tsl';
import { plainShadowColor } from './shadow-color';

describe('plainShadowColor', () => {
  it('hides an opaque colour graph from the shadow pass and shows it to the material', () => {
    const m = new MeshStandardNodeMaterial();
    const look = color(0xff0000);
    m.colorNode = look;
    let seen: unknown = undefined;
    // Stand-in for three's own setup: records the graph it's given.
    m.setupDiffuseColor = function (this: MeshStandardNodeMaterial) {
      seen = this.colorNode;
    };
    expect(plainShadowColor(m)).toBe(m);
    expect(m.colorNode).toBeNull();
    m.setupDiffuseColor({} as NodeBuilder);
    expect(seen).toBe(look);
    expect(m.colorNode).toBeNull();
    // A second call changes nothing.
    plainShadowColor(m);
    m.setupDiffuseColor({} as NodeBuilder);
    expect(seen).toBe(look);
  });

  it('leaves materials whose shadow needs the alpha', () => {
    for (const opts of [{ transparent: true }, { alphaTest: 0.5 }]) {
      const m = new MeshStandardNodeMaterial(opts);
      m.colorNode = color(0x00ff00);
      plainShadowColor(m);
      expect(m.colorNode).not.toBeNull();
    }
  });
});
