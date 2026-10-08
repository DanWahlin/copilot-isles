import { describe, expect, it } from 'vitest';
import { COVE } from '../../layout';
import { coveHeight } from '../../terrain/cove-height';
import { ANCHORAGE_FISHING_BOATS } from './life';

describe("Anchorage's fishing boats", () => {
  it('lie in deep water outside the harbour basin, clear of the ship lane out of it', () => {
    for (const b of ANCHORAGE_FISHING_BOATS) {
      expect(coveHeight(b.x, b.z)).toBeLessThan(-8);
      expect(Math.hypot(b.x - COVE.harbor.center.x, b.z - COVE.harbor.center.z)).toBeGreaterThan(
        COVE.harbor.radius,
      );
      // The ship leaves the mooring northward along the pier's line; the boat sits well east of it.
      expect(b.x - COVE.mooring.x).toBeGreaterThan(18);
    }
  });
});
