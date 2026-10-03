# Third-party notices

Copilot Isles adapts code from the open-source projects below. Each adapted source file also carries a header
naming its origin (`Adapted from <project> © <holder>, <license>, <path>@<commit>`). Third-party *assets*
(audio, models, textures) are listed with their authors and licenses in `ASSETS.md`.

## Tidewater

- Source: https://github.com/dgreenheck/tidewater (reference commits `d32799f` for the birds, earlier vegetation and
  soundscape files, and `fd6cae6`, its three.js build, for the sky, clouds, water and procedural palms)
- License: MIT
- Adapted at `fd6cae6`:
  - `src/world/sky/atmosphere.ts` from `src/sky/Atmosphere.js`
  - `src/world/sky/clouds/Atmosphere.ts` from `src/sky/Atmosphere.js`
  - `src/world/sky/clouds/Clouds.ts` from `src/sky/Clouds.js`
  - `src/world/sky/clouds/Globals.ts` from `src/core/Globals.js`
  - `src/world/sky/clouds/Sky.ts` from `src/sky/Sky.js`
  - `src/world/ocean/ocean.ts` from `src/ocean/WaterMaterial.js`
  - `src/world/vegetation/palms.ts` from `src/world/vegetation/PlantGeometry.js` and `src/world/vegetation/GeoBuilder.js`
  - `src/world/vegetation/materials.ts` from `src/world/vegetation/VegMaterials.js`, `src/world/vegetation/VegNodes.js`, and `src/world/vegetation/LeafTextures.js`

```
MIT License

Copyright (c) 2026 DRG Software Solutions LLC

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Rhubarb Lip Sync

- Source: https://github.com/DanielSWolf/rhubarb-lip-sync (release `v1.14.0`)
- License: MIT
- Used for: an offline toolchain binary in `.tools/rhubarb/` that extracts mouth-cue data from existing cached voice
  WAV files. No Rhubarb code ships in the browser bundle; its generated mouth-cue data is committed with the voice
  assets.

```
MIT License

Copyright (c) 2015-2024 Daniel Wolf

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## GitHub Copilot app for Beginners

- Source: https://github.com/github/copilot-app-for-beginners (reference commit `360fcb2`)
- License: MIT
- Used for: the course screenshots in `public/course/` and the learning content the islands teach (quizzes, pages,
  and glossary terms in `src/learn/content/` paraphrase and link back to the course chapters).

```
MIT License

Copyright GitHub, Inc.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

```
