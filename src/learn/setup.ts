import { COURSE } from '../course/catalog';

/**
 * "Your setup": what the player tells the game about their own copy of the course, so it can show
 * their values in place of the course's examples. All of it is optional (every form has Skip), kept in
 * the local save, and checked here on the device only. The game never sends it anywhere.
 *
 * - `os`: the computer they run the Copilot app on, for the course's keyboard shortcuts (Chapter 01 ·
 *   Prompts and Shortcuts: "Ctrl+R (or Cmd+R on macOS)"). Detected from the browser until they pick.
 * - `issue`: the number of their practice issue **Improve the empty state copy** (Chapter 02 ·
 *   Exercise: "Type `#3` … If your seeded issue has a different number, type `#` and select it").
 * - `branch`: the working branch of the session they started with **Create from** on
 *   `practice-empty-state-copy` (Chapter 02 · the session details show its working branch).
 * - `model`: what they chose in the model control (Chapter 01 · Try the Controls: "you can keep
 *   **Auto** or your current model"). The game never says anything about a model itself.
 */

export type OsId = 'mac' | 'windows' | 'linux';

export const OS_IDS: readonly OsId[] = ['mac', 'windows', 'linux'];
export const OS_NAMES: Readonly<Record<OsId, string>> = { mac: 'macOS', windows: 'Windows', linux: 'Linux' };

/** What the player picked in the model control. `name` is only what they typed for another model. */
export type ModelPick = { pick: 'auto' } | { pick: 'current' } | { pick: 'other'; name: string | null };

export interface SetupData {
  /** Null until they pick one: the game uses the browser's guess. */
  os: OsId | null;
  issue: number | null;
  branch: string | null;
  model: ModelPick | null;
}

export type SetupKind = keyof SetupData;
export const SETUP_KINDS: readonly SetupKind[] = ['os', 'issue', 'branch', 'model'];

export const EMPTY_SETUP: SetupData = { os: null, issue: null, branch: null, model: null };

/**
 * The course's practice issue and branch (the course pack's `course.json` → `practice`; for the
 * Copilot app course, Chapter 02 · Exercise: Start a Session from a Branch).
 */
export const COURSE_ISSUE = COURSE.practice.issue;
export const COURSE_ISSUE_TITLE = COURSE.practice.issueTitle;
export const COURSE_BRANCH = COURSE.practice.branch;

// ---- The computer ----

interface NavigatorLike {
  userAgentData?: { platform?: string } | null;
  platform?: string;
  userAgent?: string;
}

function osIn(s: string | undefined): OsId | null {
  if (!s) return null;
  if (/mac|darwin|iphone|ipad|ipod|\bios\b/i.test(s)) return 'mac';
  if (/\bwin/i.test(s)) return 'windows';
  if (/linux|x11|cros|chrome ?os|android|bsd/i.test(s)) return 'linux';
  return null;
}

/**
 * The browser's system: `navigator.userAgentData.platform` where there is one, then
 * `navigator.platform`, then the user agent. Nothing else is read. Unknown systems count as Windows
 * (the player can change it).
 */
export function detectOs(nav: NavigatorLike | undefined = globalThis.navigator): OsId {
  if (!nav) return 'windows';
  return osIn(nav.userAgentData?.platform) ?? osIn(nav.platform) ?? osIn(nav.userAgent) ?? 'windows';
}

const KEY_NAMES: Readonly<Record<string, Readonly<Record<OsId, string>>>> = {
  // The course's "Ctrl+R (or Cmd+R on macOS)".
  mod: { mac: 'Cmd', windows: 'Ctrl', linux: 'Ctrl' },
  ctrl: { mac: 'Control', windows: 'Ctrl', linux: 'Ctrl' },
  alt: { mac: 'Option', windows: 'Alt', linux: 'Alt' },
  meta: { mac: 'Cmd', windows: 'Win', linux: 'Super' },
  shift: { mac: 'Shift', windows: 'Shift', linux: 'Shift' },
  enter: { mac: 'Return', windows: 'Enter', linux: 'Enter' },
  backspace: { mac: 'Delete', windows: 'Backspace', linux: 'Backspace' },
  esc: { mac: 'Esc', windows: 'Esc', linux: 'Esc' },
  tab: { mac: 'Tab', windows: 'Tab', linux: 'Tab' },
};

