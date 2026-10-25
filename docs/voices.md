# Character voices

Every character voice is AI-generated (ElevenLabs or Azure AI Speech). Provenance and dates are in
[`ART_PROVENANCE.md`](../ART_PROVENANCE.md).

Voice lines belong to a course pack ([COURSE-PACKS.md](specs/COURSE-PACKS.md)). The Copilot app
course's are in [`courses/copilot-app/voice/lines.json`](../courses/copilot-app/voice/lines.json), and
their audio, word timings, `manifest.json` and `lipsync.json` are in `courses/copilot-app/public/voice/`
(served as `<base>courses/copilot-app/voice/`). [`tools/voice/generate.ts`](../tools/voice/generate.ts)
makes the audio, and `npm run voice:lipsync` the mouth cues; both take `--course <id>` (default
`copilot-app`):

```bash
npx tsx tools/voice/generate.ts --course copilot-app --only=mer.market.hello
npm run voice:lipsync -- --course copilot-app
```

Who voices each speaker is the pack's `voice/cast.json`: the speech service (`tts`), the `voice` (or
`voiceEnv`, an environment variable that names it, with a `fallbackVoice`), `model`, `prosody` and
`fx`. A line in `voice/lines.json` holds its id, speaker and text, and anything that's its own (a
`prosody`, a `sub`); a field on the line overrides its speaker's. To recast a character, change its
entry in `cast.json` and make its lines again (the cache key includes the voice, so they all change).
A line with `"pending": true` is written but not voiced yet (an island in build, like Keelhaven): it
needs no cast entry, and `generate.ts` and its `--check` leave it out until you drop the flag.

`generate.ts --check` makes nothing: it checks that every line, resolved against the cast, still
matches the audio in `manifest.json` (its text, speaker and cache hash), and `--check --list-stale`
lists the Azure lines that need making again (the weekly course refresh uses it).

**Text-only packs.** A pack with `"voice": false` in `course.json` (today `copilot-cli`) has no audio
and no `cast.json`. `generate.ts --course copilot-cli` writes its captions instead, calling no service: a
`manifest.json` marked `textOnly`, one `<id>.json` per line with its text and reading time, and an empty
`lipsync.json`. In the game a caption holds for its reading time, or moves on with **Next**, the
interact key or the gamepad's A. `--check` proves the captions match `lines.json`.

The cast below is the Copilot app course's. Another course can give the same characters other voices (or
another language) in its own `voice/cast.json`.

