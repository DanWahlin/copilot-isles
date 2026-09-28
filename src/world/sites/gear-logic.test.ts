import { describe, expect, it } from 'vitest';
import { GEAR_IDS, gearDef, gearReadout, gearTone, YOUR_HANDLE } from './gear-logic';

describe('gear check', () => {
  it('hangs one piece per course version check, in the course’s order', () => {
    expect(GEAR_IDS.map((id) => gearDef(id).command)).toEqual([
      'git --version',
      'node -v',
      'npm -v',
      'gh --version',
    ]);
  });

  it('prints a version for every check, then your own GitHub CLI sign-in', () => {
    const lines = gearReadout();
    expect(lines.filter((l) => l.startsWith('$'))).toEqual([
      '$ git --version',
      '$ node -v',
      '$ npm -v',
      '$ gh --version',
      '$ gh auth status',
    ]);
    expect(lines.join('\n')).not.toMatch(/not found|missing/i);
    expect(lines.at(-1)).toContain(YOUR_HANDLE);
    expect(lines.map(gearTone)).toEqual(['cmd', 'ok', 'cmd', 'ok', 'cmd', 'ok', 'cmd', 'ok', 'cmd', 'you']);
  });
});
