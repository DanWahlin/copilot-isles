Thanks. This is a strong review. I checked your citations against the course and they hold up. Here's my position on each finding. For every item, reply with **ACCEPT** (you agree with my position) or **COUNTER** (plus your reasoning and a concrete alternative). Then give a final **Consensus list**: the exact change to make for each G#, one line each. Stay read-only. Don't edit files or run shell commands.

**G1: Agree.** Add the Logbook page with both `node .github/scripts/setup-training-scenarios.js` commands (`--dry-run`, then `--yes`), run in **Terminal** from the folder containing `.github` and `samples`. Suri names GitHub.com → your fork → **Actions** and explains it's GitHub Actions for the practice checks. The solved line becomes "the practice checks can run on your fork". Wingman clarifies that the Clock Tower's **Automations** are a different thing, taught later. B0.1 gets Git-missing and "app policy is separate from the Copilot CLI policy".

**G2: Agree.** Plan → tavern (chat), diff → Gideon's workshop (editor), tests → a terminal hatch, PR → a post office signed as the browser. Cards are brought to the Command Deck table. M1.1 is unchanged.

**G3: Partially agree.** Agree that 45-55 min is unrealistic. Voice alone is ~445 × 6 s ≈ 44 min. Proposal:
- POC target: **70-90 min for both islands**. Plan §5 becomes **25-45 min per island**.
- Add a **vertical-slice gate**: Anchorage Q0.2-Q0.8 fully playable before the rest of Phase 1 content.
- I'd keep real TTS in the slice rather than placeholders. Generation is automated and cheap, and the slice has to prove the voiced feel. The expensive part is writing, not rendering.
- Trim levers after the playtest: the Whispering Gallery and bottles stay optional, and the Passport review can drop to 2 hotspots.

**G4: Agree.** The title backdrop is ocean, sky, clouds, and the player's ship, plus at most a distant impostor silhouette on the horizon. Anchorage streams in after New Voyage/Continue. The same sentence goes in both docs.

**G5: Agree with a nuance.**
- Drop both LFS and Releases-hosted bundles. Release asset downloads redirect to a different origin, and I don't think they're reliably CORS-fetchable from a Pages site.
- Voice (~11 MB) and compressed textures are small enough to commit directly. A GitHub Actions workflow builds `dist/` and deploys it with `upload-pages-artifact`, every file < 100 MB, and the site is well under 1 GB. Note the ~100 GB/month soft bandwidth cap.
- The repo stores Opus (WebM) + AAC per line, but the client picks exactly one via `canPlayType`. The download budget counts one format only.

**G6: Partially agree.**
- Agree: the spike includes a dressed pirate, one restyled building cluster, and ≥ 8 skinned NPCs, all in one frame with the ocean.
- Agree: the water samples a **prefiltered (PMREM) sky environment map**, which is what "fresnel sky reflection" meant. I'll make that explicit.
- Agree: the boat uses analytic Gerstner buoyancy on the hull and is kinematic, not a Rapier body.
- **Disagree on the cost claim.** Rapier WASM with a `KinematicCharacterController` against a few hundred static colliders typically costs well under 1 ms/frame, not 6 ms. Proposal:
  - Rapier provides only **static-world colliders + scene queries + the kinematic character controller**.
  - Push crates are **grid logic** with no physics.
  - The POC has **no dynamic rigid bodies**.
  - Phase 0 *measures* physics ms against the §12.1 budget, and if it's over budget we move it to a worker.

**G7: Agree.**
- Split T0's 12-step ordering into your 5 decisions.
- Write A1 #5's three tasks.
- Add a modes item to A1 (takeaway 5).
- Disable hint tier 3 inside Trials.
- The Autopilot voyage completes with no required input, and interrupt is an optional, de-emphasized control.
- Write the 10-question exit quiz (hints off) as a spec appendix.
- Add one install line ("download and install the app") to Nell.

**G8: Mostly agree.**
- Fix the posters to match the image shown, the H1.5 wording (the chip shows the model name, and "Medium" is the effort), and H0.4's wrong-answer copy (the checkmark is the default, New worktree).
- **Pushback on H1.2:** recognizing the **Failed** indicator in **My work** *is* the skill. Chapter 03 has learners find a failing check in My work, so reading the badge isn't a giveaway. I'll reword it to "Which item needs a fix because its automated check failed?" and add "numbers on your fork may differ".
- **On masks:** I measured the coordinates. On `app-add-project`, ① sits above-right of the **+** and ② sits right of the "Add GitHub repository" label. On `app-quick-chat`, ② sits right of the **Chat** chip. None of them erase a target label. I still agree the Hotspot Editor should **reject any mask that overlaps a target rect**.

**G9: Partially agree.**
- Ch03: two circuits (inner, then outer), the final gate is the player's human review, and the practice PR doesn't launch. **Agree.**
- Ch04: a shanty scroll that doesn't change the toolbelt, and a specialist whose belt *is* the restriction. **Agree.**
- Ch06: keep the five rail names, add a beat where the player and the mate both change the board, and have no Approve column (approval happens in the Plan tab). **Agree.**
- **Ch02: disagree with replacing the treehouses.** Houses on *separate branches of one tree*, sharing one trunk, map unusually well: a separate folder, on its own branch, sharing the repo's history. The misleading part was my wording, "separate rooms". The fix is "each treehouse is its **own house (folder) on its own branch**; they share the trunk (the repository)", plus the port-collision rope bridge. The Bard keeps the course's recording booths as the analogy.

**G10: Agree.**
- Default look is **hold right mouse to look (no pointer lock)**, with an optional pointer-lock "mouse-look" setting, arrow-key look, and gamepad.
- Add captions for important sound cues to §3.10.
- Reduced motion disables the lantern flicker and god rays.
- In the POC there's no swimming (wading in the shallows only, and deep water gently returns you to shore) and no ledge climbing. Plan §5 marks those as post-POC.

**G11: Partially agree.**
- Agree: include the full MIT copyright + permission notice, never model or generate the Octocat or Copilot logo, and check the Azure Speech terms before public deploy. The credits and Settings will say the voices are **synthetic (Azure AI Speech)**, following Microsoft's TTS transparency guidance.
- **Disagree on hard-coding "Unofficial fan project. Not affiliated with GitHub."** The user's branding decision is *Unsure*, and this could become an official project. The right move is an **affiliation line that's a required decision before the first public deploy**. It blocks deploy, not Phase 0.
- **The ship:** the PotC line was added by the user. I read it as a style brief: a Golden Age of Piracy square-rigger (brigantine/galleon, weathered hull, patched canvas), which is generic historical design. We won't replicate any specific film ship's distinctive design. This also exposes a real inconsistency: the spec gives the player a small **sloop**. That changes to a **brigantine**.

**G12: Partially agree.** The game has to stay self-contained (PLAN §8), since many players won't have the app open. Proposal:
- The speaking tube shows the prompt + "Try it in the app ↗".
- The player then chooses **"I tried it"** or **"Show me a good answer"**.
- Only then does Juno reveal what a good answer contains (cites `App.tsx`, case-insensitive). The spoiler sits behind the player's choice.

**G13: Agree.** Checkpoint at each puzzle's start (they're ≤ 7 min). P1.2 checkpoints after each of its 3 voyages.

**G14: Agree.** In the POC, Free explore can enter Anchorage and Port Meridian. Islands 02-07 are visible and not enterable.
