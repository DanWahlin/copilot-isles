### Verdict

Approve with changes. The chapter 00/01 UI facts, the quiz types, and the rendering rules are solid enough to build from, but Island 00 currently leaves out the real setup actions, and Island 01 places one of the chapter's main ideas in the wrong rooms. Fix those teaching errors, the title-screen budget contradiction, and the Phase 0 gate before content production starts.

### Findings

**G1**
- **Severity:** Blocker
- **Location:** `docs/specs/POC-islands-00-01.md` §4.4 Q0.6–Q0.7, §4.5 P0.1–P0.2, §4.7 T0; course `00-setup/README.md` "Add the course practice items" and "Your first prompt"
- **Issue:** The seal can be earned without the player ever seeing where setup happens or what to run. Enabling workflows is a banner on the fork's **Actions** tab on GitHub.com: "Workflows aren't being run on this forked repository" and "I understand my workflows, go ahead and enable them." The script is two commands from the repository root, in the Copilot app's **Terminal** tab: `node .github/scripts/setup-training-scenarios.js --dry-run`, then the same script with `--yes`, after the `Repository:` line shows the fork. The crane teaches the preview habit, the repository check, and the organization-fork stop, and then stops. The sluice's solved state calls the result "automation power." Chapter 01 uses **Automations** for a different thing: a saved agent task. The bottles also drop two course warnings: Git reported missing at connect time, and the **GitHub Copilot app** policy being separate from the Copilot CLI policy.
- **Evidence:** Course: "Open the **Actions** tab in your fork on GitHub.com… Enable workflows so GitHub can run automated checks for the practice exercises." Then the two `node .github/scripts/setup-training-scenarios.js` commands, and "Wait for the terminal to show `Setup complete.`" Spec P0.1 solved state: "a visual promise that 'automation power' is now on." Spec Q0.7 never prints the command. Troubleshooting in the course: "separate from the Copilot CLI policy" and the Git-missing note under "Connect to your repository."
- **Recommendation:** Add a Logbook page that shows both commands and says they run in **Terminal**, from the folder that contains `.github` and `samples`. Suri's line must say GitHub.com → the fork → **Actions**, and that this is GitHub Actions for the practice checks. Change the solved line to "the practice checks can run on the fork." Have the parrot say the Clock Tower automations are a later island. Add the Git-missing case and the app-policy-versus-CLI-policy sentence to B0.1. Keep the crane's three guards.

**G2**
- **Severity:** Major
- **Location:** Spec §6.4 Q1.2 and §6.2 layout; course `01-tour-the-app/README.md` "The challenge"
- **Issue:** Scattered Evidence puts the pieces in rooms that teach the wrong tools. The course's four places are chat, the editor, a terminal, and the browser. The spec puts the plan in the tavern, the diff in the shipyard, the tests at "the fort steps," and the PR at a post box. The layout has no fort. The shipyard is later defined as the project session, which is the chapter's solution, so the diff is sitting in the place that is supposed to end the scavenger hunt. The editor is already a location: Gideon's workshop.
- **Evidence:** Course table: "Plan in chat, diff in the editor, tests in a terminal, PR in the browser." Spec: "the **plan** at the tavern, the **diff** at the shipyard, the **tests** at the fort steps, and the **PR** at the post box." Layout block lists quay, plaza, market, clock tower, outfitter, tavern, shipyard, workshop, academy, observatory, citadel. No fort.
- **Recommendation:** Plan stays in the tavern. Diff moves to the carpenter's workshop. Tests move to a terminal hatch on the ship or in the workshop. The PR stays at a post office whose sign says it is the browser, outside the app. The player then brings the four cards to the Command Deck table. M1.1's four pairings can stay. They match the course.

