# Copilot Isles

Sail a sun-drenched archipelago and learn the **GitHub Copilot app**, one island per chapter of the
[GitHub Copilot app for Beginners](https://github.com/github/copilot-app-for-beginners) course.

> **Status:** Phase 0 (look, sound & performance spike). See [`docs/specs/PHASE-0-spike.md`](docs/specs/PHASE-0-spike.md).

## Getting started

```bash
nvm use            # Node LTS (.nvmrc: lts/*)
npm install
npm run dev
```

Useful commands are listed in [`.github/copilot-instructions.md`](.github/copilot-instructions.md).

## Docs

- [Plan](.plans/PLAN.md)
- [Phase 0 spec](docs/specs/PHASE-0-spike.md) · [Islands 00-01 POC spec](docs/specs/POC-islands-00-01.md)
- [Research](docs/research/) · [Reviews](docs/reviews/)

## Character voices

Voice lines are in [`tools/voice/lines.testcove.json`](tools/voice/lines.testcove.json).
[`tools/voice/generate.ts`](tools/voice/generate.ts) makes the audio at build time.

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

ElevenLabs Voice Library voices can be removed by their owners. With a notice period, you can use the voice until
the period ends. Audio that you already made continues to work.

## License

The code is under the [MIT License](LICENSE). Third-party assets and code keep their own licences:
see [`ASSETS.md`](ASSETS.md), [`public/audio/CREDITS.md`](public/audio/CREDITS.md) and
[`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md). AI-generated art, music and voices are listed in
[`ART_PROVENANCE.md`](ART_PROVENANCE.md).
