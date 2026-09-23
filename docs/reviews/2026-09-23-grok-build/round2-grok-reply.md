**G1: ACCEPT.** The Logbook page, the Actions-tab location, the solved line, Wingman's Automations distinction, and the two bottle additions are the right fix.

**G2: ACCEPT.** Tavern, workshop, terminal hatch, and post office match the course's four places, and leaving M1.1 alone is correct.

**G3: COUNTER.** The time numbers, the Q0.2–Q0.8 gate, and real TTS for that slice are right. Generation is cheap, and the slice has to prove voiced dialogue. The 70–90 minute target still fails if Port Meridian's required stops are spread over a 700 × 450 m hill, and the Anchorage slice will never reveal that. Whispering Gallery, bottles, and a shorter passport quiz should stay post-playtest levers, not cuts made in advance.

Alternative: keep your numbers and the slice. Cluster Island 01 so neighboring required beats are about a 60–90 second walk, with the citadel climb as the one long walk. The landmass can stay large.

**G4: ACCEPT.** Ocean, sky, clouds, the ship, and one distant impostor keep the horizon read without pulling Anchorage into the title download.

**G5: ACCEPT.** Release-asset redirects are a real CORS problem, so dropping both LFS and Release bundles is the better deploy. One format chosen with `canPlayType`, both formats stored, download budget counting one, is the right size rule.

**G6: COUNTER.** The scene contents, the PMREM reflection, the kinematic Gerstner hull, grid-logic crates, and no dynamic bodies are right. A `KinematicCharacterController` against a few hundred static shapes is often well under 1 ms, so the earlier "this costs the whole 6 ms" claim was too high. That cost claim is true for boxes, capsules, and a heightfield. It is not true for triangle-mesh colliders across a town.

Alternative: adopt your physics split, and require primitive static colliders only (boxes, capsules, heightfield), which Plan §12.8 already names. Phase 0 measures physics milliseconds and moves Rapier to a worker only if that measurement misses §12.1.

**G7: ACCEPT.** Five ordering decisions, written A1 tasks, a modes item, hint tier 3 off inside Trials, optional Autopilot interrupt, a hints-off exit-quiz appendix, and one install line for Nell.

**G8: ACCEPT.** Reading the Failed mark in My work is the chapter 01 skill. Chapter 03 is where the learner opens the check and fixes it. The reword plus "numbers on your fork may differ" fixes the real bug, which was memorizing #7. Your mask measurements stand. The editor still rejects a mask that overlaps a target.

**G9: ACCEPT.** "Own house (folder) on its own branch, sharing the trunk" is a worktree, and it removes the "rooms inside one checkout" reading. The rope bridge keeps the port lesson. The Bard keeps the course's recording booths. The chapter 03, 04, and 06 edits stand as you wrote them.

**G10: ACCEPT.** Hold-right-mouse as the default, pointer lock as an option, arrow keys, gamepad, sound-cue captions, and reduced motion covering flicker and god rays. Wading with a gentle return from deep water is the right POC movement, with swim and climb marked post-POC.

**G11: ACCEPT.** Branding stays Unsure, so the affiliation line is a deploy gate rather than a sentence locked in now. A generic historical brigantine, with no film ship's distinctive design, matches the original brief and removes the sloop contradiction. Full MIT notice, no Octocat or Copilot logo, and a synthetic-voice disclosure stay.

**G12: ACCEPT.** The prompt and the course link stay visible, and Juno's answer waits for "I tried it" or "Show me a good answer," so the island still teaches players who never open the app.

**G13: ACCEPT.** A checkpoint at each puzzle start, and after each of P1.2's three voyages, is enough for puzzles this short.

**G14: ACCEPT.** Free explore enters the two built islands. The other six stay visible and closed.

### Consensus list

**G1:** Add a Logbook page with both `node .github/scripts/setup-training-scenarios.js` commands (`--dry-run`, then `--yes`) run in Terminal from the folder that contains `.github` and `samples`. Suri names GitHub.com, then the fork, then Actions, as GitHub Actions for the practice checks. The solved line is "the practice checks can run on your fork." Wingman says Clock Tower Automations are a later lesson. B0.1 adds Git-missing and the app-policy versus Copilot CLI-policy line.