**G3**
- **Severity:** Major
- **Location:** Spec §0 success criterion 1 and §2 journey; Plan §5 "Progression" and §10 Phase 1
- **Issue:** The 45–55 minute pass line is not a playable time for this content. The spec's own puzzle budgets already add to about 20 minutes (sluice 2, crane 4, tavern crates 4, three helms 7, banners 3) before dialogue, two 8-item trials, the harbor passport, and walking a 700 × 450 m town. The course itself estimates about 20 minutes for chapter 00 and about 30 minutes for chapter 01, and that is reading, not hiking. Plan §5 also says 15–25 minutes per island. Phase 1 as written is every system plus about 445 voiced lines and 21 named NPCs.
- **Evidence:** Spec: "finishes both islands in **~45-55 min**"; journey "~20 min" and "~28 min"; voice table "≈ **445 lines**." Plan progression: "About 15-25 min per island." Course chapter headers: "~20 minutes" and "~30 minutes."
- **Recommendation:** Change the success line to a time you will actually playtest. A honest first target is 75–100 minutes for both islands, or cut a district and one puzzle until a playtest lands shorter. Gate Phase 1 on one vertical slice, Anchorage Q0.2 through Q0.8 with placeholder audio, before generating the full voice set.

**G4**
- **Severity:** Major
- **Location:** Spec §3.1 "Title backdrop" and §9 acceptance; Plan §12.6 and §12.1 "Initial download"
- **Issue:** The title screen cannot be both the full Anchorage Cay scene and a tiny download that appears in a couple of seconds. The acceptance test requires the title under 25 MB on every tier. A real island means terrain, water, palms, the ship, and the shaders before the menu is usable.
- **Evidence:** Spec §3.1: "the real Anchorage Cay scene (with no extra assets)." Plan §12.6: "The title screen is procedural and tiny, so the menu appears in a couple of seconds." Both documents require "< 25 MB" before the title.
- **Recommendation:** The title backdrop is ocean, sky, clouds, and one ship. Anchorage loads after New Voyage. Put that sentence in both documents so the 25 MB test has one meaning.

**G5**
- **Severity:** Major
- **Location:** Plan §6 hosting paragraph and §12.7; spec §7 voice size and the `tools/voice/generate.ts` pipeline
- **Issue:** GitHub Pages will not turn Git LFS pointers into audio and textures. Pages publishes the git blob. An LFS pointer is that blob, so the live site serves the pointer unless the deploy workflow checks out the real bytes and uploads those bytes as the Pages artifact. The voice budget has the same kind of double count: the size math is about 11 MB of Opus, and the pipeline writes `.opus` and `.m4a` for every line.
- **Evidence:** Plan: "Large audio/texture files may use Git LFS or a Releases-hosted asset bundle to stay within Pages size limits." Spec: "~6 s average × 445 at 32 kbps Opus ≈ **~11 MB** total" and "writes `voice/<island>/<lineId>.opus` + `.m4a`." GitHub's Pages limits are a site of about 1 GB and a soft bandwidth cap of about 100 GB per month. Git itself rejects files over 100 MB.
- **Recommendation:** Deploy the checked-out files, or a Release bundle the game fetches, with each file under 100 MB. Ship one audio file per line. Download an AAC fallback only in browsers that cannot play the primary file. Recompute the per-island budget after that choice. The hash cache and −18 LUFS target can stay.

**G6**
- **Severity:** Major
- **Location:** Plan §10 Phase 0, §12.1, §12.5, §12.8; spec §8
- **Issue:** The Phase 0 gate can pass on a scene the POC never ships, and the water recipe will not survive the beauty test. Phase 0 is one greybox island, one character, and a boat. Port Meridian is a zoned town plus a crowd of skinned characters. Rapier at a fixed 60 Hz on the main thread, for a dynamic boat and a character body, will spend the Low tier's 6 ms before gameplay starts. Fresnel-only water, with no reflection of the sky the player is looking at, reads as tinted plastic. **Decision risk:** art approach A is already chosen and should stay chosen. Quaternius base characters are stylized and low-poly. The look approval is meaningless if the spike never shows a dressed pirate, a building cluster, and the water in one frame. Reopening the art direction is not the fix. Staging the spike is.
- **Evidence:** Plan Phase 0: "one greybox island, character + camera, sail and dock." §12.1 Low: "JS main thread per frame < 6 ms" and High "< 300" draw calls. §12.5: "No planar reflections. Water uses a fresnel sky reflection." §12.8: "Physics (Rapier) runs at a fixed 60 Hz." Spec §8's town tactics are atlases, merged chunks, and portals, which are the right town tools, and they are absent from the spike scene.
- **Recommendation:** The spike scene includes the clipmap ocean, one restyled building cluster, and at least eight skinned NPCs. Water samples a prefiltered sky environment map. That is still one scene render, not a planar reflection. Boat buoyancy is an analytic Gerstner evaluation on the hull, not a GPU readback and not a Rapier body. The character controller is kinematic. Rapier is for the push crates only. Write that split into spec §8.

