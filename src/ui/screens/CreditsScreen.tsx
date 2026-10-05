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
    fetch('/ASSETS.md')
      .then((response) => (response.ok ? response.text() : ''))
      .then((text) => {
        if (cancelled || !text) return;
        const names = Array.from(
          new Set([
            'Quaternius',
            ...Array.from(text.matchAll(/by ([^,|()]+)(?:,|\)| Freesound)/g)).map((match) => match[1].trim()),
          ]),
        ).slice(0, 14);
        setAssetCredits(names);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);
  return (
    <OverlayShell title="Credits" eyebrow="Made with care" onBack={bridge.back}>
      <div className="ci-credits">
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
        <h3>Music and voice</h3>
        <p>
          “Bamboo Tide” and “Island Reveal”, made for Copilot Isles with Suno. “Medieval: The Bard’s Tale” by
          RandomMind and “Sunset Plains” by Yoiyami, both CC0 on OpenGameArt. Synthetic voices generated
          offline with Azure AI Speech.
        </p>
      </div>
    </OverlayShell>
  );
}