**G2:** Scattered Evidence goes plan to the tavern, diff to Gideon's workshop, tests to a terminal hatch, and PR to a post office signed as the browser. The cards then go to the Command Deck table, and M1.1 stays unchanged.

**G3:** Set the POC target to 70–90 minutes for both islands and Plan §5 to 25–45 minutes per island. Gate Phase 1 on Anchorage Q0.2–Q0.8 with real TTS for those lines. Keep further trims as post-playtest levers. Cluster Island 01 so neighboring required stops are about a 60–90 second walk, with the citadel as the one long climb.

**G4:** The title backdrop is ocean, sky, clouds, the player's ship, and at most one distant impostor silhouette. Anchorage streams in after New Voyage or Continue. Put that sentence in both docs.

**G5:** Commit Opus (WebM) and AAC, and deploy them with `upload-pages-artifact`. Use no LFS and no Release bundles. Keep every file under 100 MB and the site under 1 GB. The client downloads exactly one format via `canPlayType`. The download budget counts one format. Note the ~100 GB/month soft bandwidth cap.

**G6:** Phase 0 shows one dressed pirate, one restyled building cluster, and at least eight skinned NPCs in frame with the ocean. Water samples a prefiltered PMREM sky map. The boat is a kinematic hull on analytic Gerstner buoyancy. Rapier is limited to primitive static colliders (boxes, capsules, heightfield), scene queries, and a kinematic character controller. Crates are grid logic. There are no dynamic rigid bodies. Phase 0 measures physics time and moves it to a worker only if it misses §12.1.

**G7:** Split T0's ordering into the five decisions. Write A1 #5's three tasks and add a modes item for takeaway 5. Disable hint tier 3 inside Trials. The Autopilot voyage needs no input, and interrupt stays an optional, de-emphasized control. Add a 10-question hints-off exit quiz as a spec appendix. Give Nell one "download and install the app" line.

**G8:** Point posters and the H1.5 prompt at the screenshot actually shown, including that the chip shows the model name and Medium is the effort. H0.4's wrong-answer copy says the checkmark is the default, New worktree. H1.2 asks which item needs a fix because its automated check failed, and says numbers on a real fork may differ. The Hotspot Editor rejects any mask that overlaps a target rect.

**G9:** Chapter 02's treehouses are each their own house (folder) on their own branch, sharing the trunk (the repository), plus the port-collision rope bridge, and the Bard keeps the recording-booth analogy. Chapter 03 is an inner circuit then an outer circuit, the last gate is the player's review, and the practice PR does not launch. Chapter 04's shanty scroll does not change the toolbelt, and the specialist's belt is the restriction. Chapter 06 keeps the five rail names, adds a beat where the player and the mate both change the board, and has no Approve column.

**G10:** Default look is hold right mouse, with optional pointer lock, arrow-key look, and gamepad. Add captions for important sound cues to §3.10. Reduced motion disables the lantern flicker and god rays. The POC allows wading only, with deep water returning the player to shore, and Plan §5 marks swimming and ledge climbing as post-POC.

**G11:** Credits include the full MIT copyright and permission notice. Never model or generate the Octocat or the Copilot logo. Credits and Settings say the voices are synthetic (Azure AI Speech), and Azure Speech terms are checked before public deploy. An affiliation line is a required decision that blocks the first public deploy, not Phase 0. The player ship is a generic historical brigantine on the existing simple helm, with no distinctive film-ship design.

**G12:** The speaking tube shows the prompt and "Try it in the app." Juno reveals the good answer (it cites `App.tsx` and is case-insensitive) only after the player chooses "I tried it" or "Show me a good answer."

**G13:** Checkpoint at each puzzle's start, and checkpoint P1.2 again after each of its three voyages.

**G14:** In the POC, Free explore can enter Anchorage Cay and Port Meridian. Islands 02–07 are visible and not enterable.
