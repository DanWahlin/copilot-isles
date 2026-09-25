/** An unindexed, flat-shaded triangle soup: every vertex carries its face's normal and a part id. */
export class FlatTriangles {
  readonly positions: number[] = [];
  readonly normals: number[] = [];
  readonly parts: number[] = [];

  tri(a: number[], b: number[], c: number[], part: number): void {
    const ux = b[0] - a[0];
    const uy = b[1] - a[1];
    const uz = b[2] - a[2];
    const vx = c[0] - a[0];
    const vy = c[1] - a[1];
    const vz = c[2] - a[2];
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    for (const p of [a, b, c]) {
      this.positions.push(p[0], p[1], p[2]);
      this.normals.push(nx / l, ny / l, nz / l);
      this.parts.push(part);
    }
  }
}
