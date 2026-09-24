import type { ChartIsland } from '../bridge';

/** The archipelago chart's drawing size (SVG units). Island x/y are fractions of it. */
export const ARCH_W = 1000;
export const ARCH_H = 700;

const at = (x: number, y: number) => ({ x: x / ARCH_W, y: y / ARCH_H });

/**
 * The Copilot Isles, one island per course chapter, in voyage order. Topics follow each chapter's
 * learning objectives in copilot-app-for-beginners; minutes are the course's estimated times.
 */
export const ARCHIPELAGO: readonly ChartIsland[] = [
  {
    id: 'anchorage',
    name: 'Anchorage Cay',
    chapter: '00 · Setup',
    ...at(150, 505),
    status: 'current',
    blurb:
      'A tropical crescent with a turquoise lagoon and a little point lighthouse. Your voyage begins here.',
    minutes: 20,
    topics: [
      'Install the app and sign in',
      'Fork the course repository',
      'Connect it to a project session',
      'Send your first prompt',
    ],
  },
  {
    id: 'meridian',
    name: 'Port Meridian',
    chapter: '01 · Tour the App',
    ...at(290, 300),
    status: 'locked',
    blurb: 'Terracotta terraces and harbour walls beneath a hilltop citadel.',
    minutes: 30,
    topics: [
      'Why the app, not just your editor or CLI',
      'Key features, Chats, and settings',
      'Interactive, Plan, and Autopilot modes',
      'Picking a model and reasoning effort',
    ],
  },
  {
    id: 'thousand-bough',
    name: 'Thousand-Bough Isle',
    chapter: '02 · Sessions, Worktrees & Context',
    ...at(490, 165),
    status: 'locked',
    blurb: 'Misty jungle, waterfalls, and a treehouse village on one great banyan.',
    minutes: 30,
    topics: [
      'Worktree-backed sessions from a branch',
      'Why isolation protects your main branch',
      'Adding context with @, #, and /',
      'Local repo, worktree, or cloud sandbox',
    ],
  },
  {
    id: 'keelhaven',
    name: 'Keelhaven',
    chapter: '03 · Dev & GitHub Workflows',
    ...at(720, 150),
    status: 'locked',
    blurb: 'A weathered old pirate town with a shipyard, drydock, and canal locks.',
    minutes: 75,
    topics: [
      'Review panel, tests, and browser preview',
      'Regression tests and the rubber duck agent',
      'My work: from issue to pull request',
      'Fixing review comments and failing checks',
    ],
  },
  {
    id: 'guildcrest',
    name: 'Guildcrest',
    chapter: '04 · Skills & Custom Agents',
    ...at(870, 330),
    status: 'locked',
    blurb: 'Pine highlands, windmills, stone guildhalls, and a scriptorium abbey.',
    minutes: 60,
    topics: [
      'Instructions vs. skills vs. custom agents',
      'Updating the book-app-reviewer skill',
      'A read-only custom agent',
      'Validating a skill-guided change',
    ],
  },
  {
    id: 'sunspire',
    name: 'Sunspire Sands',
    chapter: '05 · MCP Servers & Plugins',
    ...at(810, 520),
    status: 'locked',
    blurb: 'Desert mesas, saguaro, an oasis bazaar, and heliograph towers.',
    minutes: 45,
    topics: [
      'What an MCP server is, and how it differs from a plugin',
      'Connecting a server and checking its tools',
      'Installing a plugin and using its skill',
      'Reviewing permissions and tool activity',
    ],
  },
  {
    id: 'inkwell',
    name: 'Inkwell Bluffs',
    chapter: '06 · Canvases',
    ...at(590, 555),
    status: 'locked',
    blurb: 'Whitewashed cliffs, bougainvillea, and the cartographers’ great chart table.',
    minutes: 80,
    topics: [
      'When a long chat thread gets in the way',
      'A session board with /create-canvas',
      'Keeping the plan and evidence visible',
    ],
  },
  {
    id: 'tidewheel',
    name: 'Tidewheel Caldera',
    chapter: '07 · Automations',
    ...at(370, 500),
    status: 'locked',
    blurb: 'Black sand, hot springs, and a clockwork lighthouse beside a tide mill.',
    minutes: 50,
    topics: [
      'When to automate recurring agent work',
      'On-demand local automations',
      'Schedules and run history',
      'Event triggers and cloud automations',
    ],
  },
];

/** "00 · Setup" → { num: '00', title: 'Setup' }. */
export function chapterParts(chapter: string): { num: string; title: string } {
  const [num, ...rest] = chapter.split('·');
  return { num: (num ?? '').trim(), title: rest.join('·').trim() };
}
