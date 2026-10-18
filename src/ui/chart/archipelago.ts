import { COURSE, courseIsland, onCourseSelected, type CourseMeta } from '../../course/catalog';
import type { ChartIsland } from '../bridge';

/** The archipelago chart's drawing size (SVG units). Island x/y are fractions of it. */
export const ARCH_W = 1000;
export const ARCH_H = 700;

const at = (x: number, y: number) => ({ x: x / ARCH_W, y: y / ARCH_H });

/** The game's part of an island on the chart: its name, place, look and starting status. */
type ChartPlace = Omit<ChartIsland, 'chapter' | 'minutes' | 'seal' | 'topics'>;

/** The Copilot Isles, in voyage order (each one teaches a chapter of the course). */
const PLACES: readonly ChartPlace[] = [
  {
    id: 'anchorage',
    name: 'Anchorage Cay',
    ...at(150, 505),
    status: 'current',
    blurb:
      'A tropical crescent with a turquoise lagoon and a little point lighthouse. Your voyage begins here.',
  },
  {
    id: 'meridian',
    name: 'Port Meridian',
    ...at(290, 300),
    status: 'locked',
    blurb: 'Terracotta terraces and harbour walls beneath a hilltop citadel.',
  },
  {
    id: 'thousand-bough',
    name: 'Thousand-Bough Isle',
    ...at(490, 165),
    status: 'locked',
    blurb: 'Misty jungle, waterfalls, and a treehouse village on one great banyan.',
  },
  {
    id: 'keelhaven',
    name: 'Keelhaven',
    ...at(720, 150),
    status: 'locked',
    blurb: 'A weathered old pirate town with a shipyard, drydock, and canal locks.',
  },
  {
    id: 'guildcrest',
    name: 'Guildcrest',
    ...at(870, 330),
    status: 'locked',
    blurb: 'Pine highlands, windmills, stone guildhalls, and a scriptorium abbey.',
  },
  {
    id: 'sunspire',
    name: 'Sunspire Sands',
    ...at(810, 520),
    status: 'locked',
    blurb: 'Desert mesas, saguaro, an oasis bazaar, and heliograph towers.',
  },
  {
    id: 'inkwell',
    name: 'Inkwell Bluffs',
    ...at(590, 555),
    status: 'locked',
    blurb: 'Whitewashed cliffs, bougainvillea, and the cartographers’ great chart table.',
  },
  {
    id: 'tidewheel',
    name: 'Tidewheel Caldera',
    ...at(370, 500),
    status: 'locked',
    blurb: 'Black sand, hot springs, and a clockwork lighthouse beside a tide mill.',
  },
];

/**
 * The chart's islands: the game's places with the course's part (the pack's `course.json` →
 * `islands`): the chapter each one teaches, its topics (the chapter's learning objectives), the
 * course's estimated minutes, and the Seal. An island the course doesn't use has none (uncharted).
 */
export function archipelagoFor(course: CourseMeta): readonly ChartIsland[] {
  return PLACES.map((p) => {
    const c = courseIsland(p.id, course);
    return {
      ...p,
      chapter: c?.label ?? '',
      minutes: c?.minutes ?? 0,
      ...(c?.seal ? { seal: c.seal } : {}),
      topics: c?.topics ?? [],
    };
  });
}

/** The current course's chart (a live binding: it follows the course picker). */
export let ARCHIPELAGO: readonly ChartIsland[] = archipelagoFor(COURSE);
onCourseSelected((c) => {
  ARCHIPELAGO = archipelagoFor(c);
});

/** "00 · Setup" → { num: '00', title: 'Setup' }. */
export function chapterParts(chapter: string): { num: string; title: string } {
  const [num, ...rest] = chapter.split('·');
  return { num: (num ?? '').trim(), title: rest.join('·').trim() };
}
