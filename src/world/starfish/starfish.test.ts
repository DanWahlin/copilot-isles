import { describe, expect, it } from 'vitest';
import { LearnStore } from '../../learn/store';
import { Progress, parseProgress, type ProgressStorage } from '../../learn/progress';
import { STARFISH, STARFISH_REWARD, STARFISH_SET_REWARD, starfishCount, starfishOn } from './spots';

class MemStorage implements ProgressStorage {
  private readonly m = new Map<string, string>();
  getItem(k: string): string | null {
    return this.m.get(k) ?? null;
  }
  setItem(k: string, v: string): void {
    this.m.set(k, v);
  }
  removeItem(k: string): void {
    this.m.delete(k);
  }
}

describe('starfish', () => {
  it('hides a set on each island with unique ids', () => {
    expect(new Set(STARFISH.map((s) => s.id)).size).toBe(STARFISH.length);
    expect(starfishOn('anchorage').length).toBe(7);
    expect(starfishOn('meridian').length).toBe(5);
    expect(starfishOn('anchorage').some((s) => s.id === 'sf.a.lighthouse')).toBe(true);
  });

  it('saves what you found, pays for each, and pays a bonus for an island’s last', () => {
    const storage = new MemStorage();
    const learn = new LearnStore(new Progress(storage));
    const anchorage = starfishOn('anchorage');
    let paid = 0;
    for (const [i, s] of anchorage.entries()) {
      const got = learn.collectStarfish(s.id, 'anchorage')!;
      expect(got.found).toBe(i + 1);
      expect(got.total).toBe(anchorage.length);
      expect(got.complete).toBe(i === anchorage.length - 1);
      paid += got.earned;
    }
    expect(paid).toBe(anchorage.length * STARFISH_REWARD + STARFISH_SET_REWARD);
    expect(learn.getState().doubloons).toBe(paid);
    expect(learn.collectStarfish(anchorage[0]!.id, 'anchorage')).toBeNull();
    // It survives a reload, and an old save without starfish loads with none.
    const again = new Progress(storage);
    expect(starfishCount('anchorage', again.data.starfish)).toEqual({ found: 7, total: 7 });
    expect(parseProgress(JSON.stringify({ v: 1, pages: [] })).starfish).toEqual([]);
    learn.newGame();
    expect(learn.getState().starfish).toEqual([]);
  });

  it('shows the counter only for the island you’re on', () => {
    const learn = new LearnStore(new Progress(new MemStorage()));
    expect(learn.getState().starfishIsland).toBeNull();
    learn.setStarfishIsland({ id: 'meridian', name: 'Port Meridian' });
    expect(learn.getState().starfishIsland?.id).toBe('meridian');
    learn.setStarfishIsland(null);
    expect(learn.getState().starfishIsland).toBeNull();
  });
});
