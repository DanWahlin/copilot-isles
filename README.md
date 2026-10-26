# Kraken Isles

> Formerly Copilot Isles (renamed 2026-10-26).

A pirate island adventure in the browser that teaches GitHub Copilot. Each island is one chapter of a
course: pick the [GitHub Copilot app for Beginners](https://github.com/github/copilot-app-for-beginners)
or the [GitHub Copilot CLI for Beginners](https://github.com/github/copilot-cli-for-beginners) course
when you start a voyage.

**▶ Play the early preview: https://danwahlin.github.io/kraken-isles/**

Source: https://github.com/DanWahlin/kraken-isles. The old address (`danwahlin.github.io/copilot-isles/`) was
the game's address before the rename. Your saves and settings stay: the game moves them to its new
storage keys when it starts.

> **Unofficial project:** a personal project by Dan Wahlin. It isn't an official GitHub or Microsoft
> product, and GitHub hasn't endorsed it. GitHub and GitHub Copilot are trademarks of GitHub, Inc.

## What you'll do

- **Sail between islands.** Four are playable so far: Anchorage Cay (Chapter 00 · Setup), Port
  Meridian (01 · Tour the App), Thousand-Bough Isle (02 · Sessions, Worktrees & Context) and
  Keelhaven (03 · Dev & GitHub Workflows). Guildcrest (Chapter 04) is next.
- **Solve puzzles that use the concept.** For example, pick Interactive, Plan or Autopilot for each
  order, or give each crew its own worktree.
- **Take quizzes on real screenshots of the app**, fight sea battles with review questions between
  waves, and fill a Logbook with pages that quote the course.

Every lesson cites its course chapter and section. A desktop browser with WebGPU or WebGL2 works
best. Use the keyboard and mouse or a gamepad; the **Controls** screen lists every key.

## Courses

The game is the same for every course; a **course pack** (`courses/<id>/`) holds everything a course
says: its chapters, quests, NPC lines, quizzes, puzzle content, signs and voice lines.

| Course                                                                                                 | Pack                   | Islands                                           | Voices        |
| ------------------------------------------------------------------------------------------------------ | ---------------------- | ------------------------------------------------- | ------------- |
| [GitHub Copilot app for Beginners](https://github.com/github/copilot-app-for-beginners) (MIT © GitHub) | `courses/copilot-app/` | Anchorage Cay, Port Meridian, Thousand-Bough Isle | Voiced        |
| [GitHub Copilot CLI for Beginners](https://github.com/github/copilot-cli-for-beginners) (MIT © GitHub) | `courses/copilot-cli/` | Anchorage Cay (Chapter 00 · Quick Start)          | Captions only |

**New Voyage** lists the courses, and **Continue** picks up the last one you played (each course keeps
its own save). To add one, see [Adding a course](docs/adding-a-course.md).

## Run it locally

```bash
nvm use        # Node LTS (see .nvmrc)
npm install
npm run dev    # bakes the terrain packs, then starts Vite
```

No keys are needed: the generated voices and art are in the repo. API keys are only for the tools
that make new assets, and they stay out of the game (`npm run check:secrets`).

Before you open a PR, run:

```bash
npm run typecheck && npm run lint && npm test
npm run build && npm run check:budgets && npm run check:secrets
```

More commands, the stack, and the project rules are in
[`.github/copilot-instructions.md`](.github/copilot-instructions.md).

## Docs

- **Plan:** [`.plans/PLAN.md`](.plans/PLAN.md)
- **Specs:** [Islands 00–01](docs/specs/POC-islands-00-01.md) ·
  [Thousand-Bough Isle](docs/specs/ISLAND-02-thousand-bough.md) ·
  [Keelhaven (design)](docs/specs/ISLAND-03-keelhaven.md) · [Sea battles](docs/specs/BATTLES.md) ·
  [Opening](docs/specs/OPENING-living-chart.md) · [Chart labels](docs/specs/LOWER-THIRDS.md) ·
  [Model Market](docs/specs/MODEL-MARKET.md)
- **Model list:** the Model Market's models come from GitHub Docs (`npm run models:sync`). A weekly
  workflow (`models-refresh.yml`) opens a PR when they change; merging it deploys the site.
- **Course content:** [adding a course](docs/adding-a-course.md) ·
  [course packs](docs/specs/COURSE-PACKS.md) (everything a course says is data,
  in `courses/<id>/`: chapters, quests and scripts, labels, boards, the Model Market, voice lines and
  their audio, the course snapshot) · [content data](docs/content-data.md) (each file, how to edit it,
  and how a change reaches players) · [authoring guide](docs/course-content-authoring.md)
- **Character voices:** [`docs/voices.md`](docs/voices.md) (all AI-generated)
- **Background:** [research](docs/research/) · [design reviews](docs/reviews/)

## License

The code is [MIT](LICENSE). Third-party assets keep their own licences: see [`ASSETS.md`](ASSETS.md),
[`public/audio/CREDITS.md`](public/audio/CREDITS.md) and [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).
AI-generated art, music and voices are listed in [`ART_PROVENANCE.md`](ART_PROVENANCE.md). The course
content is MIT-licensed by GitHub.
