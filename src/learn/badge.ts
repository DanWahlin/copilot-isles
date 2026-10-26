/**
 * The shareable Seal card and course certificate: the words on the image and the text to copy. Every
 * course word comes from the course's `course.json` (its title, repository, islands' labels and
 * seals); the game adds the captain, the ship and the date. Nothing is uploaded: the image is drawn
 * in the browser and saved by the player.
 */

export interface BadgeIsland {
  label: string;
  seal: string;
}

export interface BadgeInput {
  kind: 'seal' | 'course';
  /** For a Seal card: the seal it celebrates. */
  seal?: string;
  captain: string | null;
  ship: string;
  courseTitle: string;
  /** The course's home page (its repository on GitHub). */
  courseUrl: string;
  /** The course's charted islands in voyage order, each with its Seal. */
  islands: readonly BadgeIsland[];
  /** The seals the player holds. */
  earned: readonly string[];
  /** When it was earned (the card's date, in the player's own time zone). */
  date: Date;
}

export interface BadgeData {
  kind: 'seal' | 'course';
  heading: string;
  who: string;
  what: string;
  /** Each charted island's line and whether its Seal is held. */
  seals: readonly { label: string; seal: string; held: boolean }[];
  courseTitle: string;
  courseUrl: string;
  date: string;
  /** The text to copy: the same words, one paragraph, with the course's link. */
  text: string;
}

const GAME = 'Kraken Isles';

/** Whether every charted chapter's Seal is held (the course certificate). */
export function courseComplete(islands: readonly BadgeIsland[], earned: readonly string[]): boolean {
  return islands.length > 0 && islands.every((i) => earned.includes(i.seal));
}

export function badgeData(b: BadgeInput): BadgeData {
  const who = b.captain ? `Captain ${b.captain} of ${b.ship}` : `The captain of ${b.ship}`;
  const seals = b.islands.map((i) => ({ label: i.label, seal: i.seal, held: b.earned.includes(i.seal) }));
  const d = b.date;
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const island = b.islands.find((i) => i.seal === b.seal);
  const what =
    b.kind === 'course'
      ? `completed every charted chapter of ${b.courseTitle}`
      : `earned the ${b.seal ?? 'Seal'}${island ? ` for Chapter ${island.label}` : ''} of ${b.courseTitle}`;
  const heading = b.kind === 'course' ? 'Voyage complete' : (b.seal ?? 'Seal earned');
  const list = b.kind === 'course' ? `: ${seals.map((s) => s.seal).join(', ')}` : '';
  return {
    kind: b.kind,
    heading,
    who,
    what,
    seals,
    courseTitle: b.courseTitle,
    courseUrl: b.courseUrl,
    date,
    text: `${who} ${what} in ${GAME}${list} (${date}). ${b.courseUrl}`,
  };
}
