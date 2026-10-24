import { ISLAND_IDS, islandEntry } from '../../islands/registry';
import { STARFISH, starfishOn, type StarfishIsland } from '../../world/starfish/spots';

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

/**
 * The purse's starfish to spend at the Model Market (docs/specs/MODEL-MARKET.md §3): a jar with a
 * starfish in it, and the number. The island's "found" count beside it doesn't change when you spend.
 */
export function StarfishPurse({ count }: { count: number }) {
  return (
    <span
      className="ci-starfish-purse"
      title="Starfish to spend at a Model Market stall"
      aria-label={`${count} starfish to spend`}
    >
      <svg className="ci-starfish-jar" viewBox="-10 -12 20 22" aria-hidden>
        <path className="glass" d="M-6-7h12v13a3 3 0 0 1-3 3h-6a3 3 0 0 1-3-3Z" />
        <rect className="lid" x="-7" y="-10" width="14" height="3.2" rx="1.2" />
        <path
          className="star"
          d="M0-4.6 1.15-1.6 4.35-1.45 1.85.6 2.7 3.7 0 1.95-2.7 3.7-1.85.6-4.35-1.45-1.15-1.6Z"
        />
      </svg>
      {count}
      <span className="ci-starfish-purse-word"> to spend</span>
    </span>
  );
}

/** The Logbook's Starfish tab: each island's starfish, found ones named, the rest as hints. */
export function StarfishLog({ found, here }: { found: readonly string[]; here: StarfishIsland | null }) {
  const islands = [...ISLAND_IDS].sort((a, b) => (a === here ? -1 : b === here ? 1 : 0));
  const total = STARFISH.filter((s) => found.includes(s.id)).length;
  return (
    <div className="ci-starfish-log">
      <p className="ci-starfish-intro">
        Starfish hide all over the islands. Walk into one to pick it up: each is worth 5 doubloons, and
        finding every one on an island earns 20 more. Each is also one to spend at the Model Market: there’s a
        stall on every island. You've found {total} of {STARFISH.length}.
      </p>
      {islands.map((id) => {
        const all = starfishOn(id);
        const got = all.filter((s) => found.includes(s.id)).length;
        return (
          <section key={id}>
            <h3>
              {islandEntry(id).name}
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
