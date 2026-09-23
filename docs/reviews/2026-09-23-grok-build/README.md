# Grok Build review: 2026-09-23

**Reviewer:** Grok Build CLI 1.0.41, model `grok-4.7`, reasoning effort high, read-only plan mode (session `c9b70fe5-35c6-435b-933f-1312a869c616`).
**Author:** GitHub Copilot CLI.
**Scope:** the plan (then `docs/PLAN.md`, now [`.plans/PLAN.md`](../../../.plans/PLAN.md)) and [`docs/specs/POC-islands-00-01.md`](../../specs/POC-islands-00-01.md), fact-checked against `github/copilot-app-for-beginners` @ `360fcb2`.
**Verdict (round 1):** *Approve with changes.* 14 findings: 1 Blocker, 10 Major, 3 Minor.
**Outcome:** **Consensus reached in round 2 and confirmed in round 3.** Grok re-read the edited docs and verified all 14 findings as applied (`CONSENSUS: CONFIRMED`), with no new inconsistencies.

| File | Contents |
|---|---|
| [round1-prompt.md](round1-prompt.md) | Review brief given to Grok |
| [round1-grok-review.md](round1-grok-review.md) | Grok's findings G1-G14 |
| [round2-author-response.md](round2-author-response.md) | Copilot's position on each finding (agree / partial / pushback) |
| [round2-grok-reply.md](round2-grok-reply.md) | Grok's ACCEPT/COUNTER replies + the final consensus list |
| [round3-grok-verification.md](round3-grok-verification.md) | Grok's check that PLAN v0.3 / spec v0.2 apply every G# |

## Consensus summary

| # | Sev. | Topic | How it was resolved |
|---|---|---|---|
| G1 | Blocker | Island 00 hid the real setup actions | Logbook page with both `setup-training-scenarios.js` commands (run in Terminal from the repo root), Suri names GitHub.com → fork → **Actions**, "automation power" wording removed (GitHub Actions ≠ app Automations), and B0.1 gains Git-missing + app policy ≠ CLI policy |
| G2 | Major | Scattered Evidence used the wrong places | Plan at the tavern (chat), diff at the workshop (editor), tests at a terminal hatch, PR at the post office ("The Browser") |
| G3 | Major | 45-55 min target unrealistic | 70-90 min POC (25-45 min per island), vertical-slice gate (Anchorage Q0.2-Q0.8 with real TTS), and Port Meridian's required stops kept within a 60-90 s walk *(Grok counter, accepted)* |
| G4 | Major | Title backdrop vs 25 MB budget | The title is ocean, sky, clouds, and the ship (+ ≤ 1 impostor). The island streams in after New Voyage |
| G5 | Major | Pages + LFS/Releases won't work | No LFS, no Release bundles. Commit the small assets and deploy with `upload-pages-artifact`. The client downloads one audio format |
| G6 | Major | Phase 0 could pass on the wrong scene | The spike shows the ocean + a building cluster + a dressed pirate + ≥ 8 NPCs. PMREM sky reflection, analytic-buoyancy kinematic boat, and Rapier limited to primitive static colliders + the kinematic controller *(Grok counter, accepted)* |
| G7 | Major | Trials tested recall, not decisions | T0 ordering is now 5 decisions. A1 has 9 items covering all 6 takeaways, hint tier 3 is off in Trials, the Autopilot voyage needs no input, and the exit quiz is written (Appendix A) |
| G8 | Major | Hotspots mismatched their images | Posters match `app-new-page`, H1.5 explains model name vs effort, H0.4 explains the default checkmark, H1.2 notes "numbers may differ", and the editor rejects masks that overlap targets |
| G9 | Major | Later-island metaphors risked misconceptions | Treehouses = own house (folder) on own branch sharing the trunk *(author pushback, accepted)*. Ch03 has two circuits with human review last and the practice PR not merged. Ch04 scroll ≠ toolbelt. Ch06 shared board with no Approve column |
| G10 | Major | Pointer-lock default, missing captions | Hold-right-mouse default, optional pointer lock, arrow keys, sound-cue captions, broader reduced motion, and wading only in the POC |
| G11 | Major | Trademark/licensing gaps | Full MIT notice, no Octocat/Copilot logo, synthetic-voice disclosure, and an affiliation line as a pre-deploy gate *(author pushback on hard-coding "unofficial", accepted)*. The ship is a generic brigantine (fixes the "sloop" conflict with the Plan §5 ship brief) |
| G12 | Minor | Juno spoiled the "Try it" answer | The answer is revealed only after "I tried it" / "Show me a good answer" |
| G13 | Minor | Puzzle state not saved | Checkpoint at each puzzle start, and after each P1.2 voyage |
| G14 | Minor | Free explore contradiction | POC Free explore enters only Anchorage Cay and Port Meridian. 02-07 are visible but can't be entered |

## Items awaiting a user decision
- **Affiliation line** wording (required before the first public GitHub Pages deploy). See spec §10.
