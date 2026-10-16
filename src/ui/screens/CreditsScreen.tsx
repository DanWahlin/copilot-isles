import { useEffect, useState } from 'react';
import type { GameBridge } from '../bridge';
import { OverlayShell } from '../components/OverlayShell';

export function CreditsScreen({ bridge }: { bridge: GameBridge }) {
  const [assetCredits, setAssetCredits] = useState<string[]>([
    'Quaternius',
    'Freesound CC0 recordists',
    'Tidewater audio sources',
  ]);
  useEffect(() => {
    let cancelled = false;
    fetch(`${import.meta.env.BASE_URL || '/'}ASSETS.md`)
      .then((response) => (response.ok ? response.text() : ''))
      .then((text) => {
        if (cancelled || !text) return;
        const names = Array.from(
          new Set([
            'Quaternius',
            ...Array.from(text.matchAll(/by ([^,|()]+)(?:,|\(|\)| Freesound)/g))
              .map((match) => match[1].trim())
              // Names only: ASSETS.md's notes also say "modified by `tools/...`: sha256 …".
              .filter((name) => name.length <= 40 && !/[`/:;]/.test(name)),
          ]),
        ).slice(0, 14);
        setAssetCredits(names);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);
  const [courseLicense, setCourseLicense] = useState('');
  useEffect(() => {
    let cancelled = false;
    // The course's own LICENSE, bundled with the course snapshot by tools/course/sync.mjs.
    fetch(`${import.meta.env.BASE_URL || '/'}course/LICENSE`)
      .then((response) => (response.ok ? response.text() : ''))
      .then((text) => !cancelled && setCourseLicense(text.trim()))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);
  return (
    <OverlayShell title="Credits" eyebrow="Made with care" onBack={bridge.back}>
      <div className="ci-credits">
        <p className="ci-credits-author">
          Created by Dan Wahlin
          <br />
          Copyright © 2026
        </p>
        <p>
          <a href="https://github.com/github/copilot-app-for-beginners">GitHub Copilot app for Beginners</a>
        </p>
        <p>Built with three.js, React, TypeScript, and Web Audio.</p>
        <h3>Assets and audio</h3>
        <p>{assetCredits.join(' · ')}</p>
        <p>
          Distant seagulls and parts of the cloud and water rendering adapted from{' '}
          <a href="https://github.com/dgreenheck/tidewater">Tidewater</a> (MIT).
        </p>
        <p>
          Seagull and Flying seagull by Poly by Google (
          <a href="https://creativecommons.org/licenses/by/3.0/">CC BY 3.0</a>), via{' '}
          <a href="https://poly.pizza/m/0WRzrtCIIRp">Poly Pizza</a>
        </p>
        <h3>Course content</h3>
        <p>
          Course text and screenshots come from{' '}
          <a href="https://github.com/github/copilot-app-for-beginners">GitHub Copilot app for Beginners</a>,
          © GitHub, Inc., under the MIT License. The game reads them live from GitHub, so its pages keep up
          with the course.
        </p>
        <p className="ci-credits-privacy">
          Privacy: to read the course, your browser connects to raw.githubusercontent.com, so GitHub sees your
          IP address, just like when you open a course link. If GitHub can’t be reached, the game uses the
          copy that comes with it. If you tell the game your fork’s address, it stays in your save on this
          device, and the game never looks it up on GitHub. The same goes for the rest of Your setup: your
          computer (the game asks your browser which system it’s on, to show the right shortcut keys), your
          practice issue’s number, your session’s branch, and the model you picked. None of it is sent
          anywhere, and you can change or forget it in the Logbook.
        </p>
        {courseLicense && (
          <details className="ci-credits-license">
            <summary>Course license (MIT)</summary>
            <pre>{courseLicense}</pre>
          </details>
        )}
        <h3>Music and voice</h3>
        <p>
          “Bamboo Tide”, “Island Reveal”, “Brass of the Storm” and “Misty Jungle Dusk”, made for Copilot Isles
          with Suno. “Medieval: The Bard’s Tale” by RandomMind and “Sunset Plains” by Yoiyami, both CC0 on
          OpenGameArt. The character voices are AI-generated with Azure AI Speech and ElevenLabs. They aren’t
          real people.
        </p>
        <p>Seagull models by Poly by Google, CC BY 3.0 (poly.pizza).</p>
        <h3>About this project</h3>
        <p>
          Copilot Isles is an unofficial, personal project. It isn’t an official GitHub or Microsoft product,
          and GitHub hasn’t endorsed it. GitHub and GitHub Copilot are trademarks of GitHub, Inc. The lessons
          come from the MIT-licensed GitHub Copilot app for Beginners course.
        </p>
      </div>
    </OverlayShell>
  );
}
