import { useState } from 'react';
import { NAME_MAX, cleanName, defaultShipName } from '../../learn/progress';
import type { CaptainBody, GameBridge } from '../bridge';
import { CaptainPortrait } from '../components/CaptainPortrait';
import { OverlayShell } from '../components/OverlayShell';

export function CaptainSelect({ bridge, current }: { bridge: GameBridge; current: CaptainBody }) {
  const [captain, setCaptain] = useState<CaptainBody>(current);
  const [name, setName] = useState('');
  const captainTitle = cleanName(name) ? `Captain ${cleanName(name)}` : 'Captain';
  const [ship, setShip] = useState<string | null>(null);
  const shipShown = ship ?? defaultShipName(cleanName(name));
  const start = () => bridge.newVoyage(captain, { captain: name, ship: shipShown });
  return (
    <OverlayShell title="Choose your captain" eyebrow="New voyage" onBack={bridge.back}>
      <div className="ci-captain-grid" role="radiogroup" aria-label="Captain body">
        <CaptainCard id="man" title={captainTitle} selected={captain === 'man'} onSelect={setCaptain} />
        <CaptainCard id="woman" title={captainTitle} selected={captain === 'woman'} onSelect={setCaptain} />
      </div>
      <form
        className="ci-name-fields"
        onSubmit={(e) => {
          e.preventDefault();
          start();
        }}
      >
        <label className="ci-name-field">
          <span>Your name</span>
          <input
            type="text"
            value={name}
            maxLength={NAME_MAX}
            placeholder="What should the crew call you?"
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => setName(e.currentTarget.value)}
          />
        </label>
        <label className="ci-name-field">
          <span>Your ship</span>
          <input
            type="text"
            value={shipShown}
            maxLength={NAME_MAX}
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => setShip(e.currentTarget.value)}
          />
          <small>Nell christens her with this name before you sail.</small>
        </label>
        <button type="submit" hidden aria-hidden tabIndex={-1} />
      </form>
      <div className="ci-panel-actions">
        <button className="ci-primary" onClick={start}>
          Set sail
        </button>
        <button className="ci-secondary" onClick={bridge.back}>
          Back
        </button>
      </div>
    </OverlayShell>
  );
}

function CaptainCard({
  id,
  title,
  selected,
  onSelect,
}: {
  id: CaptainBody;
  title: string;
  selected: boolean;
  onSelect: (id: CaptainBody) => void;
}) {
  return (
    <button
      className={`ci-captain-card ${selected ? 'selected' : ''}`}
      role="radio"
      aria-checked={selected}
      aria-label={`${title}, ${id === 'man' ? 'bearded' : 'long-haired'}`}
      onClick={() => onSelect(id)}
    >
      <CaptainPortrait body={id} />
      <span>{title}</span>
      <small>
        {id === 'man' ? 'Ginger beard, loyal parrot, steady hand' : 'Long fair hair, sharp eyes, quick smile'}
      </small>
    </button>
  );
}