| Character | Service         | Voice                                                                                                                  | Notes                                                                                            |
| --------- | --------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Juno      | ElevenLabs      | [Charlotte – Podcasts & Lifestyle](https://elevenlabs.io/voices/XEQBC9sleaE3f5ff82UR) (`XEQBC9sleaE3f5ff82UR`)         | Australian, female. Voice Library, 730-day notice period.                                        |
| Wingman   | ElevenLabs      | [Willem – Casual British Conversational](https://elevenlabs.io/voices/tfsEebr1nWcNraaptkk3) (`tfsEebr1nWcNraaptkk3`)   | British, male. Voice Library, 730-day notice period. The `wingman-bird` effect raises the pitch. |
| Nell      | ElevenLabs      | [Clara – Natural and Convincing](https://elevenlabs.io/voices/EIsgvJT3rwoPvRFG6c4n) (`EIsgvJT3rwoPvRFG6c4n`)           | American, female. Voice Library, 730-day notice period.                                          |
| Ezra      | Azure AI Speech | `en-GB-Ollie:DragonHDLatestNeural` (from `AZURE_SPEECH_MALE_VOICE_UK`)                                                 | Fallback: `en-GB-OllieMultilingualNeural`                                                        |
| Bo        | Azure AI Speech | `en-GB-Ryan:DragonHDLatestNeural`                                                                                      | Fallback: `en-GB-RyanNeural`                                                                     |
| Suri      | Azure AI Speech | `en-US-Jenny:DragonHDLatestNeural`                                                                                     | Fallback: `en-US-JennyNeural`                                                                    |
| Pim       | Azure AI Speech | `en-IE-ConnorNeural`                                                                                                   |                                                                                                  |
| Pol       | Azure AI Speech | `en-IE-EmilyNeural`                                                                                                    |                                                                                                  |
| Lyra      | Azure AI Speech | `en-GB-LibbyNeural`                                                                                                    |                                                                                                  |
| Tobias    | Azure AI Speech | `en-GB-ThomasNeural`                                                                                                   |                                                                                                  |
| Mina      | Azure AI Speech | `en-GB-HollieNeural`                                                                                                   |                                                                                                  |
| Anders    | Azure AI Speech | `en-GB-EthanNeural`                                                                                                    |                                                                                                  |
| Rhea      | Azure AI Speech | `en-GB-AbbiNeural`                                                                                                     |                                                                                                  |
| Oren      | Azure AI Speech | `en-GB-OliverNeural`                                                                                                   |                                                                                                  |
| Pell      | Azure AI Speech | `en-GB-ElliotNeural`                                                                                                   |                                                                                                  |
| Admiral   | Azure AI Speech | `en-GB-OliviaNeural`                                                                                                   |                                                                                                  |
| Tamsin    | ElevenLabs      | [Jo](https://elevenlabs.io/voices/L4so9SudEsIYzE9j4qlR) (`L4so9SudEsIYzE9j4qlR`)                                       | British, female. Voice Library, 730-day notice period.                                           |
| Saffi     | ElevenLabs      | [Beatrice – Mature, Gentle and Engaging](https://elevenlabs.io/voices/kkPJzQOWz2Oz9cUaEaQd) (`kkPJzQOWz2Oz9cUaEaQd`)   | British, female. Voice Library, 730-day notice period.                                           |
| Oak       | ElevenLabs      | [Joe – Warm and Confident](https://elevenlabs.io/voices/LEvd0YiWkwZ6hTZOmdVE) (`LEvd0YiWkwZ6hTZOmdVE`)                 | Nigerian English, male. Voice Library, 730-day notice period.                                    |
| Fen       | ElevenLabs      | [Hugh – Rhythmic and Engaging Storyteller](https://elevenlabs.io/voices/y6p0SvBlfEe2MH4XN7BP) (`y6p0SvBlfEe2MH4XN7BP`) | Scottish, male. Voice Library, 730-day notice period.                                            |
| Ines      | ElevenLabs      | [LOUISE – Warm, Bright and Confident](https://elevenlabs.io/voices/EoMKQ1XHxZPJ6KVTvPL3) (`EoMKQ1XHxZPJ6KVTvPL3`)      | Welsh/British, female. Voice Library, 730-day notice period.                                     |
| Rook      | ElevenLabs      | [Noah Yorkshire](https://elevenlabs.io/voices/poHOO1m3tBNm4Ywmzcaq) (`poHOO1m3tBNm4Ywmzcaq`)                           | Yorkshire, male. Voice Library, 730-day notice period.                                           |
| Pip       | ElevenLabs      | [Daniel – Bright, Warm and Commanding](https://elevenlabs.io/voices/gwU7DXdLrTvWCiUTPZG8) (`gwU7DXdLrTvWCiUTPZG8`)     | Warm, male voice. Voice Library, 730-day notice period.                                          |
| Maren     | ElevenLabs      | [Eleanor – Gracious and Authoritative](https://elevenlabs.io/voices/2qQJWjw5XdG80GreshqG) (`2qQJWjw5XdG80GreshqG`)     | British, female. Voice Library, 730-day notice period.                                           |
| Gilda | ElevenLabs | [Harriet – British Actress](https://elevenlabs.io/voices/aAsWcN5jdLdiYG7Hq0YL) (`aAsWcN5jdLdiYG7Hq0YL`) | British English, female, older; refined and a little bossy. Voice Library, 730-day notice period. The Model Market (Port Meridian). |
| Desmond | ElevenLabs | [Donovan Wilson](https://elevenlabs.io/voices/GLpuYaUYNnusyOVvP3PM) (`GLpuYaUYNnusyOVvP3PM`) | Jamaican English, male, middle-aged; warm and calm, natural rather than exaggerated. Voice Library, 730-day notice period. The Model Market's stall on Anchorage Cay: his own version of every market line, and a goodbye (`desmond.market.*`, 13 lines). |
| Lani | ElevenLabs | [Kalala – Calm & Friendly Pacific](https://elevenlabs.io/voices/sxEoZ67pB0EMoWOZZ37G) (`sxEoZ67pB0EMoWOZZ37G`) | Pacific English, female, middle-aged; warm and calm. Voice Library, 730-day notice period. The Model Market's stall on Thousand-Bough Isle: her own version of every market line, and a goodbye (`tb.lani.market.*`, 13 lines). |

ElevenLabs Voice Library voices can be removed by their owners. With a notice period, you can use the voice until
the period ends. Audio that you already made continues to work.
