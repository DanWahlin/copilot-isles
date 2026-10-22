import { Fn, float, sin, vec2 } from 'three/tsl';
import type { Node } from 'three/webgpu';
import { GUST } from './wind';
import { world } from './uniforms';

type N = Node<'float'> | ReturnType<typeof float>;

/**
 * GPU side of the shared wind field (mirrors `gustAt` in wind.ts). Materials call
 * `gustNode(worldXZ)` for a 1 ± `world.gust` factor (0.55-1.45 in a Breeze) and use `world.windDir`
 * for direction.
 */
export const gustNode = Fn(([xz]: [ReturnType<typeof vec2>]) => {
  const dir = world.windDir;
  const along = xz.x.mul(dir.x).add(xz.y.mul(dir.y));
  const phase = along
    .sub(world.time.mul(GUST.speed))
    .div(GUST.wavelength)
    .mul(Math.PI * 2);
  const cross = xz.x.mul(dir.y.negate()).add(xz.y.mul(dir.x)).mul(0.013);
  const slow = sin(world.time.mul(0.21).add(cross)).mul(0.3).add(0.7);
  return float(1).add(sin(phase).mul(world.gust).mul(slow));
}) as unknown as (xz: ReturnType<typeof vec2>) => N;