**G7**
- **Severity:** Major
- **Location:** Spec §1 intro, §4.7 T0 item 1, §6.5 P1.2, §6.7 A1; course chapter 01 "Key Takeaways" and the Autopilot row
- **Issue:** The trials test recall of a long sequence, and the exam does not match its own rule. T0 item 1 is one ordering of twelve steps. A beginner who understood the chapter can fail it. A1 says "one item per key takeaway," then omits takeaway 5 (modes change the level of autonomy). A1 item 5, the chat / project / automation item, has no tasks written. The matrix header says every objective is taught, practiced, and assessed. Download-and-install is not in Nell's scene. P1.3 practices six of the nine settings areas. The optional exit quiz that is supposed to prove the learning goal is not written, and hint tier 3 speaks the answer, so the seal does not measure that goal. The Autopilot voyage also says the player can interrupt at any time. The course's Autopilot row is end-to-end execution with minimal intervention.
- **Evidence:** Spec T0 item 1 lists Sign in through First prompt as one ordering. Spec §6.7: "One item per key takeaway, plus extras," then eight items with item 5 "3 tasks → Chat / Project session / Automation" and no tasks. Course takeaways 1–6 include "Interactive, Plan and Autopilot change the level of autonomy." Course Autopilot cell: "End-to-end execution without interruption." Spec P1.2 voyage 3: "You can **interrupt** at any time."
- **Recommendation:** Split T0 ordering into the five decisions that matter: sign in, fork, add the fork, **Local repository** for this session, dry-run and check `Repository:` before `--yes`. Write A1 item 5's three tasks in the spec. Add one mode item to A1 so takeaway 5 is in the exam. Let S1.2 stay as practice. The Autopilot voyage completes with no required input. An interrupt control exists and is labeled optional. Write the ten-question exit quiz, with hints disabled, or drop it from the success criteria.

**G8**
- **Severity:** Major
- **Location:** Spec §6.4 H1.1–H1.5, §4.7 H0.2–H0.4, §4.6 and §6.6 image choices; screenshots `app-my-work-page.webp`, `app-new-page.webp`, `app-add-project.webp`, `local-repository-workspace-selector.webp`
- **Issue:** Several hotspots are aimed at the right screen and the wrong test. H1.2 asks for the pull request whose check failed, on a row that already prints "Failed." Masking the red numbered badges does not hide that word. The dialogue treats "Failing stats check practice #7" as a stable fact. On this screenshot, #7 is that PR and it is marked Failed. Chapter 07's sample table uses other numbers and says the learner's numbers may differ. Chapter 03 says to match by title when the number differs. The Voyage Office posters quote "Build a personal landing page with dark mode," which is on `app-add-project.webp`. `app-new-page.webp`, the chest and the H1.1 image, shows three other cards: a design-doc template, monorepo versus multi-repo, and an accessibility audit checklist. H1.5 asks for "the model control" as if the picture said Auto. The chip on `app-new-page.webp` reads "GPT-5.6 Sol · Medium," next to "Interactive." Callout masks sit on the Projects **+**, on **Add GitHub repository**, and on the **Chat** chip. A mask that samples over those pixels erases the target. H0.4's correct click is **Local repository**, and the screenshot's checkmark is on **New worktree**.
- **Evidence:** Spec H1.2: "Click the pull request whose automated check **failed**" → `Failing stats check practice #7`. The My work screenshot's fourth row is that title with a Failed mark. Spec Q1.4 posters: "Build a personal landing page with dark mode" beside `app-new-page`. Chapter 07: "Your PR numbers and titles may differ," with a sample row "#6 Failing stats check practice."
- **Recommendation:** H1.2 should ask for the row titled **Failing stats check practice**, and the caption should say the number on a real fork may differ. Mask or crop the Failed column if the question is about recognizing the row rather than reading the badge. Point the posters at the cards on the image the player is shown. H1.5's prompt should say "the control that shows the model name," and the explanation should say Medium on this picture is the effort. In the hotspot editor, reject a mask that covers the target label. H0.4's wrong-answer line should say the checkmark is the default, **New worktree**, and setup changes it to **Local repository**.

