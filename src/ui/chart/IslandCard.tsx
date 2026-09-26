import type { ChartIsland } from '../bridge';
import { chapterParts } from './archipelago';
import { statusLabel } from './ArchipelagoMap';

/** The chart's side card for one island: what the chapter teaches and whether you can go there. */
export function IslandCard({
  island,
  islands,
  seals = [],
  onOpen,
}: {
  island: ChartIsland;
  islands: readonly ChartIsland[];
  /** Seals the captain has earned. */
  seals?: readonly string[];
  onOpen: () => void;
}) {
  const { num, title } = chapterParts(island.chapter);
  const index = islands.findIndex((i) => i.id === island.id);
  const before = index > 0 ? islands[index - 1]! : null;
  const prev = before ? chapterParts(before.chapter).num : null;
  const prevSealed = !!before?.seal && seals.includes(before.seal);
  return (
    <aside className={`ci-island-card ${island.status}`} aria-live="polite">
      <header>
        <span className="num" aria-hidden="true">
          {num}
        </span>
        <div>
          <p className="eyebrow">
            Chapter {num} · ~{island.minutes} min
          </p>
          <h3>{island.name}</h3>
        </div>
      </header>
      <p className="topic">{title}</p>
      <span className={`status ${island.status}`}>{statusLabel(island.status)}</span>
      <p className="blurb">{island.blurb}</p>
      <h4>What you’ll learn</h4>
      <ul>
        {island.topics.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
      {island.status === 'locked' ? (
        <p className="hint">
          {prevSealed
            ? `You’ve earned the ${before!.seal}. These waters are still being charted, so check back soon.`
            : prev
              ? `Finish Chapter ${prev} to set a course here.`
              : 'Not charted yet.'}
        </p>
      ) : (
        <button onClick={onOpen}>Open island chart</button>
      )}
    </aside>
  );
}