/**
 * A shortcut written once (`mod+R`, `mod+shift+P`, `alt+Enter`) as the player's computer names it, in
 * the course's style: `Cmd+R` on macOS, `Ctrl+R` on Windows and Linux.
 */
export function formatKeys(combo: string, os: OsId): string {
  return combo
    .split('+')
    .map((k) => k.trim())
    .filter(Boolean)
    .map((k) => KEY_NAMES[k.toLowerCase()]?.[os] ?? (k.length === 1 ? k.toUpperCase() : k))
    .join('+');
}

// ---- Typed values ----

export type FieldParse<T> = { ok: true; value: T } | { ok: false; error: string };

/** GitHub issue numbers grow, but no practice fork gets near this. */
export const ISSUE_MAX = 9_999_999;
export const ISSUE_INPUT_MAX = 200;
const ISSUE_URL =
  /^https:\/\/[A-Za-z0-9.-]+\/[A-Za-z0-9-]+\/[A-Za-z0-9._-]+\/issues\/(\d+)(?:[/?#][\x21-\x7e]*)?$/;

/** Reads `3`, `#3`, `# 3`, or the issue's address on GitHub (`…/issues/3`). */
export function parseIssue(input: unknown): FieldParse<number> {
  if (typeof input !== 'string' || !input.trim()) return { ok: false, error: 'Type your issue’s number.' };
  const raw = input.trim();
  if (raw.length > ISSUE_INPUT_MAX) return { ok: false, error: 'That’s too long for an issue number.' };
  const m = /^#?\s?([0-9]+)$/.exec(raw) ?? ISSUE_URL.exec(raw);
  if (!m) return { ok: false, error: `Type just the number after the #, like ${COURSE_ISSUE}.` };
  const digits = m[1]!.replace(/^0+(?=\d)/, '');
  const n = digits.length > 7 ? Infinity : Number(digits);
  if (n < 1) return { ok: false, error: 'Issue numbers start at 1.' };
  if (n > ISSUE_MAX) return { ok: false, error: 'That number’s too big for a practice issue.' };
  return { ok: true, value: n };
}

/** Re-checks a saved issue number (old, hand-edited, or imported saves). */
export function cleanIssue(v: unknown): number | null {
  return typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= ISSUE_MAX ? v : null;
}

/** Longer than any branch name the app gives a session. */
export const BRANCH_MAX = 100;
export const BRANCH_INPUT_MAX = 200;
const BRANCH_CHARS = /^[A-Za-z0-9._/+-]+$/;

/**
 * Reads a branch name the way Git allows it (`git check-ref-format --branch`), limited to letters,
 * digits, and `. _ / + -`. A pasted `refs/heads/` or `origin/` isn't part of the name.
 */
export function parseBranch(input: unknown): FieldParse<string> {
  if (typeof input !== 'string' || !input.trim()) return { ok: false, error: 'Type your branch’s name.' };
  let b = input.trim();
  if (b.length > BRANCH_INPUT_MAX) return { ok: false, error: 'That’s too long for a branch name.' };
  if (/\s/.test(b)) return { ok: false, error: 'Branch names don’t have spaces.' };
  b = b.replace(/^refs\/heads\//, '').replace(/^origin\//, '');
  if (!BRANCH_CHARS.test(b))
    return { ok: false, error: `Use letters, digits, and . _ / + - only, like ${COURSE_BRANCH}.` };
  if (b.length > BRANCH_MAX)
    return { ok: false, error: `Branch names here can be up to ${BRANCH_MAX} characters.` };
  if (b.startsWith('-') || b.startsWith('/') || b.endsWith('/') || b.endsWith('.'))
    return { ok: false, error: 'A branch name can’t start with - or /, or end with / or a dot.' };
  if (b.includes('..') || b.includes('//'))
    return { ok: false, error: 'A branch name can’t have .. or // in it.' };
  if (b.split('/').some((part) => part.startsWith('.') || part.endsWith('.lock')))
    return { ok: false, error: 'No part of a branch name can start with a dot or end in .lock.' };
  return { ok: true, value: b };
}

/** Re-checks a saved branch name. */
export function cleanBranch(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const p = parseBranch(v);
  return p.ok && p.value === v ? p.value : null;
}

export const MODEL_NAME_MAX = 40;

/**
 * A typed model name as one clean line: letters, digits, spaces, and `. - _ ( ) / : +`. No `*`, `` ` ``
 * or brackets, so it can't turn into bold, code, or a link where the game shows it.
 */
export function cleanModelName(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v
    .replace(/[^\p{L}\p{N} ._()/:+-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return s ? Array.from(s).slice(0, MODEL_NAME_MAX).join('').trim() : null;
}

/** Re-checks a saved model choice. */
export function cleanModel(v: unknown): ModelPick | null {
  if (!v || typeof v !== 'object') return null;
  const m = v as { pick?: unknown; name?: unknown };
  if (m.pick === 'auto' || m.pick === 'current') return { pick: m.pick };
  if (m.pick === 'other') return { pick: 'other', name: cleanModelName(m.name) };
  return null;
}

export function cleanOs(v: unknown): OsId | null {
  return typeof v === 'string' && (OS_IDS as readonly string[]).includes(v) ? (v as OsId) : null;
}

/** Re-checks a whole saved setup (anything bad is dropped, so old and odd saves still load). */
export function cleanSetup(v: unknown): SetupData {
  if (!v || typeof v !== 'object') return { ...EMPTY_SETUP };
  const s = v as Partial<Record<SetupKind, unknown>>;
  return {
    os: cleanOs(s.os),
    issue: cleanIssue(s.issue),
    branch: cleanBranch(s.branch),
    model: cleanModel(s.model),
  };
}

// ---- Showing it ----

/** How the game names the player's model choice (never more than they told it). */
export function modelLabel(m: ModelPick | null): string {
  const names = COURSE.setup.model.names;
  if (!m) return names.none;
  if (m.pick === 'auto') return names.auto;
  if (m.pick === 'current') return names.current;
  return m.name ?? names.other;
}

/** Script steps and quizzes that only fit some answers (a model quiz for Auto, another for a picked one). */
export type SetupWhen = 'model:auto' | 'model:picked';

export function setupMatches(s: SetupData, when: SetupWhen): boolean {
  if (when === 'model:auto') return s.model?.pick === 'auto';
  return s.model?.pick === 'current' || s.model?.pick === 'other';
}

/**
 * Fills the player's values into authored text:
 * - `{key:mod+R}` → the shortcut on their computer (`Cmd+R` or `Ctrl+R`),
 * - `{os}` → macOS, Windows, or Linux,
 * - `{issue}` → `#N` (the course's `#3` until they give theirs),
 * - `{branch}` → their session's branch (the course's `practice-empty-state-copy` until then),
 * - `{model}` → their model choice.
 */
export function fillSetup(text: string, s: SetupData, detected: OsId): string {
  if (!text.includes('{')) return text;
  const os = s.os ?? detected;
  return text
    .replace(/\{key:([^}\s]+)\}/g, (_, combo: string) => formatKeys(combo, os))
    .replaceAll('{os}', OS_NAMES[os])
    .replaceAll('{issue}', `#${s.issue ?? COURSE_ISSUE}`)
    .replaceAll('{branch}', s.branch ?? COURSE_BRANCH)
    .replaceAll('{model}', modelLabel(s.model));
}

/** Removes inline code and bold markers from setup-filled text used in accessible names. */
export function plainSetupText(text: string): string {
  return text.replaceAll('`', '').replaceAll('**', '');
}
