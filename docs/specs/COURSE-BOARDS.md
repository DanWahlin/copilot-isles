# Course notice boards

Every island has a **course notice board**: a wooden town notice board on two posts under a small
shingled roof, with a carved header ("Course Notices · Chapter 0N · <chapter title>") and the
chapter's topics pinned up as parchment notes. Walk up, press **E** (or A, or tap the prompt):
"Read the notices" opens the board up close, and each topic opens that section of the course on
GitHub in a new tab. It's separate from Port Meridian's Bounty Board, which stays the app's
**Pull requests** and **Issues** views in Mina's tour.

## Where the boards stand

| Island         | Chapter | Where                                                                                       |
| -------------- | ------- | ------------------------------------------------------------------------------------------- |
| Anchorage Cay  | 00      | East side of the street from the quay up to the village square, turned toward the pier foot |
| Port Meridian  | 01      | Against the harbour wall at the back of the quay, between two palms, facing the water       |
| Thousand-Bough | 02      | Bough Landing's east side, facing back up the Root Wharf, before the Fern Walk              |

Where each board stands is the game's (`src/world/islands/course-boards.ts`, one entry an island).
Which chapter it shows is the island's chapter in the course pack's `course.json`, and its text is the
pack's `boards.json` ([content-data.md](../content-data.md), [COURSE-PACKS.md](COURSE-PACKS.md)).
Meridian's board is on the quay, well clear of the plaza, the Model Market and the stair street.

## Topics: from the course lock, kept current by the weekly sync

`src/learn/course-board.ts` reads the course pack's `lock.json` (its `chapters`), which loads with the
voyage. A board lists its chapter's `##` sections in the course's order, with the course's
exact titles, except:

- **By anchor:** `prerequisites`, `whats-next`, `source-references` (what you need first, the
  hand-off to the next chapter, and the sources).
- **By title prefix:** `The Course Theme`, `From the Studio` (the recording-studio story frame).

`skip.anchors` and `skip.titlePrefixes` in `courses/copilot-app/boards.json` hold the two lists (the file
also has the header and pin text). When `tools/course/sync.mjs` adds or renames a section, the boards
follow on the next build, and the weekly refresh PR lists each board's topics and what changed
(`npm run content:check`). Each topic
links to `…/blob/main/<chapter>/README.md#<anchor>` (the same link `courseUrl` gives a `SourceRef`),
and two pins link to the chapter's README ("This chapter") and the course's home, the course
repository's README ("The whole course").

Today's boards (lock `1ba934e`):

- **00 · Setup:** Installation, Connect to Your Repository, Check Your Tools in Terminal, Add the
  Course Practice Items, Learn More About the Course Repository, Troubleshooting.
- **01 · Tour the App:** Why Use the GitHub Copilot app?, Tour the App, Chats, Project Sessions, and
  Modes, Models and Reasoning Effort, Prompts and Shortcuts, Settings, Troubleshooting.
- **02 · Sessions, Worktrees, and Context:** Core Concepts, Exercise: Start a Session from a Branch and
  Attach an Issue, Exercise: Check the Session with Slash Commands, Troubleshooting, Assignment.

Learning Objectives and Key Takeaways stay off the boards (each pack's `skip.anchors`): they summarise
the chapter, and the chapter's own page has them.

`src/learn/course-board.test.ts` checks that every topic resolves to a `##` anchor in the lock, that
every other `##` section is one the skip lists name, and that each chapter keeps at least 5 topics.

## ✓ Topics you've met

A topic gets a ✓ when the player holds a Logbook page, or has passed a quiz, whose `source` cites
that section or a heading inside it (a `###` counts toward its `##`). `LearnStore.openCourseBoard`
works it out once, when the board opens, from the pages and quiz records already in the save.

## In the world

- **Timber** (posts, boards, header plank, shingle courses, ridge, gable boards) goes into the
  island's town buckets as kit `wood`, and the notes' brass tacks as kit `metal`
  (`addCourseBoardTimber` in `src/world/sites/course-board.ts`): no new draw or shader.
- **Lettering** (header and notes) is painted into a sign atlas (`addCourseBoardNotices`): the
  Anchorage sites' atlas and Thousand-Bough's village atlas (no new draw), and on Port Meridian a
  sign set of its own built with the town (one draw; the town has no atlas of its own).
- A walker collider (posts and board) and a camera blocker (board and roof). Anchorage's plants keep
  off it (`courseBoardExcludes`).
- Built with each island's world, freed with it: Meridian's town (`meridian-town/course-board.ts`)
  and Thousand-Bough's tree village rebuild it on every stream; Anchorage's goes dormant with the
  island. The interaction is Anchorage's from the start, Meridian's in its island scope, and
  Thousand-Bough's comes and goes with its stream. Nothing about a board is saved: the ✓s come from
  the save's pages and quizzes.

## Reading it up close

`src/ui/learn/CourseBoard.tsx` (the chart label's parchment, `src/game/chart-label/paper.webp`):

- Topics and pins are real links (`target="_blank" rel="noopener noreferrer"`), at least 52 px tall
  with 16 px text, each with an external-link icon and an `aria-label` that ends "opens the course on
  GitHub in a new tab".
- **Keyboard:** the first topic has focus; arrows move, Enter opens (the browser's own link), Esc
  goes back. Keys in a text field are left alone (`isTyping`).
- **Gamepad:** the d-pad moves, A opens the focused link with `window.open` (and clears its
  `opener`), B goes back. The press that opened the board doesn't count (`PadEdges.arm`). A browser
  may block a tab a gamepad opens (it isn't a user gesture): the board then says to press Enter or
  tap the topic.
- **Touch:** tap a topic. On phones the list is one column and scrolls inside the parchment; on
  landscape phones the head is tighter and the topics take two or three columns.
- While it's open, the game holds the walker (`LearnStore.busy`). Quizzes, page reveals, the Logbook
  and the setup and fork forms draw instead of it.
- Reduced motion: no rise-in (the game's setting and the system's).

## Tests

- `src/learn/course-board.test.ts`: topics, skip lists, links, the island-to-chapter map, the ✓s.
- `src/content/content.test.ts`: `courses/copilot-app/boards.json` against its schema, each board's
  chapter in the snapshot with at least 5 topics, and each board on its island (in its waters, on the
  ground or a deck).
- `tools/questtest.mjs`: after Nell's talk, walks to Anchorage's board, opens it with E, and checks
  Installation's link (URL, `target="_blank"`, `noopener`, the new-tab label), its ✓ from Nell's
  install page, the first topic's focus, and Esc. It doesn't follow the link.
