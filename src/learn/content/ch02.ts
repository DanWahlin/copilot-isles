import { courseRefs } from '../course/refs';
import type { ChapterContent, Rect } from '../types';

const ch = '02-sessions-worktrees-context' as const;
const src = courseRefs(ch);

/** A rect in pixels on a W × H course image → normalized. */
const px = (x: number, y: number, w: number, h: number, W: number, H: number): Rect => [
  x / W,
  y / H,
  w / W,
  h / H,
];

// Section hashes from `npm run course:refs -- 02` (course snapshot 86bb298).
const S = {
  objectives: src('learning-objectives', '69a77e05c88a'),
  studio: src('from-the-studio-one-studio-many-recording-booths', 'a455b42bc23e'),
  worktree: src('what-is-a-git-worktree', '4ccaddd0c3f4'),
  why: src('why-the-github-copilot-app-uses-worktrees', 'b28050c33200'),
  where: src('where-a-session-runs', 'a55a83c1ff55'),
  syntax: src('context-syntax', 'e41d9116c6a3'),
  attach: src('attaching-files', '0d9a0a736d27'),
  slash: src('slash-commands', 'f7db6b7416aa'),
  exStart: src('exercise-start-a-session-from-a-branch-and-attach-an-issue', '6db80a8de549'),
  exCheck: src('exercise-check-the-session-with-slash-commands', '0eb8259b8b60'),
  noBranches: src('i-dont-see-the-practice-branches', 'c9d42b831ad4'),
  wrongFolder: src('the-session-edited-the-wrong-folder', '10e8716f1e87'),
  noContext: src('context-or-chronicle-is-missing', '606793a69536'),
  collided: src('two-previews-collided', '5140d326c5b7'),
  takeaways: src('key-takeaways', 'f1ddff6b1420'),
  assignment: src('assignment', 'a6fd57783531'),
  next: src('whats-next', '6b31efae2fea'),
} as const;

// Pinned screenshots (`npm run course:refs -- 02`): the files the rects and alt text describe.
const IMG = {
  where: { src: 'course/ch02/app-where-sessions-run.webp', hash: 'd975962f610a' },
  context: { src: 'course/ch02/app-context-information.webp', hash: 'f4ba435ac73a' },
  plan: { src: 'course/ch02/app-plan-from-issue.webp', hash: '2edcea70d180' },
} as const;

// app-where-sessions-run (1000 × 480): the "Where to work" menu. **New worktree** carries the
// course's blue highlight, so it's never the right answer (docs/specs/ISLAND-02 §1.3).
const W = (x: number, y: number, w: number, h: number) => px(x, y, w, h, 1000, 480);
const WHERE = {
  newWorktree: W(262, 224, 292, 62),
  currentCheckout: W(262, 290, 292, 52),
  cloud: W(262, 348, 292, 52),
  baseBranch: W(262, 414, 292, 42),
  selector: W(260, 140, 186, 36),
  project: W(30, 140, 222, 36),
  mode: W(64, 92, 90, 30),
} as const;

// app-context-information (1920 × 1080): the usage popup. The **Context** bar carries the course's
// highlight: a distractor only.
const C = (x: number, y: number, w: number, h: number) => px(x, y, w, h, 1920, 1080);
const USAGE = {
  plan: C(1362, 380, 536, 46),
  session: C(1362, 436, 536, 46),
  tokens: C(1362, 494, 536, 76),
  context: C(1555, 588, 346, 82),
  viewUsage: C(1362, 938, 260, 44),
  credits: C(1652, 1008, 46, 40),
} as const;

// app-plan-from-issue (1568 × 1080): the Review plan box and the Plan tab.
const P = (x: number, y: number, w: number, h: number) => px(x, y, w, h, 1568, 1080);
const REVIEW = {
  approve: P(34, 880, 628, 38),
  exitPlan: P(34, 920, 628, 38),
  suggest: P(34, 960, 628, 38),
  continue: P(543, 1010, 114, 34),
  planTab: P(714, 12, 122, 34),
} as const;

