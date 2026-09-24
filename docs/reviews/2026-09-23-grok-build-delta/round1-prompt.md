New review round, same rules as before: READ-ONLY, no shell commands, and don't read ~/.env or ~/.grok. Since our last consensus (commit 9566e37), the plan has had four major additions. **The plan file moved to `.plans/PLAN.md`** (it was docs/PLAN.md).

What changed:
1. **Sakura River Valley study** (docs/research/2026-09-23-sakura-river-valley.md) → PLAN §2, §6 "Water system" / "Physics & motion" / environment, §12.
2. **Modular loading** → PLAN §13: code chunks, asset packs + manifest, streaming scheduler, load budgets, a Service Worker for GitHub Pages (max-age=600, gzip only), and the loader screen (§13.8).
3. **"Antikythera" artifact study** (docs/research/2026-09-23-antikythera-artifact.md) → Gerstner/polar-grid water, analytic ship reflection, damped-spring buoyancy, the Leaps director, analytic cliffs, and the loader.
4. **Platform decisions** → PLAN §0 + §14: WebGL2; desktop + tablets now, phones later; **UHD 620 at 30 fps is the floor**, plus a Lite preset; a **2D Chart & Logbook fallback mode**; emulated performance testing only; a private repo.

The full diff is at **/tmp/copilot-isles-delta.diff** (you may read it). Also read the current `.plans/PLAN.md`, `docs/specs/POC-islands-00-01.md`, and both research docs.

Please review, focusing on:
- **Internal consistency:** budgets across §6, §12.1, §13.5, and §14, the per-tier feature lists vs the tier table, the spec's acceptance criteria vs the plan, and leftover stale statements.
- **Feasibility at the floor:** can the Water system plus environment actually hit 30 fps on UHD 620 with the Low feature set? What else must be cut or simplified at Low/Lite? Is "analytic ship reflection on every tier" realistic?
- **Modular loading correctness:** the Service Worker strategy, the budgets (≤ 4 MB title, ≤ 14 MB first playable), diegetic hiding, and a private repo with Pages.
- **Physics coherence:** kinematic sailing combined with damped-spring buoyancy, the Rapier scope, and the autopilot planner.
- **Scope realism:** tablets + the 2D mode inside Phase 1 (the POC), and Phase 0 now carrying many water layers + the loader skeleton.
- **Regressions:** did any of the agreed G1-G14 consensus items get undone or contradicted?
- **Teaching:** do any of the new visual systems (Leaps, cliffs, loader) distract from learning or conflict with accessibility or reduced motion?

Output: **Verdict** (Approve / Approve with changes / Major revisions + ≤ 3 sentences), then **Findings D1…Dn** (≤ 15, prioritized; each with Severity / Location / Issue / Evidence / Recommendation), **Strengths** (≤ 5), and **Questions for the user** (or "None").
