# Course pack: GitHub Copilot app for Beginners

Everything the game says about the [GitHub Copilot app for Beginners](https://github.com/github/copilot-app-for-beginners)
course: its chapters, quests, scripts and NPC beats, the puzzles' content, chart labels, notice boards,
the Model Market, the lines the game asks for (hooks), its voice lines, cast and audio, and a snapshot
of the course. The game itself (islands, characters, puzzles, UI) is
course-neutral. See [docs/specs/COURSE-PACKS.md](../../docs/specs/COURSE-PACKS.md) for the layout and
[docs/content-data.md](../../docs/content-data.md) for each file and how to edit it.

| Path                                        | What                                                                                                   | Made by                                                                 |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| `course.json`                               | Title, tagline, source and license, islands ↔ chapters, practice values, the setup forms' words, hooks | Hand                                                                    |
| `chapters/*.json`                           | Quizzes, Logbook pages, chests, glossary, Trials, `voiced`, `cited`                                    | Hand                                                                    |
| `quests/<island>.json`                      | Quests, compass labels, scripts, beats, barks                                                          | Hand                                                                    |
| `puzzles/<name>.json`                       | Each puzzle's content, by mechanic (or `"disabled": true`)                                             | Hand                                                                    |
| `labels.json`, `boards.json`, `market.json` | Chart labels, notice-board text, the Model Market                                                      | Hand                                                                    |
| `models.json`                               | The Model Market's models                                                                              | `npm run models:sync`                                                   |
| `lock.json`, `public/course/`               | The course snapshot and its hashes                                                                     | `npm run course:sync`                                                   |
| `voice/lines.json`, `voice/cast.json`       | Every voice line (id, speaker, text); who voices each speaker                                          | Hand                                                                    |
| `public/voice/`                             | Audio, word timings, `manifest.json`, `lipsync.json`                                                   | `tools/voice/generate.ts --course copilot-app`, `npm run voice:lipsync` |

`public/` is served as `<base>courses/copilot-app/`. Check the pack with `npm run content:check`.

## License

The course's text and screenshots in `public/course/` are © GitHub, Inc., under the MIT License
(`public/course/LICENSE`); `THIRD_PARTY_NOTICES.md` and `ASSETS.md` list them. The voice audio is
AI-generated (`ART_PROVENANCE.md`, `docs/voices.md`). The rest is Copilot Isles' own.
