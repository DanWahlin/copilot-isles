import { STARFISH, starfishOn, type StarfishIsland } from '../../world/starfish/spots';

const ISLAND_NAMES: Record<StarfishIsland, string> = {
  anchorage: 'Anchorage Cay',
  meridian: 'Port Meridian',
};

/** A small coral starfish, drawn (no image to load). */
export function StarfishIcon({ dim = false }: { dim?: boolean }) {
  return (
    <svg className={`ci-starfish-icon${dim ? ' dim' : ''}`} viewBox="-10 -10 20 20" aria-hidden>
      <path
        d="M0-9.2 2.3-3.2 8.7-2.9 3.7 1.2 5.4 7.4 0 3.9-5.4 7.4-3.7 1.2-8.7-2.9-2.3-3.2Z"
        strokeLinejoin="round"
      />
      <circle r="1.6" />
    </svg>
  );
}

/** The purse's count for the island you're on: "3/7". */
export function StarfishCount({
  island,
  found,
  spot = false,
}: {
  island: { id: StarfishIsland; name: string };
  found: readonly string[];
  /** Lit while Wingman points it out. */
  spot?: boolean;
}) {
  const all = starfishOn(island.id);
  const got = all.filter((s) => found.includes(s.id)).length;
  const done = got === all.length;
  return (
    <span
      className={`ci-starfish${done ? ' done' : ''}${spot ? ' spot' : ''}`}
      title={`Starfish found on ${island.name}`}
      aria-label={`${got} of ${all.length} starfish found on ${island.name}`}
    >
      <StarfishIcon />
      {got}/{all.length}
    </span>
  );
}

/** The Logbook's Starfish tab: each island's starfish, found ones named, the rest as hints. */
export function StarfishLog({ found, here }: { found: readonly string[]; here: StarfishIsland | null }) {
  const islands = (Object.keys(ISLAND_NAMES) as StarfishIsland[]).sort((a, b) =>
    a === here ? -1 : b === here ? 1 : 0,
  );
  const total = STARFISH.filter((s) => found.includes(s.id)).length;
  return (
    <div className="ci-starfish-log">
      <p className="ci-starfish-intro">
        Starfish hide all over the islands. Walk into one to pick it up: each is worth 5 doubloons, and
        finding every one on an island earns 20 more. You've found {total} of {STARFISH.length}.
      </p>
      {islands.map((id) => {
        const all = starfishOn(id);
        const got = all.filter((s) => found.includes(s.id)).length;
        return (
          <section key={id}>
            <h3>
              {ISLAND_NAMES[id]}
              <small>
                {got}/{all.length}
                {got === all.length ? ' · all found!' : ''}
              </small>
            </h3>
            <ul>
              {all.map((s) => {
                const have = found.includes(s.id);
                return (
                  <li key={s.id} className={have ? 'found' : ''}>
                    <StarfishIcon dim={!have} />
                    <span>{s.name}</span>
                    <small>{have ? 'Found' : 'Still hiding'}</small>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
