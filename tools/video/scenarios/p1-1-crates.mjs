// P1.1 The Crate Yard (Anders, Port Meridian): Anders's brief on project sessions, then the yard
// pushed for real, crate by crate: chat work to the tavern plates, project work to the slipway.
// One crate goes toward the wrong plate first, so the yard refuses it and says why.
import { meridianAshore } from '../game.mjs';

/**
 * The next push from here: the solver's, or `force` ({ id, dir }: that crate, that way), with the
 * walking route (cell centres round the crates) to the cell you push it from.
 */
const think = (api, force = null) =>
  api.S(async (force) => {
    const L = await import('/src/world/sites/crate-yard-logic.ts');
    const lay = L.MERIDIAN_YARD;
    const s = window.__dev.session();
    const p = s.debug.puzzle('P1.1');
    const st = p.state();
    const state = { at: st.at.map(([x, z]) => [x, z]) };
    // The yard's grid from three crates' cells (it's an affine grid): two steps across it, U per
    // cell in x and V per cell in z, from any three crates that aren't in a line.
    const g = st.at;
    const w = p.spots().cells;
    const fit =
      window.__yardFit ??
      (() => {
        for (let b = 1; b < g.length; b++)
          for (let c = b + 1; c < g.length; c++) {
            const [ax, az] = [g[b][0] - g[0][0], g[b][1] - g[0][1]];
            const [bx, bz] = [g[c][0] - g[0][0], g[c][1] - g[0][1]];
            const det = ax * bz - bx * az;
            if (!det) continue;
            const W1 = { x: w[b].x - w[0].x, z: w[b].z - w[0].z };
            const W2 = { x: w[c].x - w[0].x, z: w[c].z - w[0].z };
            // [U V] = [W1 W2] · inverse([[ax, bx], [az, bz]])
            const U = { x: (W1.x * bz - W2.x * az) / det, z: (W1.z * bz - W2.z * az) / det };
            const V = { x: (W2.x * ax - W1.x * bx) / det, z: (W2.z * ax - W1.z * bx) / det };
            const O = {
              x: w[0].x - g[0][0] * U.x - g[0][1] * V.x,
              z: w[0].z - g[0][0] * U.z - g[0][1] * V.z,
            };
            return { O, U, V };
          }
        throw new Error('the crates are all in a line');
      })();
    window.__yardFit = fit;
    const at = (x, z) => ({ x: fit.O.x + x * fit.U.x + z * fit.V.x, z: fit.O.z + x * fit.U.z + z * fit.V.z });
    // The player's cell (nearest centre).
    let me = lay.entry,
      best = Infinity;
    for (let x = -1; x <= lay.cols; x++)
      for (let z = -1; z <= lay.rows; z++) {
        const c = at(x, z);
        const d = Math.hypot(c.x - s.player.x, c.z - s.player.z);
        if (d < best) {
          best = d;
          me = [x, z];
        }
      }
    const inside = L.inYard(lay, me[0], me[1]) ? me : lay.entry;
    const steps = L.solve(lay, state, inside) ?? [];
    let forced = null;
    if (force) {
      const i = lay.crates.findIndex((c) => c.id === force.id);
      if (i < 0) throw new Error(`no crate "${force.id}" in the yard`);
      const [dx, dz] = L.DIRS[force.dir];
      forced = { from: [state.at[i][0] - dx, state.at[i][1] - dz], dir: force.dir, crate: i };
    }
    // A walking route (cell centres) from your cell to each step's cell, round the crates.
    const route = (from, to) => {
      const key = (c) => `${c[0]},${c[1]}`;
      const prev = new Map([[key(from), null]]);
      const q = [from];
      while (q.length) {
        const c = q.shift();
        if (key(c) === key(to)) break;
        for (const [dx, dz] of Object.values(L.DIRS)) {
          const n = [c[0] + dx, c[1] + dz];
          if (!L.inYard(lay, n[0], n[1]) || prev.has(key(n)) || L.crateAt(state, n[0], n[1]) >= 0) continue;
          prev.set(key(n), c);
          q.push(n);
        }
      }
      const out = [];
      for (let c = to; c; c = prev.get(key(c))) out.unshift(c);
      return out.map(([x, z]) => at(x, z));
    };
    const plan = (step) =>
      step && {
        ...step,
        route: route(inside, step.from),
        crateAt: at(state.at[step.crate][0], state.at[step.crate][1]),
      };
    return {
      me,
      entry: lay.entry,
      gate: at(lay.entry[0], lay.entry[1] + 1.2),
      entryAt: at(lay.entry[0], lay.entry[1]),
      next: plan(forced ?? steps[0]),
      left: steps.length,
      solved: st.solved,
    };
  }, force);