**G9**
- **Severity:** Major
- **Location:** Plan §3 metaphor table and §4 signature-puzzle column; course chapters 02, 03, 04, and 06
- **Issue:** Four later puzzles will teach a false model if the next specs copy the plan's wording. Worktrees are additional working directories, usually on another branch, attached to the same repository. "Treehouses… same trunk, separate rooms" reads as rooms inside one checkout. The shared-bridge port twist is the right second beat: worktrees do not separate ports, and chapter 02's troubleshooting is "Two previews collided." Chapter 03 is an inner loop on the machine and then an outer loop on GitHub. One lock sequence that must turn green before launch drops human judgment, and the course tells the learner not to merge the practice pull request. A skill does not remove tools. The course says a "review without editing" skill does not disable file-editing tools. The toolbelt is the custom-agent lesson. Chapter 06's rail names Propose → Plan → Baseline → Implement → Validate match the Feature Workbench prompt, including "No Approve stage." A Sokoban that only sorts crates into those columns misses the actual idea: the player and the agent edit the same board. Approval stays in the Plan tab.
- **Evidence:** Course 02: "Each worktree is usually checked out to a different branch" and "Worktrees separate files and branches. They do not separate everything… ports can still collide." Course 03 takeaway 6: "A change is ready only when the diff, local validation, GitHub checks, and human review agree," plus "Don't merge this practice pull request." Course 04: "a skill that says 'review without editing' does not disable file-editing tools." Course 06 prompt: "Propose -> Plan -> Baseline -> Implement -> Validate. No Approve stage."
- **Recommendation:** Edit the plan table now. Chapter 02 is separate booths (or docks) sharing one chart, plus the port-collision bridge. Chapter 03 is two circuits, inner then outer, and the last gate is the player's decision. The practice PR does not launch. Chapter 04 has two props: a shanty scroll that does not change the toolbelt, and a specialist whose belt is the restriction. Chapter 06 keeps those five rail names, adds one beat where the player and the mate both change the board, and has no Approve column. Chapter 05's "enabled is not connected" beam, and chapter 07's manual lever before the schedule, are the sketches to keep. When those specs are written, add "installed is not invoked," MCP versus plugin, local before cloud, and a read-only starter automation.

**G10**
- **Severity:** Major
- **Location:** Spec §3.3 and §3.10; Plan §5 exploration and §9
- **Issue:** The default look control traps the mouse, and the spec dropped a caption requirement the plan already made. Pointer lock plus WASD is hostile to the beginner audience this course is for, and there is no keyboard look binding. Plan §9 requires captions for every sound cue that matters. Spec §3.10's accessibility list does not include them. Reduced motion covers camera bob and shake, and the sluice ending lights the village while High tier turns on god rays.
- **Evidence:** Spec controls: "WASD / mouse (pointer lock)." Spec §3.10 lists text size, subtitle opacity, high contrast, dyslexia font, and reduced motion. Plan §9: "captions for every sound cue that matters." Plan exploration also lists swim and climb, which the spec's control table does not define.
- **Recommendation:** Add keyboard look (hold Alt, or the arrow keys) and a setting to leave pointer lock off. The islands are finishable with that plus the gamepad path. Copy sound-cue captions into §3.10. Reduced motion also disables the all-lanterns flicker and the god rays. For the POC, the water is a boundary. Swim and climb stay out until they have controls and a test.

