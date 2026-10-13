import { useEffect, useState } from 'react';
import { ARCHIPELAGO, chapterParts } from './archipelago';

export interface UnchartedChapter {
  num: string;
  title: string;
  url: string;
}

/**
 * Course chapters with no island yet (PLAN §8.3): the live course README lists them, so they show
 * on the Chart as an uncharted island in the fog, with a link to read the chapter in the course.
 */
export function useUnchartedChapters(): UnchartedChapter[] {
  const [list, setList] = useState<UnchartedChapter[]>([]);
  useEffect(() => {
    let live = true;
    const charted = new Set(ARCHIPELAGO.map((i) => chapterParts(i.chapter).num));
    void import('../../learn/course/source')
      .then((m) => m.loadCatalog())
      .then((cat) => live && setList(cat.filter((c) => !charted.has(c.num))))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);
  return list;
}

/** Drawn in the chart's empty north-east corner, clear of the voyage route. */
export function UnchartedFog({ chapters }: { chapters: readonly UnchartedChapter[] }) {
  if (!chapters.length) return null;
  return (
    <g className="ci-arch-fog" transform="translate(878 86)">
      <ellipse className="bank" rx="96" ry="40" />
      <ellipse className="bank" cx="-30" cy="14" rx="70" ry="28" />
      <ellipse className="bank" cx="36" cy="-12" rx="62" ry="26" />
      <path className="isle" d="M-26 6c10-14 26-20 42-14 12 5 20 2 26 10-8 10-30 14-48 12-10-1-18-3-20-8z" />
      <text className="head" y="-22">
        Uncharted waters
      </text>
      {chapters.map((c, i) => (
        <a
          key={c.num}
          href={c.url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Chapter ${c.num}, ${c.title}: no island yet. Open in the course (opens in a new tab)`}
        >
          <text className="link" y={34 + i * 22}>
            {c.num} · {c.title} ↗
          </text>
        </a>
      ))}
    </g>
  );
}