export default {
  id: 'crates',
  order: 3,
  code: 'P1.1',
  title: 'The Crate Yard',
  island: 'Port Meridian',
  who: 'with Anders at the shipyard',
  subtitle:
    'Chat or project session? Questions and brainstorming go to a chat. Work that needs your repository needs a project session.',
  chapter: 'Course Chapter 01 · Chat sessions and Project sessions',
  flags: ['meridian'],

  async setup(page, api) {
    await meridianAshore(page, api);
    await api.S(() => {
      for (const id of ['Q1.1', 'Q1.2', 'Q1.3']) window.__dev.session().debug.quest(id, 'done');
    });
    this.spot = await api.approachSpot('anders', { back: 3.5 });
    await api.look(this.spot.heading + 0.3, 0.2);
    await api.pause(1500);
  },

  async play(page, api) {
    await api.pause(800);
    await api.talkTo(this.spot);
    await api.converse({
      until: (s) => s.quests['Q1.4'] === 'crates' && !s.dialogue && !s.banner && !s.reveal,
    });
    await api.pause(500);

    // Into the yard through its gate.
    let t = await think(api, false);
    await api.walkTo(t.gate.x, t.gate.z, { tol: 0.6 });
    await api.walkTo(t.entryAt.x, t.entryAt.z, { tol: 0.4 });
    await api.easeLook((await api.state()).heading, 0.72, 1000);
    await api.pause(600);

    // "Fix a bug" first, along the top to the slipway; the general worktree question toward the
    // tavern; the pull request onto the slipway. Then "Tour the book app (no edits)" goes west toward
    // the tavern's plate, and the plate refuses it: no files change, but it needs your repository (the
    // mistake). After that, the solver's pushes from wherever things stand (16 pushes in all, one
    // refused; check with the yard model before changing these).
    const opening = [
      { id: 'bug', dir: 'e' },
      { id: 'bug', dir: 'e' },
      { id: 'worktree', dir: 'w' },
      { id: 'worktree', dir: 'w' },
      { id: 'pr', dir: 'e' },
      { id: 'tour', dir: 'w', wrong: true },
    ];
    for (let guard = 0; guard < 40; guard++) {
      const force = opening.shift() ?? null;
      t = await think(api, force);
      if (t.solved || !t.next) break;
      const step = t.next;
      if (force?.wrong) api.mark('wrong plate: Tour the book app onto the tavern plate');
      for (const c of step.route.slice(1)) await api.walkTo(c.x, c.z, { tol: 0.35, run: 99 });
      await api.face(step.crateAt.x, step.crateAt.z, 0.25);
      await api.pause(250);
      const ok = await api.interact('Push the crate', { timeout: 2500, beat: 300 });
      if (!ok) {
        // Nudge toward the crate and try once more.
        await api.face(step.crateAt.x, step.crateAt.z, 0.15);
        await api.interact('Push the crate', { timeout: 2000, beat: 200 });
      }
      // A refused push: let the crate rock back and the reason be read.
      await api.pause(force?.wrong ? 4500 : 900);
    }
    // The last plate lights, and Anders sums up.
    await api.pause(800);
    await api.converse({
      until: (s) => s.quests['Q1.4'] === 'done' && !s.dialogue && !s.reveal && !s.banner,
      timeout: 90_000,
    });
    await api.pause(2500);
  },
};
