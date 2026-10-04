import type { IslesAudio } from '../audio';
import type { SliceName } from '../audio/soundscape/bank';
import type { BattleSound } from '../world/battle/battle';

/** Past this range (m) from the listener a gun is heard as a distant roll, not a crack. */
const FAR_CANNON = 120;

/** Every one-shot a battle can play: preload them when the battle is accepted (battle-plan.md §1). */
export const BATTLE_SOUNDS: readonly SliceName[] = [
  'cannon_boom',
  'cannon_far',
  'ball_whiz',
  'timber_hit',
  'timber_creak_groan',
  'splash',
  'big_splash',
];

/**
 * Plays the battle's sounds through the soundscape (battle-plan.md §1): near guns crack and boom, far
 * guns roll, raiders' balls whistle past, hits crack timber, misses splash, a struck hull groans, and
 * the last of her goes under with a big splash. Positions are copied, since the battle reuses one.
 */
export function createBattleAudio(
  audio: IslesAudio,
  listener: { x: number; y: number; z: number },
): (kind: BattleSound, pos: { x: number; y: number; z: number }, gain: number) => void {
  const at = { x: 0, y: 0, z: 0 };
  return (kind, pos, gain) => {
    at.x = pos.x;
    at.y = pos.y;
    at.z = pos.z;
    switch (kind) {
      case 'cannon': {
        const d = Math.hypot(pos.x - listener.x, pos.z - listener.z);
        audio.sfx.oneShot(d > FAR_CANNON ? 'cannon_far' : 'cannon_boom', at, gain);
        break;
      }
      case 'whiz':
        audio.sfx.oneShot('ball_whiz', at, gain);
        break;
      case 'timber':
        audio.sfx.oneShot('timber_hit', at, gain);
        break;
      case 'splash':
        audio.sfx.oneShot('splash', at, gain * 1.6);
        break;
      case 'groan':
        audio.sfx.oneShot('timber_creak_groan', at, gain);
        break;
      case 'sink':
        audio.sfx.oneShot('big_splash', at, gain * 1.8);
        break;
    }
  };
}