/** Island 02 · Thousand-Bough Isle: Chapter 02 (Sessions, Worktrees, and Context), in the chapter's order. */
export const CH02: ChapterContent = {
  chapter: ch,
  images: [
    {
      id: 'ch02/recording-booths-worktrees',
      src: 'course/ch02/recording-booths-worktrees.webp',
      hash: 'f73d466f75aa',
      width: 1536,
      height: 1024,
      alt: 'A recording studio with separate booths for each musician, each recording their own part of the same song',
    },
    {
      id: 'ch02/one-repo-many-worktrees',
      src: 'course/ch02/one-repo-many-worktrees.webp',
      hash: 'cec07bef34ef',
      width: 1536,
      height: 1024,
      alt: 'One repository with main and three worktrees, Feature, Bug Fix and Docs, each with its own folder and branch',
    },
    {
      id: 'ch02/app-where-sessions-run',
      src: IMG.where.src,
      hash: IMG.where.hash,
      width: 1000,
      height: 480,
      alt: 'The Where to work menu below the prompt box: New worktree (highlighted), Current checkout, Cloud, and Base branch',
    },
    {
      id: 'ch02/app-create-from-icon',
      src: 'course/ch02/app-create-from-icon.webp',
      hash: '1fa97e5f817e',
      width: 1034,
      height: 240,
      alt: 'The sidebar with the pointer on the Create from icon next to the copilot-app-for-beginners project',
    },
    {
      id: 'ch02/app-plan-from-issue',
      src: IMG.plan.src,
      hash: IMG.plan.hash,
      width: 1568,
      height: 1080,
      alt: 'A session started from issue #3 with its plan in the Plan tab, and the Review plan box with three options in place of the prompt box',
    },
    {
      id: 'ch02/app-book-app-empty-state-before',
      src: 'course/ch02/app-book-app-empty-state-before.webp',
      hash: 'd133ec59b051',
      width: 1568,
      height: 1080,
      alt: 'The Book App preview at 127.0.0.1:5173 searching zzzz-no-match: 0 books shown, and an empty state that says No results, Try again',
    },
    {
      id: 'ch02/app-chronicle-standup-output',
      src: 'course/ch02/app-chronicle-standup-output.webp',
      hash: 'acd45a749f06',
      width: 1568,
      height: 1080,
      alt: 'The reply to /chronicle standup, listing the session’s empty-state copy work under Done',
    },
    {
      id: 'ch02/app-context-information',
      src: IMG.context.src,
      hash: IMG.context.hash,
      width: 1920,
      height: 1080,
      alt: 'The usage popup below the prompt box: Plan, Session in AI credits, Tokens sent and received, and the expanded Context breakdown',
    },
    {
      id: 'shared/assignment',
      src: 'course/shared/assignment.webp',
      hash: 'daffcd642925',
      width: 1200,
      height: 565,
      alt: 'The course’s Assignment banner',
    },
  ],

  // One check per stop, on what's specific to the app or easy to mix up. Hotspots never make a box
  // with the course's own highlight the right answer.
  quizzes: [
    {
      id: 'K2.1',
      type: 'multi',
      prompt: 'What can a project session have of its own? Select all that apply.',
      options: [
        { id: 'branch', text: 'Its own branch' },
        { id: 'folder', text: 'Its own working folder' },
        { id: 'plan-diff', text: 'A plan and a diff' },
        { id: 'terminal-preview', text: 'Terminal output and a browser preview' },
        { id: 'github', text: 'GitHub context' },
        {
          id: 'account',
          text: 'Its own GitHub account',
          feedback:
            'You sign in once. The chapter’s list is branch, folder, plan, diff, terminal output, preview and GitHub context.',
        },
        {
          id: 'fork',
          text: 'A new fork of your repository',
          feedback:
            'A fork is your own copy on GitHub, from Chapter 00. A session works on a branch and folder of your project.',
        },
      ],
      answers: ['branch', 'folder', 'plan-diff', 'terminal-preview', 'github'],
      explain: {
        correct:
          'Right. A session can hold its own branch, working folder, plan, diff, terminal output, browser preview and GitHub context.',
        wrong: 'Five are true. Accounts and forks belong to you and GitHub, not to one session.',
      },
      hints: [
        'Think of everything one task needs while it’s being worked on.',
        'Two of these happen once for you, not once per session.',
        'Everything except the account and the fork.',
      ],
      source: S.objectives,
    },
    {
      id: 'K2.2',
      type: 'mc',
      prompt: 'In Lyra’s studio, what’s a recording booth like?',
      options: [
        { id: 'worktree', text: 'A worktree: the same song, its own folder and branch' },
        {
          id: 'chat',
          text: 'A chat: a quick question, nothing recorded',
          feedback: 'A booth records a real part of the song. Each musician works apart, on the same song.',
        },
        {
          id: 'model',
          text: 'The model: who sings',
          feedback: 'The booth isn’t the singer. It’s the separate space they record in.',
        },
        {
          id: 'pr',
          text: 'A pull request: the final mix',
          feedback: 'The mix comes later. The booth is where each part is recorded on its own.',
        },
      ],
      answer: 'worktree',
      explain: {
        correct:
          'Right. A worktree is connected to the same repository, like the same song, but it has its own folder and branch.',
        wrong: 'Each booth keeps one part apart while the whole band plays the same song.',
      },
      hints: [
        'What does the booth keep apart?',
        'Same song, separate space.',
        'A worktree: the same song, its own folder and branch.',
      ],
      source: S.studio,
    },
    {
      id: 'M2.1',
      type: 'matching',
      prompt: 'Match each problem to what a worktree-backed session gives you.',
      pairs: [
        {
          left: { id: 'same-folder', text: 'Several tasks edit the same folder' },
          right: { id: 'separate', text: 'Each task gets a separate folder' },
        },
        {
          left: { id: 'branch-state', text: 'It’s easy to lose track of branch state' },
          right: { id: 'visible', text: 'The session’s branch is visible in the app' },
        },
        {
          left: { id: 'mixed', text: 'Tests and diffs mix together' },
          right: { id: 'tied', text: 'Diffs stay tied to the session' },
        },
        {
          left: { id: 'compare', text: 'It’s harder to compare work' },
          right: { id: 'inspect', text: 'It’s easier to inspect and approve' },
        },
      ],
      explain: {
        correct:
          'That’s the chapter’s table. With a worktree-backed session, you can even run sessions in parallel without mixing their file changes.',
        wrong: 'Each problem has the fix that answers it directly: folders, branches, diffs, then reviewing.',
      },
      hints: [
        'Match each problem to the fix that names the same thing.',
        'The folder problem is fixed by folders, and the diff problem by diffs.',
        'Same folder → separate folder · branch state → branch visible · mixed diffs → diffs tied · compare → inspect and approve.',
      ],
      source: S.why,
    },
    {
      id: 'H2.1',
      type: 'hotspot',
      image: 'ch02/app-where-sessions-run',
      mask: [],
      prompt: 'Where do you set the branch that a new worktree starts from?',
      targets: [
        { id: 'base-branch', rect: WHERE.baseBranch, label: 'Base branch', correct: true },
        {
          id: 'new-worktree',
          rect: WHERE.newWorktree,
          label: 'New worktree',
          feedback:
            'That blue box is the course’s highlight. **New worktree** says *where* the work happens. The starting branch is set further down.',
        },
        {
          id: 'current-checkout',
          rect: WHERE.currentCheckout,
          label: 'Current checkout',
          feedback: '**Current checkout** works in your existing clone. It doesn’t start a new branch.',
        },
        {
          id: 'cloud',
          rect: WHERE.cloud,
          label: 'Cloud',
          feedback: '**Cloud** runs the session in a cloud sandbox. The starting branch is its own setting.',
        },
        {
          id: 'workspace-selector',
          rect: WHERE.selector,
          label: 'The workspace selector',
          feedback: 'This opens the menu. The setting you want is inside it.',
        },
      ],
      explain: {
        correct: 'Right. **Base branch** sets the branch that a new worktree starts from.',
        wrong: 'It’s in the same menu, below the three places a session can run.',
      },
      hints: [
        'It’s in the menu, but it isn’t one of the three places.',
        'Look below **Cloud**.',
        'Select **Base branch**.',
      ],
      source: src('where-a-session-runs', 'a55a83c1ff55', IMG.where),
    },
    {
      id: 'M2.2',
      type: 'matching',
      prompt: 'Hoist the right flag: match each symbol to what it brings.',
      pairs: [
        { left: { id: 'at', text: '`@`' }, right: { id: 'files', text: 'Files or folders' } },
        { left: { id: 'hash', text: '`#`' }, right: { id: 'issues', text: 'Issues or pull requests' } },
        { left: { id: 'slash', text: '`/`' }, right: { id: 'commands', text: 'Slash commands' } },
        {
          left: { id: 'amp', text: '`&`' },
          right: { id: 'sessions', text: 'Other sessions, when the prompt box offers it' },
        },
      ],
      explain: {
        correct: 'Right. And bring the smallest amount of useful context. Less is often more.',
        wrong: 'Think of the examples: `@samples/book-app-web/src`, `#12`, `/chronicle standup`.',
      },
      hints: [
        'Each symbol has one job in the prompt box.',
        '`#12` is an issue, and `@samples/book-app-web/src` is a folder.',
        '`@` files or folders · `#` issues or pull requests · `/` slash commands · `&` other sessions.',
      ],
      source: S.syntax,
    },
    {
      id: 'H2.3',
      type: 'hotspot',
      image: 'ch02/app-plan-from-issue',
      mask: [],
      prompt: 'The course has you leave plan mode and write your own prompts. Which option is that?',
      targets: [
        {
          id: 'exit-plan',
          rect: REVIEW.exitPlan,
          label: 'Exit plan mode and I will prompt myself',
          correct: true,
        },
        {
          id: 'approve',
          rect: REVIEW.approve,
          label: 'Approve and implement this plan',
          feedback: 'That approves the plan and implements it in **Autopilot**.',
        },
        {
          id: 'suggest',
          rect: REVIEW.suggest,
          label: 'Suggest changes to the plan',
          feedback: 'That asks for changes to the plan.',
        },
        {
          id: 'continue',
          rect: REVIEW.continue,
          label: 'Continue',
          feedback: 'Pick an option first. **Continue** confirms it.',
        },
        {
          id: 'plan-tab',
          rect: REVIEW.planTab,
          label: 'Plan tab',
          feedback: 'That’s where the plan opens.',
        },
      ],
      explain: {
        correct:
          'Right. **Exit plan mode and I will prompt myself** takes the session back to **Interactive**, so you continue with your own prompts.',
        wrong: 'It’s one of the three options in the **Review plan** box.',
      },
      hints: [
        'Look in the **Review plan** box, where the prompt box usually is.',
        'You don’t want to approve the plan or change it.',
        'Select **Exit plan mode and I will prompt myself**.',
      ],
      source: src('exercise-start-a-session-from-a-branch-and-attach-an-issue', '6db80a8de549', IMG.plan),
    },
    {
      id: 'H2.6',
      type: 'hotspot',
      image: 'ch02/app-context-information',
      mask: [],
      prompt: 'Where do you see how many AI credits this session has used?',
      targets: [
        { id: 'session', rect: USAGE.session, label: 'Session', correct: true },
        {
          id: 'plan',
          rect: USAGE.plan,
          label: 'Plan',
          feedback: '**Plan** is the share of your plan you’ve used.',
        },
        {
          id: 'tokens',
          rect: USAGE.tokens,
          label: 'Tokens',
          feedback: '**Tokens** counts what went to the model and what came back.',
        },
        {
          id: 'context',
          rect: USAGE.context,
          label: 'Context',
          feedback:
            'That blue box is the course’s highlight. **Context** shows how the context window is divided.',
        },
        {
          id: 'view-usage',
          rect: USAGE.viewUsage,
          label: 'View usage and plan...',
          feedback: 'That opens your account’s usage and billing details.',
        },
      ],
      explain: {
        correct: 'Right. **Session** shows the AI credits the session has used.',
        wrong: 'Each row of the usage popup shows one thing. Look for the one about this session.',
      },
      hints: [
        'Each row of the popup has its own job.',
        'It’s named after what you’re asking about.',
        'Select **Session**.',
      ],
      source: src('exercise-check-the-session-with-slash-commands', '0eb8259b8b60', IMG.context),
    },

    // ---- The Canopy Trial (T2): the four key takeaways and the objectives ----
    {
      id: 'T2.1',
      type: 'mc',
      prompt: 'What’s a session in the app?',
      options: [
        { id: 'workspace', text: 'A focused agent workspace with its own branch, diff and history' },
        { id: 'chat', text: 'A chat that can’t change files' },
        { id: 'account', text: 'A copy of your GitHub account' },
        { id: 'scheduled', text: 'A saved prompt that runs on a schedule' },
      ],
      answer: 'workspace',
      explain: {
        correct: 'Right. Sessions are focused agent workspaces with their own branch, diff and history.',
        wrong: 'Think of the crews in their treehouses: one task, its own space.',
      },
      hints: ['Think of one crew’s treehouse.', 'It holds a branch, a diff and a history.', ''],
      source: S.takeaways,
    },
    {
      id: 'T2.2',
      type: 'mc',
      prompt: 'Which workspace keeps a session’s changes out of your main checkout, and is the safe default?',
      options: [
        { id: 'new', text: '**New worktree**' },
        { id: 'current', text: '**Current checkout**' },
        { id: 'cloud', text: '**Cloud**' },
        { id: 'last', text: 'Whichever you picked last' },
      ],
      answer: 'new',
      explain: {
        correct: 'Right. A new worktree keeps changes out of your main checkout. When in doubt, choose it.',
        wrong: 'The app remembers your last choice, but the safe default is one place in particular.',
      },
      hints: [
        'It’s what the course leans on from here.',
        'It gives the session its own folder and branch.',
        '',
      ],
      source: S.takeaways,
    },
    {
      id: 'T2.3',
      type: 'matching',
      prompt: 'Match each need to where the session runs.',
      pairs: [
        {
          left: { id: 'apart', text: 'Keep changes, branches and diffs apart from main' },
          right: { id: 'new', text: '**New worktree**' },
        },
        {
          left: { id: 'quick', text: 'A quick, low-stakes look that may touch your folder' },
          right: { id: 'current', text: '**Current checkout**' },
        },
        {
          left: { id: 'offload', text: 'Offload the work and keep your machine untouched' },
          right: { id: 'cloud', text: '**Cloud**' },
        },
      ],
      explain: {
        correct: 'Right. The choices trade speed against isolation.',
        wrong: 'Which one has its own folder, which uses yours, and which isn’t on your machine at all?',
      },
      hints: ['Speed against isolation.', 'One of them doesn’t run on your machine.', ''],
      source: S.where,
    },
    {
      id: 'T2.4',
      type: 'scenario',
      situation: 'Two sessions in separate worktrees both start the Book App’s preview on port `5173`.',
      prompt: 'What happens?',
      options: [
        { id: 'collide', text: 'They can collide: worktrees separate files and branches, not ports' },
        { id: 'nothing', text: 'Nothing. Worktrees separate everything' },
        { id: 'overwrite', text: 'The second session’s files overwrite the first’s' },
      ],
      answer: 'collide',
      explain: {
        correct:
          'Right. Stop one server, or start the second on port `5174`. Use different ports for parallel previews.',
        wrong: 'Remember the Lookout on the Spire: two crews, one port.',
      },
      hints: ['Remember the Spire’s bridge.', 'What do worktrees not separate?', ''],
      source: S.collided,
    },
    {
      id: 'T2.5',
      type: 'matching',
      prompt: 'Match each example to what it brings into the prompt.',
      pairs: [
        {
          left: { id: 'folder', text: '`@samples/book-app-web/src`' },
          right: { id: 'files', text: 'Files or folders' },
        },
        { left: { id: 'issue', text: '`#12`' }, right: { id: 'issues', text: 'Issues or pull requests' } },
        {
          left: { id: 'cmd', text: '`/chronicle standup`' },
          right: { id: 'commands', text: 'Slash commands' },
        },
        {
          left: { id: 'session', text: '`&`, then a session from the list' },
          right: { id: 'sessions', text: 'Other sessions' },
        },
      ],
      explain: {
        correct: 'Right. And the smallest amount of useful context is usually best.',
        wrong: 'Look at each example’s first character.',
      },
      hints: ['Look at the first character of each.', 'Ines’s four flags.', ''],
      source: S.syntax,
    },
    {
      id: 'T2.6',
      type: 'ordering',
      prompt: 'Put the first steps of the exercise in order.',
      items: [
        { id: 'create-from', text: 'Point to the project and select **Create from**' },
        { id: 'branches', text: 'Open **Branches** and pick `practice-empty-state-copy`' },
        { id: 'mode', text: 'Set **Mode** to **Plan**' },
        { id: 'issue', text: 'Type `#3` and pick the issue' },
        { id: 'send', text: 'Send the prompt' },
        { id: 'review', text: 'Review the plan' },
      ],
      explain: {
        correct: 'Right. That’s how Rook’s crew starts a session from a branch with an issue attached.',
        wrong: 'You start the session from the branch first, then set it up and ask for a plan.',
      },
      hints: ['The session has to exist before you can type in it.', 'The mode is set before you send.', ''],
      source: S.exStart,
    },
    {
      id: 'T2.7',
      type: 'hotspot',
      image: 'ch02/app-where-sessions-run',
      mask: [],
      prompt: 'Your Chapter 00 session worked straight in your existing clone. Which option was that?',
      targets: [
        { id: 'current-checkout', rect: WHERE.currentCheckout, label: 'Current checkout', correct: true },
        {
          id: 'new-worktree',
          rect: WHERE.newWorktree,
          label: 'New worktree',
          feedback: 'That’s the course’s highlight, and the safe default. It gives a session its own folder.',
        },
        {
          id: 'cloud',
          rect: WHERE.cloud,
          label: 'Cloud',
          feedback: '**Cloud** runs off your machine, in a cloud sandbox.',
        },
        {
          id: 'base-branch',
          rect: WHERE.baseBranch,
          label: 'Base branch',
          feedback: '**Base branch** sets where a new worktree starts. It isn’t a place to work.',
        },
      ],
      explain: {
        correct:
          'Right. **Current checkout** works directly in your existing clone, with no separate folder.',
        wrong: 'Which option uses the folder you already have?',
      },
      hints: ['It uses the folder you already have.', 'It isn’t the highlighted one.', ''],
      source: src('where-a-session-runs', 'a55a83c1ff55', IMG.where),
    },
    {
      id: 'T2.8',
      type: 'hotspot',
      image: 'ch02/app-context-information',
      mask: [],
      prompt: 'Where do you see the tokens the session sent to the model and got back?',
      targets: [
        { id: 'tokens', rect: USAGE.tokens, label: 'Tokens', correct: true },
        {
          id: 'session',
          rect: USAGE.session,
          label: 'Session',
          feedback: '**Session** shows AI credits, not tokens.',
        },
        { id: 'plan', rect: USAGE.plan, label: 'Plan', feedback: '**Plan** is your plan’s use.' },
        {
          id: 'context',
          rect: USAGE.context,
          label: 'Context',
          feedback: 'That’s the course’s highlight: how the context window is divided.',
        },
        {
          id: 'credits-icon',
          rect: USAGE.credits,
          label: 'The AI credits icon',
          feedback: 'That icon opens this popup. The numbers are inside it.',
        },
      ],
      explain: {
        correct: 'Right. **Tokens** shows what went to the model (up arrow) and what came back (down arrow).',
        wrong: 'Look for the row with arrows.',
      },
      hints: ['Look for arrows up and down.', 'It’s between Session and Context.', ''],
      source: src('exercise-check-the-session-with-slash-commands', '0eb8259b8b60', IMG.context),
    },
    {
      id: 'T2.9',
      type: 'mc',
      prompt: 'What does `/chronicle standup` do?',
      options: [
        { id: 'recap', text: 'Summarizes your work from the last day' },
        { id: 'tokens', text: 'Shows the session’s token use' },
        { id: 'branch', text: 'Starts a new session on a branch' },
        { id: 'list', text: 'Lists every slash command' },
      ],
      answer: 'recap',
      explain: {
        correct:
          'Right. `/chronicle standup` is your recap. `/context` shows tokens, context and AI credits.',
        wrong: 'Pip keeps the chronicle: what’s a chronicle for?',
      },
      hints: ['Pip’s ledgers.', 'A standup is a short daily recap.', ''],
      source: S.slash,
    },
  ],

  pages: [
    {
      id: 'pg2.session',
      title: 'What a session holds',
      caption:
        'A session is more than a chat. It can have its own branch, working folder, plan, diff, terminal output, browser preview and GitHub context.',
      source: S.objectives,
    },
    {
      id: 'pg2.booths',
      title: 'One studio, many booths',
      image: 'ch02/recording-booths-worktrees',
      caption:
        'Three musicians, one song, each in a soundproof booth: they record apart or at the same time, and the takes are mixed later. A worktree is a booth: the same repository, but its own folder and branch.',
      source: S.studio,
    },
    {
      id: 'pg2.worktree',
      title: 'What’s a Git worktree?',
      image: 'ch02/one-repo-many-worktrees',
      caption:
        'A **Git worktree** is another working folder for the same repository, usually on its own branch. You can work on several tasks without stashing changes or switching branches in one folder.',
      source: S.worktree,
    },
    {
      id: 'pg2.why',
      title: 'Why the app uses worktrees',
      caption:
        'Without isolation, tasks edit the same folder, branch state gets lost, and tests and diffs mix. With a worktree-backed session, each task gets its own folder, its branch shows in the app, and its diff stays with it, so it’s easier to inspect and approve. Sessions can run in parallel without mixing changes, but this chapter takes them one at a time.',
      source: S.why,
    },
    {
      id: 'pg2.where',
      title: 'Where a session runs',
      image: 'ch02/app-where-sessions-run',
      caption:
        'Start a session with **+**, and the workspace selector below the prompt box picks where it runs: **New worktree** (its own folder and branch, the safe default), **Current checkout** (your existing clone) or **Cloud** (a cloud sandbox on GitHub’s hosted infrastructure). **Base branch** sets where a new worktree starts. The app remembers your last choice, so switch back to **New worktree** now. A session started with **Create from** always gets a new worktree.',
      source: S.where,
    },
    {
      id: 'pg2.parallel',
      title: 'Parallel sessions',
      caption:
        'Three crews, three channels, one spring: one repository with a worktree for each session. Each session’s changes stay in its own channel, so they don’t mix.',
      source: S.why,
    },
    {
      id: 'pg2.ports',
      title: 'Not ports',
      image: 'ch02/app-book-app-empty-state-before',
      caption:
        'Worktrees separate files and branches, not everything. Dev servers, databases and ports can still collide. The preview runs on port `5173`: for a second preview, stop one server or start the other on `5174`.',
      source: S.collided,
    },
    {
      id: 'pg2.context-syntax',
      title: 'Four flags',
      caption:
        '`@` brings files or folders (`@samples/book-app-web/src`), `#` issues or pull requests (`#12`), `/` slash commands (`/chronicle standup`), and `&` other sessions, when the prompt box offers it. Bring the smallest amount of useful context: less is often more.',
      source: S.syntax,
    },
    {
      id: 'pg2.attach',
      title: 'Drop a file on a session',
      caption:
        'Besides `@`, you can drag files from your computer and drop them onto a session or agent in the sidebar. It’s handy for files that aren’t in the repository.',
      source: S.attach,
    },
    {
      id: 'pg2.slash',
      title: 'Slash commands',
      caption:
        'Type `/` in the prompt box and read the palette: commands vary by app version, plugins, skills and policy. This chapter needs two. `/chronicle standup` summarizes your last day’s work, and `/context` opens the usage popup.',
      source: S.slash,
    },
    {
      id: 'pg2.more-commands',
      title: 'More slash commands',
      caption:
        'You may also see `/agent`, `/collect-debug-logs`, `/create-canvas`, `/orchestrate`, `/research`, `/review`, `/rubber-duck`, `/skills`, `/usage`, and a command for each installed skill. When in doubt, type `/` and look.',
      source: S.slash,
    },
    {
      id: 'pg2.create-from',
      title: 'Create from a branch',
      image: 'ch02/app-create-from-icon',
      caption:
        'Point to the project in the sidebar and select the **Create from** icon. On the **Branches** tab, pick `practice-empty-state-copy`: the session starts from that branch in a new worktree.',
      source: S.exStart,
    },
    {
      id: 'pg2.plan',
      title: 'Review the plan',
      image: 'ch02/app-plan-from-issue',
      caption:
        'Set **Mode** to **Plan**, type `#3` and pick **Improve the empty state copy**, and ask for a plan. It opens in the **Plan** tab, and the **Review plan** box replaces the prompt box. Pick **Exit plan mode and I will prompt myself** to return to **Interactive**.',
      source: S.exStart,
    },
    {
      id: 'pg2.preview',
      title: 'Baseline, then compare',
      image: 'ch02/app-book-app-empty-state-before',
      caption:
        'Run the Book App and open the preview. Search `hobbit`, then `zzzz-no-match`, and note the empty state. Ask to implement the plan, inspect the diff in the **Changes** tab or the **Changes** pill, then reload and compare.',
      source: S.exStart,
    },
    {
      id: 'pg2.chronicle',
      title: '/chronicle standup',
      image: 'ch02/app-chronicle-standup-output',
      caption:
        'A recap of your work from the last day. It should list this session and the changes you made in it.',
      source: S.exCheck,
    },
    {
      id: 'pg2.context',
      title: '/context',
      image: 'ch02/app-context-information',
      caption:
        'Opens the usage popup below the prompt box (or select the AI credits icon by the microphone). **Plan** is your plan’s use (**Usage hidden** in **Streamer Mode**), **Session** the AI credits used, **Tokens** what went to the model and back, and **Context** how the context window is divided. **View usage and plan...** opens your account’s usage and billing.',
      source: S.exCheck,
    },
    {
      id: 'pg2.details',
      title: 'Session details',
      caption:
        'Select the session name at the top of the window for its working branch, base branch, **Remote control**, **Path**, **Project**, **Session name** and **Session ID**. Then ask Copilot to stop the session’s development server. No pull request needed.',
      source: S.exCheck,
    },
    {
      id: 'pg2.takeaways',
      title: 'Key takeaways',
      caption:
        'Sessions are focused workspaces with their own branch, diff and history. A new worktree keeps changes out of your main checkout and is the safe default. Worktrees don’t separate ports, databases or background processes, so give parallel previews different ports. `@` files and folders, `#` issues and pull requests, `/` commands.',
      source: S.takeaways,
    },
    {
      id: 'pg2.assignment',
      title: 'Your turn: light and dark',
      image: 'shared/assignment',
      caption:
        'Add a light and dark theme to the Book App in its own worktree: start from `main` with **Create from**, attach `@samples/book-app-web/src` in **Plan** mode, then check the diff, tests and build, and `/chronicle standup`. Show the branch and worktree, the context you attached, and the change and its evidence, without changing `main`.',
      source: S.assignment,
    },
    {
      id: 'pg2.next',
      title: 'Next: Chapter 03',
      caption:
        'Chapter 03 puts isolated sessions to real work: the inner loop (review, debug, test, preview) and the outer loop (issues, pull requests, review comments, checks). [Continue to Chapter 03 ↗](https://github.com/github/copilot-app-for-beginners/blob/main/03-development-workflows/README.md)',
      source: S.next,
    },
    {
      id: 'B2.1',
      title: 'No practice branches?',
      caption:
        'Run the Chapter 00 setup script again, and check that you connected your fork, not the upstream course repository.',
      fork: ['repo', 'branches'],
      source: S.noBranches,
    },
    {
      id: 'B2.2',
      title: 'Wrong folder?',
      caption:
        'Open the session details and check the worktree path and branch name. Prefer a **New worktree** for course exercises.',
      source: S.wrongFolder,
    },
    {
      id: 'B2.3',
      title: 'No /context?',
      caption:
        '`/context` works once the session has at least one sent prompt. Send one first, or type `/` and check the palette.',
      source: S.noContext,
    },
  ],

  chests: [
    // Lyra's chest by the third booth, and the one hidden in the cave behind Great Falls.
    { id: 'C2.1', page: 'pg2.booths', doubloons: 10 },
    { id: 'C2.2', page: 'pg2.more-commands', doubloons: 15 },
    { id: 'B2.1', page: 'B2.1', doubloons: 5, kind: 'bottle' },
    { id: 'B2.2', page: 'B2.2', doubloons: 5, kind: 'bottle' },
    { id: 'B2.3', page: 'B2.3', doubloons: 5, kind: 'bottle' },
  ],

  glossary: [
    {
      id: 'git-worktree',
      term: 'Git worktree',
      definition: 'An extra working folder for the same repository, usually checked out to its own branch.',
    },
    {
      id: 'new-worktree',
      term: 'New worktree',
      definition: 'A session gets its own folder and branch beside your clone. The safe default.',
    },
    {
      id: 'cloud-sandbox',
      term: 'Cloud',
      definition: 'A session that runs in a cloud sandbox on GitHub’s hosted infrastructure.',
    },
    {
      id: 'base-branch',
      term: 'Base branch',
      definition: 'The branch that a new worktree starts from, set in the workspace selector’s menu.',
    },
    {
      id: 'create-from',
      term: 'Create from',
      definition: 'Starts a session from a branch (or other starting point). It always gets a new worktree.',
    },
    {
      id: 'workspace-selector',
      term: 'Workspace selector',
      definition: 'Below the prompt box: where a session runs (New worktree, Current checkout or Cloud).',
    },
    {
      id: 'context',
      term: 'Context',
      definition: 'The content the app is using for a session: files, issues, instructions and messages.',
    },
    {
      id: 'context-syntax',
      term: 'Context syntax',
      definition:
        '`@` files or folders, `#` issues or pull requests, `/` slash commands, `&` other sessions.',
    },
    {
      id: 'slash-command',
      term: 'Slash command',
      definition: 'A shortcut you type in the prompt box after `/`. Type `/` to see the palette.',
    },
    {
      id: 'chronicle-standup',
      term: '/chronicle standup',
      definition: 'Summarizes your work from the last day.',
    },
    {
      id: 'context-command',
      term: '/context',
      definition: 'Opens the usage popup: plan, session AI credits, tokens and the context breakdown.',
    },
    {
      id: 'empty-state',
      term: 'Empty state',
      definition: 'The message an app shows when nothing matches, like the Book App with no books found.',
    },
  ],

  trials: [
    {
      id: 'T2',
      title: 'The Canopy Trial',
      items: ['T2.1', 'T2.2', 'T2.3', 'T2.4', 'T2.5', 'T2.6', 'T2.7', 'T2.8', 'T2.9'],
      reward: { seal: 'Seal of Thousand-Bough', doubloons: 60 },
    },
  ],

  // The course section each voiced teaching line paraphrases (PLAN §8.3). Banter and directions
  // aren't listed.
  voiced: {
    'tb.tamsin.02': S.objectives,
    'tb.tamsin.03': S.objectives,
    'tb.lyra.01': S.studio,
    'tb.lyra.02': S.studio,
    'tb.lyra.03': S.studio,
    'tb.saffi.02': S.worktree,
    'tb.saffi.03': S.worktree,
    'tb.saffi.04': S.why,
    'tb.saffi.05': S.why,
    'tb.oak.01': S.where,
    'tb.oak.02': S.where,
    'tb.oak.03': S.where,
    'tb.oak.04': S.where,
    'tb.oak.05': S.where,
    'tb.oak.06': S.where,
    'tb.oak.07': S.where,
    'tb.oak.08': S.where,
    'tb.oak.gondola': S.where,
    'tb.fen.02': S.why,
    'tb.fen.mixed': S.why,
    'tb.fen.mainhall': S.where,
    'tb.fen.wrongwheel': S.why,
    'tb.fen.round2': S.why,
    'tb.fen.round3': S.why,
    'tb.fen.oneatatime': S.why,
    'tb.fen.twist.redig': S.collided,
    'tb.fen.twist.port': S.collided,
    'tb.fen.twist.close': S.collided,
    'tb.fen.twist.share': S.collided,
    'tb.fen.close': S.where,
    'wingman.tb.ports': S.takeaways,
    'tb.ines.01': S.syntax,
    'tb.ines.02': S.syntax,
    'tb.ines.03': S.syntax,
    'tb.ines.04': S.syntax,
    'tb.ines.05': S.attach,
    'tb.ines.06': S.slash,
    'tb.ines.07': S.slash,
    'tb.rook.01': S.exStart,
    'tb.rook.02': S.exStart,
    'tb.rook.03': S.exStart,
    'tb.rook.04': S.exStart,
    'tb.rook.05': S.exStart,
    'tb.rook.06': S.exStart,
    'tb.rook.assignment': S.assignment,
    'tb.pip.01': S.exCheck,
    'tb.pip.02': S.exCheck,
    'tb.pip.03': S.exCheck,
    'tb.pip.04': S.exCheck,
    'tb.pip.05': S.exCheck,
    'tb.pip.06': S.exCheck,
    'tb.elder.next': S.next,
  },
};
