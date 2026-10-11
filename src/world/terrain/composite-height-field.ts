import type { HeightField } from '../contracts';

export interface HeightFieldBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

interface Layer {
  bounds: HeightFieldBounds;
  field: HeightField;
}

export class CompositeHeightField implements HeightField {
  private readonly layers: Layer[] = [];
  private shapes: CompositeHeightField | null = null;

  constructor(private readonly fallbackHeight = -52) {}

  /** The layers' ground before their recesses (`HeightField.shapeField`), once any layer has one. */
  get shapeField(): HeightField | undefined {
    return this.shapes ?? undefined;
  }

  add(bounds: HeightFieldBounds, field: HeightField): void {
    this.layers.push({ bounds, field });
    if (!this.shapes && field.shapeField) {
      this.shapes = new CompositeHeightField(this.fallbackHeight);
      for (const layer of this.layers.slice(0, -1)) this.shapes.add(layer.bounds, layer.field);
    }
    this.shapes?.add(bounds, field.shapeField ?? field);
  }

  heightAt(x: number, z: number): number {
    return this.pick(x, z)?.heightAt(x, z) ?? this.fallbackHeight;
  }

  normalAt(x: number, z: number, out: Float32Array | number[]): Float32Array | number[] {
    const field = this.pick(x, z);
    if (field) return field.normalAt(x, z, out);
    out[0] = 0;
    out[1] = 1;
    out[2] = 0;
    return out;
  }

  masksAt(x: number, z: number): { sand: number; grass: number; rock: number; cliff: number } {
    return this.pick(x, z)?.masksAt(x, z) ?? { sand: 0, grass: 0, rock: 1, cliff: 0 };
  }

  private pick(x: number, z: number): HeightField | null {
    for (let i = this.layers.length - 1; i >= 0; i--) {
      const layer = this.layers[i];
      if (
        x >= layer.bounds.minX &&
        x <= layer.bounds.maxX &&
        z >= layer.bounds.minZ &&
        z <= layer.bounds.maxZ
      )
        return layer.field;
    }
    return null;
  }
}
