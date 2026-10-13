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
  - `src/world/sky/clouds/Sky.ts` from `src/sky/Sky.js` and `src/post/AirHaze.js`
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

## NAGI ocean sim

- Source: https://github.com/noxellab/nagi-ocean-sim
- License: MIT
- Adapted at `16c552b`:
  - `src/world/ocean/ocean.ts` from `src/ocean.js` (specular anti-aliasing, filtered foam, and backlit crest transport techniques only; ported to TSL)

```
MIT License

Copyright (c) 2026 NAGI contributors

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

## Poly by Google gull models

- Source: https://poly.pizza/m/0WRzrtCIIRp (`76d4eea2-3700-43ae-b65c-7f6ea2dc5d23.glb`) and
  https://poly.pizza/m/6Tpj_vcWP3f (`ee7ad6b3-ebdc-4494-ba1e-8b6190004df5.glb`)
- Author: Poly by Google
- License: Creative Commons Attribution 3.0 Unported (CC-BY 3.0), https://creativecommons.org/licenses/by/3.0/
- Used for: baked title wordmark gull sprites in `public/title/wordmark-gull.webp`, and the dock gull
  model `public/packs/testcove/life/dock-gull.glb` (unmodified).

```
This work includes adapted sprite renders from "Seagull" and "Flying seagull" by Poly by Google,
licensed under CC-BY 3.0.
```

## GitHub Copilot app for Beginners

- Source: https://github.com/github/copilot-app-for-beginners (reference commit `360fcb2`)
- License: MIT
- Used for: the course screenshots and the course snapshot in `public/course/` (chapter READMEs, `GLOSSARY.md`,
  `LICENSE`, and images, synced by `tools/course/sync.mjs`; commit in `content/course.lock.json`), the course text and
  pictures the game reads live from `raw.githubusercontent.com` (PLAN §8.2), and the learning content the islands
  teach (quizzes, pages, and glossary terms in `src/learn/content/` paraphrase and link back to the course chapters).

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

## meshoptimizer

- Source: https://github.com/zeux/meshoptimizer (npm package `meshoptimizer` 1.2.0)
- License: MIT
- Used for: the simplifier (`meshoptimizer/simplifier`, bundled in a lazy chunk) that makes the character levels
  of detail once at load, in `src/world/characters/character-lod.ts`. No source is adapted.

```
MIT License

Copyright (c) 2016-2026 Arseny Kapoulkine

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
