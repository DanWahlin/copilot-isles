# Copilot Isles

A pirate island adventure in the browser that teaches the **GitHub Copilot app**. Each island is one
chapter of the [GitHub Copilot app for Beginners](https://github.com/github/copilot-app-for-beginners)
course.

**▶ Play the early preview: https://danwahlin.github.io/copilot-isles/**

> **Unofficial project:** a personal project by Dan Wahlin. It isn't an official GitHub or Microsoft
> product, and GitHub hasn't endorsed it. GitHub and GitHub Copilot are trademarks of GitHub, Inc.

## What you'll do

- **Sail between islands.** Three are playable so far: Anchorage Cay (Chapter 00 · Setup), Port
  Meridian (01 · Tour the App) and Thousand-Bough Isle (02 · Sessions, Worktrees & Context).
  Keelhaven (Chapter 03) is next.
- **Solve puzzles that use the concept.** For example, pick Interactive, Plan or Autopilot for each
  order, or give each crew its own worktree.
- **Take quizzes on real screenshots of the app**, fight sea battles with review questions between
  waves, and fill a Logbook with pages that quote the course.

Every lesson cites its course chapter and section. A desktop browser with WebGPU or WebGL2 works
best. Use the keyboard and mouse or a gamepad; the **Controls** screen lists every key.

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
  [Thousand-Bough Isle](docs/specs/ISLAND-02-thousand-bough.md) · [Sea battles](docs/specs/BATTLES.md) ·
  [Opening](docs/specs/OPENING-living-chart.md) · [Chart labels](docs/specs/LOWER-THIRDS.md) ·
  [Model Market](docs/specs/MODEL-MARKET.md)
- **Model list:** the Model Market's models come from GitHub Docs (`npm run models:sync`). A weekly
  workflow (`models-refresh.yml`) opens a PR when they change; merging it deploys the site.
- **Course content:** [course packs](docs/specs/COURSE-PACKS.md) (everything a course says is data,
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