**G11**
- **Severity:** Major
- **Location:** Plan §0 branding, §5 sailing, §11 trademarks; spec §7 credits; course `LICENSE`
- **Issue:** A public Pages deploy of a game named Copilot Isles, full of product screenshots, needs a trademark decision the plan still lists as unsure. The MIT license on the course covers copyright in the repo, including the screenshots, and it requires the copyright notice and the permission notice in substantial copies. It does not grant GitHub's trademarks. The screenshots contain the Octocat. Plan §5 also briefs the ship as similar to a ship in Pirates of the Caribbean, which is a film likeness the CC0 kits do not grant. The offline Azure key design is the right one. Public redistribution of Dragon HD lines still has to follow the current Speech service terms, and the credits should not present those voices as human actors.
- **Evidence:** Plan §0: "Branding | **Unsure.**" Plan §11: "Confirm usage rights. Default: screenshots only, no mascots or logos in 3D." Plan §5: "a pirate ship similar to what you'd see in Pirates of the Carribean." Course LICENSE: "The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software." Spec credits: "course content & screenshots (**© GitHub, MIT License**)."
- **Recommendation:** Put "Unofficial fan project. Not affiliated with GitHub." on the title screen and in the credits. Include the MIT copyright line and the permission paragraph, not only the words "MIT License." Keep screenshots as screenshots. Do not generate or model the Octocat, the Copilot logo, or a film ship. The spec's "sloop" is the art direction. Before the first public deploy, check the current Azure Speech terms for redistributed neural and Dragon HD audio. Re-read each kit's license file when it is vendored.

**G12**
- **Severity:** Minor
- **Location:** Spec §6.4 Q1.7 "Try it"; `samples/book-app-web/src/App.tsx`; Plan §8
- **Issue:** Juno recites the result the chapter wants the learner to get by sending the prompt. The result in the spec is true: `filterBooks` trims and lowercases the search and matches title and author. Speaking it in the game spends the exercise. Plan §8 already says real app work is an optional "Try it in the app" side quest.
- **Evidence:** Spec: "They answer that it matches titles and authors without depending on letter case, see `samples/book-app-web/src/App.tsx`." `App.tsx` does that. Course expected output is the same sentence, after the learner submits the prompt.
- **Recommendation:** The speaking tube shows the prompt to paste and links to the chapter. The Logbook says a good answer cites `App.tsx`. The case-sensitivity conclusion stays in the real app.

**G13**
- **Severity:** Minor
- **Location:** Spec §3.9
- **Issue:** Autosave lists "puzzle," and the schema has quests, chests, pages, and quiz attempts. It has no state for crane facing, channel tiles, crate positions, or banner faces. A reload mid-puzzle has nothing to restore.
- **Evidence:** Schema: `{ v, created, character, settings, island, position, quests{}, chests[], pages[], glossary[], quizzes{...}, doubloons, seals[], lighthouses[] }`.
- **Recommendation:** Persist each puzzle's piece state in the save, or restore a named checkpoint at puzzle start and say that on the pause screen.

**G14**
- **Severity:** Minor
- **Location:** Spec §3.8; Plan §4 bottles versus spec §4.4 B0.1–B0.3
- **Issue:** Free explore says every island is selectable, and the same paragraph says islands 02–07 are "Coming soon." The plan's Island 00 side content also promises a Git-missing bottle that the spec's bottle list does not contain. G1 covers the Git-missing text. This entry is the chart rule.
- **Evidence:** Spec §3.8: "every island is selectable, including skipping straight to Port Meridian. In the POC, 02-07 show 'Coming soon.'"
- **Recommendation:** In the POC, Free explore can enter Anchorage Cay and Port Meridian. Islands 02–07 are visible on the chart and are not enterable.

### Strengths

- Most chapter 00/01 interface language is exact and usable: **Sign in to GitHub**, skip **Connect your repositories**, **+** next to **Projects**, **Local repository** versus **New worktree** versus **Cloud**, the workflow banner, `gh auth login` → GitHub.com → web browser, **Issues** under **Settings → Features**, and **Auto** versus **Autopilot**.
- P1.1's tour crate is the right trick. Chapter 01 sends a repository tour that must not change files through a project session, because it needs repository context. The tavern-versus-shipyard sort teaches that.
- M1.1 keeps the course's hardest sentence: the app is not a replacement for the editor, and it is not "multi-project support" by itself. Tobias is given that line.
- Three helms on one level match the course caption, "Choose a mode for the task. These are options, not levels to unlock." The staircase graphic can stay in the chest if the caption stays with it.
- The rendering doctrine is the one that can hold 60 fps: no second scene render for water, instancing and atlases, KTX2 kept compressed, the 3D loop paused on full-screen UI, and a pinned course SHA with a hotspot hash check.
- The chapter 05 beam ("enabled" is not "connected") and the chapter 07 order (manual lever, then the clock, with the siren as prompt injection) match the course and should survive into those specs.

### Questions for the user

None.
