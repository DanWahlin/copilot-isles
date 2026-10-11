import type { ChapterContent, Rect } from '../types';

const ch = '00-setup' as const;
const src = (anchor: string) => ({ chapter: ch, anchor });

/** A rect in the course's 1920 × 1080 app screenshots, in pixels → normalized. */
const px = (x: number, y: number, w: number, h: number): Rect => [x / 1920, y / 1080, w / 1920, h / 1080];
/** A rect in the 1000 × 480 workspace-selector crop, in pixels → normalized. */
const sel = (x: number, y: number, w: number, h: number): Rect => [x / 1000, y / 480, w / 1000, h / 480];

/** Island 00 · Anchorage Cay: Chapter 00 (Setup). POC §4.4-4.7. */
export const CH00: ChapterContent = {
  chapter: ch,
  images: [
    {
      id: 'ch00/app-sign-in',
      src: 'course/ch00/app-sign-in.webp',
      width: 1120,
      height: 490,
      alt: 'The Copilot app welcome screen with Sign in to GitHub and Sign in to GitHub Enterprise Cloud buttons',
    },
    {
      id: 'shared/app-github-copilot-app',
      src: 'course/shared/app-github-copilot-app.webp',
      width: 1920,
      height: 1080,
      alt: 'The GitHub Copilot app New view: New, Pull requests, Issues, Automations, Customize and More in the sidebar, Projects with Chats, and the prompt box',
    },
    {
      id: 'ch00/app-add-project',
      src: 'course/ch00/app-add-project.webp',
      width: 1920,
      height: 1080,
      alt: 'The Projects menu open, with callouts on the + (1) and Add GitHub repository (2), above Chat, Clone repository, and Open folder',
    },
    {
      id: 'ch00/app-current-checkout-workspace-selector',
      src: 'course/ch00/app-current-checkout-workspace-selector.webp',
      width: 1000,
      height: 480,
      alt: 'The Where to work menu below the prompt box: New worktree (checked), Current checkout (highlighted), Cloud, and Base branch, with callouts on the workspace selector and Current checkout',
    },
    {
      id: 'ch00/studio-setup-soundcheck',
      src: 'course/ch00/studio-setup-soundcheck.webp',
      width: 1536,
      height: 1024,
      alt: 'A recording studio being set up for a soundcheck',
    },
    {
      // Chapter 03's workspace-panel shot, cropped to the conversation and the review panel (no
      // sidebar), with its "Worktree ready" status line painted out: setup runs on Current checkout.
      id: 'shared/app-review-panel',
      src: 'course/shared/app-review-panel.webp',
      width: 1570,
      height: 1080,
      alt: 'A project session: the conversation and prompt box on the left, and the review panel on the right with its Terminal tab and + highlighted',
    },
  ],

  // Quizzes cover what's specific to the app or easy to get wrong. Obvious steps (the sign-in button,
  // a menu item named after what you want, `node -v`) are shown and told, not quizzed.
  quizzes: [
    {
      id: 'H0.2',
      type: 'hotspot',
      // The New view before anything's selected; Ezra then shows the menu the + opens.
      image: 'shared/app-github-copilot-app',
      mask: [],
      prompt: 'Where do you start adding your fork to the app?',
      targets: [
        {
          id: 'projects-plus',
          rect: px(300, 328, 34, 34),
          label: '+ next to Projects',
          correct: true,
        },
        {
          id: 'prompt-plus',
          rect: px(668, 528, 34, 36),
          label: '+ in the prompt box',
          feedback: 'That **+** belongs to the prompt box. Projects have their own **+** in the sidebar.',
        },
        {
          id: 'new',
          rect: px(10, 68, 330, 40),
          label: 'New',
          feedback: '**New** starts new work. Adding a project happens under **Projects**.',
        },
        {
          id: 'customize',
          rect: px(10, 228, 330, 40),
          label: 'Customize',
          feedback: '**Customize** is where you extend the app. Look beside the **Projects** heading.',
        },
      ],
      explain: {
        correct: 'Right! The **+** next to **Projects** opens the menu for adding a project.',
        wrong: 'Close! Look for the **+** beside the **Projects** heading in the sidebar.',
      },
      hints: [
        'Projects live in the sidebar.',
        'Find the **Projects** heading. There’s a small button beside it.',
        'Select the **+** to the right of **Projects**.',
      ],
      source: src('connect-to-your-repository'),
    },
    {
      id: 'S0.3',
      type: 'scenario',
      situation:
        'You select **Add GitHub repository** and search for `copilot-app-for-beginners`. Say two results come up: `github/copilot-app-for-beginners` and `your-handle/copilot-app-for-beginners`.',
      prompt: 'Which one do you pick?',
      options: [
        { id: 'fork', text: '`your-handle/copilot-app-for-beginners`, your fork' },
        {
          id: 'upstream',
          text: '`github/copilot-app-for-beginners`, the original course',
          feedback:
            'That’s the original. Your practice work belongs in your fork, and the setup script refuses to change the original.',
        },
        {
          id: 'either',
          text: 'Either one. They have the same files',
          feedback:
            'They start out the same, but only your fork is yours to change. The setup script refuses the original.',
        },
      ],
      answer: 'fork',
      explain: {
        correct:
          'Right. Pick your fork, the result that starts with your GitHub username. The app clones it and adds it under **Projects**.',
        wrong: 'Your practice work belongs in your own copy of the course.',
      },
      source: src('connect-to-your-repository'),
    },
    {
      id: 'H0.4',
      type: 'hotspot',
      image: 'ch00/app-current-checkout-workspace-selector',
      // The two numbered callouts, and the blue outline round Current checkout (four thin strips).
      mask: [
        sel(442, 129, 57, 57),
        sel(562, 287, 57, 57),
        sel(258, 281, 300, 7),
        sel(258, 342, 300, 7),
        sel(258, 281, 7, 69),
        sel(551, 281, 7, 69),
      ],
      prompt: 'For this one-time setup, where should the session run?',
      targets: [
        {
          id: 'current',
          rect: sel(263, 288, 290, 54),
          label: 'Current checkout',
          correct: true,
        },
        {
          id: 'worktree',
          rect: sel(262, 229, 292, 52),
          label: 'New worktree',
          feedback:
            'The checkmark shows the default, **New worktree**, a separate directory for each session. For setup, change it to **Current checkout**.',
        },
        {
          id: 'cloud',
          rect: sel(262, 350, 292, 52),
          label: 'Cloud',
          feedback: '**Cloud** runs in a cloud sandbox. Setup uses the clone that’s already on your machine.',
        },
      ],
      explain: {
        correct:
          'Yes: **Current checkout** works in the existing checkout, the clone already on your machine. You’ll meet the other options on Thousand-Bough Isle.',
        wrong: 'Setup should use the copy that’s already on your machine.',
      },
      hints: [
        'Don’t trust the checkmark. It just shows the default.',
        'You want the option that works in the clone already on your machine.',
        'Select **Current checkout**.',
      ],
      source: src('check-your-tools-in-terminal'),
    },
    {
      id: 'S0.1',
      type: 'scenario',
      situation:
        'You run `gh auth status` in **Terminal** and it says you’re logged in as **someone-else**, not the account that owns your fork.',
      prompt: 'What should you do?',
      options: [
        {
          id: 'login',
          text: 'Run `gh auth login`, choose **GitHub.com** → **Login with a web browser**, then run `gh auth status` again',
        },
        {
          id: 'ignore',
          text: 'Ignore it. The app’s sign-in covers the CLI too',
          feedback: 'GitHub CLI has its own sign-in, separate from the app.',
        },
        {
          id: 'reinstall',
          text: 'Reinstall GitHub CLI',
          feedback: 'The CLI works fine. It’s just signed in to the wrong account.',
        },
        {
          id: 'yes',
          text: 'Run the setup script with `--yes` anyway',
          feedback: 'The script uses the CLI’s account, so it’d target the wrong place.',
        },
      ],
      answer: 'login',
      explain: {
        correct:
          'Right. Sign in with `gh auth login`, then confirm the active account with `gh auth status`.',
        wrong: 'The CLI’s account has to match your fork before you continue.',
      },
      source: src('check-your-tools-in-terminal'),
    },
    {
      id: 'S0.2',
      type: 'scenario',
      situation:
        'You want to send: “Give me an overview of the copilot-app-for-beginners course repository. Focus on the learning path and the samples/book-app-web folder.”',
      prompt: 'Where does it go?',
      options: [
        { id: 'prompt', text: 'The Copilot app’s prompt box (the speaking tube to the crew)' },
        {
          id: 'terminal',
          text: 'The Terminal tab (the engine-room hatch)',
          feedback:
            '**Terminal** runs commands like `git --version`. Requests to the agent go in the prompt box.',
        },
      ],
      answer: 'prompt',
      explain: {
        correct:
          'Yes! Requests go to the agent through the prompt box. It should summarize the course and point out `samples/book-app-web`.',
        wrong: 'Terminal is for commands. Who should answer this request?',
      },
      source: src('learn-more-about-the-course-repository'),
    },

    // The Harbormaster's Trial (T0): 8 items, hints tier 3 off.
    {
      id: 'T0.1',
      type: 'ordering',
      prompt: 'Put the five setup steps in order. Each one depends on the step before it.',
      items: [
        { id: 'fork', text: 'Fork the course repository' },
        { id: 'add', text: 'Add your fork: **+** by **Projects** → **Add GitHub repository**' },
        { id: 'local', text: 'Start a project session on **Current checkout**' },
        { id: 'dry', text: 'Run `--dry-run` and check the `Repository:` line' },
        { id: 'yes', text: 'Run `--yes` and wait for `Setup complete.`' },
      ],
      explain: {
        correct:
          'That’s the whole voyage: fork, add it, a **Current checkout** session, preview, then run it for real.',
        wrong: 'You can’t add a fork you haven’t made, and the preview always comes before `--yes`.',
      },
      source: src('connect-to-your-repository'),
    },
    {
      id: 'T0.9',
      type: 'matching',
      prompt: 'Setup hops between GitHub.com and the app. Match each step to where you do it.',
      pairs: [
        {
          left: { id: 'workflows', text: 'Turn on workflows for your fork' },
          right: { id: 'github', text: 'GitHub.com' },
        },
        {
          left: { id: 'local', text: 'Switch the session to **Current checkout**' },
          right: { id: 'selector', text: 'Workspace selector' },
        },
        {
          left: { id: 'auth', text: 'Run `gh auth status`' },
          right: { id: 'terminal', text: 'Terminal tab' },
        },
        {
          left: { id: 'overview', text: 'Ask for a course overview' },
          right: { id: 'prompt', text: 'Prompt box' },
        },
      ],
      explain: {
        correct:
          'That’s it. Workflows live in your fork’s **Actions** tab on GitHub.com, the workspace selector sits below the prompt box, commands go in **Terminal**, and requests go in the prompt box.',
        wrong:
          'Workflows are a GitHub.com setting. In the app, commands and requests go to different places.',
      },
      source: src('check-your-tools-in-terminal'),
    },
    {
      id: 'T0.3',
      type: 'multi',
      prompt: 'What does the setup script create in your fork? Pick all that apply.',
      options: [
        { id: 'labels', text: 'Labels' },
        { id: 'issues', text: 'Issues' },
        { id: 'branches', text: 'Practice branches' },
        { id: 'prs', text: 'Pull requests' },
        { id: 'main-bugs', text: 'Bugs on `main`' },
      ],
      answers: ['labels', 'issues', 'branches', 'prs'],
      explain: {
        correct:
          'Yes: labels, issues, practice branches, and pull requests. The bugs stay on practice branches, never `main`.',
        wrong: 'Four of these are right. The intentional bugs stay off `main`.',
      },
      source: src('add-the-course-practice-items'),
    },
    {
      id: 'T0.4',
      type: 'mc',
      prompt: 'Why enable workflows on your fork?',
      options: [
        { id: 'checks', text: 'So GitHub can run the automated checks for the practice exercises' },
        { id: 'automations', text: 'So the app’s **Automations** page works' },
        { id: 'signin', text: 'So you can sign in to the app' },
        { id: 'clone', text: 'So the app can clone the repository' },
      ],
      answer: 'checks',
      explain: {
        correct: 'Right. New forks switch GitHub Actions off, and the practice checks need them.',
        wrong: 'These are GitHub Actions workflows. The app’s Automations are something else.',
      },
      source: src('add-the-course-practice-items'),
    },
    // Sea battle 1, wave 1 (the bosun's question; .plans/battle-plan.md "Teaching map").
    {
      id: 'N0.1',
      type: 'mc',
      prompt: 'The setup script creates items on GitHub in your fork. What do you run first?',
      options: [
        { id: 'dry', text: '`--dry-run`, to preview its target and planned changes' },
        {
          id: 'yes',
          text: '`--yes`, to run the setup',
          feedback: '`--yes` runs the setup for real. Preview it with `--dry-run` first.',
        },
        {
          id: 'shared',
          text: '`--allow-shared-repository`',
          feedback:
            'That’s only for an organization fork you’re authorized to set up, after you’ve checked the `Repository:` line.',
        },
      ],
      answer: 'dry',
      explain: {
        correct:
          'Right. The script creates items on GitHub in your fork, so you’ll preview its target and planned changes before running it.',
        wrong: 'Preview first: the script creates items on GitHub in your fork.',
      },
      source: src('add-the-course-practice-items'),
    },
    {
      id: 'T0.5',
      type: 'scenario',
      situation: 'The dry-run finishes and shows `Repository: someone-else/copilot-app-for-beginners`.',
      prompt: 'What now?',
      options: [
        { id: 'stop', text: 'Stop, and point it at your fork before running `--yes`' },
        { id: 'yes', text: 'Run `--yes`. The preview is only a suggestion' },
        { id: 'shared', text: 'Add `--allow-shared-repository` and run it' },
      ],
      answer: 'stop',
      explain: {
        correct: 'Yes. The `Repository:` line has to show your fork before you run it for real.',
        wrong:
          'The preview exists so you catch exactly this. Don’t run it against someone else’s repository.',
      },
      source: src('add-the-course-practice-items'),
    },
    {
      id: 'T0.6',
      type: 'multi',
      prompt: 'Which of these do you need before you start? Pick all that apply.',
      options: [
        { id: 'account', text: 'A GitHub account' },
        { id: 'plan', text: 'A Copilot plan, or your own model provider' },
        { id: 'git', text: 'Git' },
        { id: 'node', text: 'Node.js LTS' },
        { id: 'gh', text: 'GitHub CLI (`gh`)' },
        { id: 'vscode', text: 'VS Code' },
      ],
      answers: ['account', 'plan', 'git', 'node', 'gh'],
      explain: {
        correct: 'That’s the list. Your editor is welcome, but it isn’t required for setup.',
        wrong: 'Five of these are prerequisites. One is nice to have but not required.',
      },
      source: src('prerequisites'),
    },
    {
      id: 'T0.10',
      type: 'mc',
      prompt: 'Your fork shows under **Projects**. How do you start the session you’ll run setup in?',
      options: [
        { id: 'project-plus', text: 'Select **+** next to `copilot-app-for-beginners`' },
        {
          id: 'projects-plus',
          text: 'Select **+** next to the **Projects** heading',
          feedback: 'That **+** adds another project. Each project has its own **+** for a new session.',
        },
        {
          id: 'chat',
          text: 'Pick **Chat** from the **Projects** menu',
          feedback: 'A chat isn’t tied to your repository. Setup runs in a project session.',
        },
      ],
      answer: 'project-plus',
      explain: {
        correct: 'Right. The **+** beside the project starts a project session in it.',
        wrong: 'Look beside the project itself, not the **Projects** heading.',
      },
      source: src('check-your-tools-in-terminal'),
    },
    {
      id: 'T0.8',
      type: 'scenario',
      situation: 'The script finished, but the practice issues weren’t created in your fork.',
      prompt: 'What’s the fix?',
      options: [
        {
          id: 'features',
          text: 'Enable **Issues** in the fork’s **Settings → Features**, then rerun the script',
        },
        { id: 'refork', text: 'Delete the fork and start over' },
        { id: 'worktree', text: 'Switch the session to **New worktree**' },
      ],
      answer: 'features',
      explain: {
        correct: 'Yes. Forks can have Issues turned off. Turn them on and rerun.',
        wrong: 'Nothing’s broken. A repository feature is just switched off.',
      },
      source: src('practice-items-were-not-created'),
    },
  ],

  pages: [
    {
      id: 'pg.install',
      title: 'Get the Copilot app',
      image: 'shared/app-github-copilot-app',
      caption:
        'Download and install the **GitHub Copilot app** for your system from [github.com/features/ai/github-app](https://github.com/features/ai/github-app). Open it and select **Sign in to GitHub** (on `*.ghe.com`, **Sign in to GitHub Enterprise Cloud**). At **Connect your repositories**, leave every repository unselected and select **Continue**.',
      source: src('installation'),
    },
    {
      id: 'pg.prereqs',
      title: 'What you need',
      caption:
        'A GitHub account, and a Copilot plan **or** your own model provider. On Copilot Business or Enterprise, your organization has to enable the **GitHub Copilot app** policy. Install [Git](https://git-scm.com/install), [Node.js LTS](https://nodejs.org) (it runs the course’s sample app), and [GitHub CLI](https://cli.github.com) (`gh`, for the one-time setup script). You’ll check their versions in the app’s **Terminal** once your fork is connected.',
      source: src('prerequisites'),
    },
    {
      id: 'C0.3',
      title: 'The New view',
      image: 'shared/app-github-copilot-app',
      caption:
        'Select **Continue**, and the app opens the **New** view, where new work starts. If it shows a short tip about a new feature, you can close the tip.',
      source: src('installation'),
    },
    {
      id: 'pg.fork',
      title: 'Fork the course',
      caption:
        'Fork the course repository on GitHub at [github.com/github/copilot-app-for-beginners/fork](https://github.com/github/copilot-app-for-beginners/fork). Your practice work, and the practice items the setup script adds, go in your fork, not the original.',
      source: src('connect-to-your-repository'),
    },
    {
      id: 'C0.4',
      title: 'Add your fork',
      image: 'ch00/app-add-project',
      caption:
        '**+** next to **Projects** → **Add GitHub repository**, search for `copilot-app-for-beginners`, and pick your fork, not the original. Already have a local copy? **Open folder**. Have the URL? **Clone repository**. If the app says Git is missing, install Git and try again.',
      source: src('connect-to-your-repository'),
    },
    {
      id: 'C0.6',
      title: 'A Current checkout session',
      image: 'ch00/app-current-checkout-workspace-selector',
      caption:
        'Point to your project in the sidebar and select the **+** that appears to start a project session. Sessions start on **New worktree** by default. For setup, pick **Current checkout** in the workspace selector below the prompt box, so it runs in the clone already on your machine. Then submit this short prompt to create the session.',
      code: 'Name the top-level folders in this repository. Do not change any files.',
      source: src('check-your-tools-in-terminal'),
    },
    {
      id: 'pg.terminal',
      title: 'Terminal in the app',
      image: 'shared/app-review-panel',
      caption:
        'Select **View → Toggle Review Panel**, then **Terminal**. No tab? Select **+**, then **Terminal**. Commands run here: the version checks, `gh auth status`, and the setup script. Requests to the agent go in the prompt box. On Windows, if PowerShell won’t run `npm`, use `npm.cmd` in its place.',
      code:
        'git --version\nnode -v\nnpm -v\ngh --version\n' +
        'gh auth status   # signed in as the account that owns your fork?\n' +
        'gh auth login    # if not: GitHub.com → Login with a web browser',
      source: src('check-your-tools-in-terminal'),
    },
    {
      id: 'pg.workflows',
      title: 'Turn on workflows',
      caption:
        'New forks start with GitHub Actions switched off. On GitHub.com, open your fork’s **Actions** tab and select **I understand my workflows, go ahead and enable them** so the practice checks can run.',
      source: src('add-the-course-practice-items'),
    },
    {
      id: 'pg.checks',
      title: 'The practice checks',
      caption:
        'With workflows on, GitHub runs automated checks on your fork’s pull requests. One of the practice pull requests has a check that fails on purpose, so you can fix it in a later chapter.',
      source: src('add-the-course-practice-items'),
    },
    {
      id: 'P0.S',
      title: 'The setup commands',
      caption:
        'Run both in **Terminal**, from the repository root (the folder with `.github` and `samples`). Preview first, check the `Repository:` line, then run it for real.',
      code:
        'node .github/scripts/setup-training-scenarios.js --dry-run   # preview; check Repository:\n' +
        'node .github/scripts/setup-training-scenarios.js --yes       # wait for "Setup complete."',
      source: src('add-the-course-practice-items'),
    },
    {
      id: 'pg.first-prompt',
      title: 'Learn about the course',
      caption:
        'Back in your project session, send this from the **prompt box**, not **Terminal**. The reply should sum up the course structure and point out `samples/book-app-web`, the web sample for later exercises. Models vary, so yours will be worded differently.',
      code: 'Give me an overview of the copilot-app-for-beginners course repository. Focus on the learning path and the samples/book-app-web folder.',
      source: src('learn-more-about-the-course-repository'),
    },
    {
      id: 'C0.5',
      title: 'Soundcheck',
      image: 'ch00/studio-setup-soundcheck',
      caption: 'Setting up the app is like prepping a studio before the first take.',
      source: src('the-course-theme-working-in-a-recording-studio'),
    },
    {
      id: 'B0.1',
      title: 'I can’t sign in',
      caption:
        'Check you’re on the expected GitHub account, with a Copilot plan or your own model provider. Your organization has to leave the **GitHub Copilot app** policy on, and that’s separate from the Copilot CLI policy. On `*.ghe.com`? Select **Sign in to GitHub Enterprise Cloud**.',
      source: src('i-cannot-sign-in'),
    },
    {
      id: 'B0.2',
      title: 'I can’t see the repository',
      caption:
        'Check you’ve got access to it on GitHub and that you picked the right account or organization. Already cloned it? Try **Open folder**. If the app says Git is missing, install Git and retry. A chat can’t explain the repository? Check the right one’s connected and your prompt names `copilot-app-for-beginners`.',
      source: src('i-cannot-see-the-repository'),
    },
    {
      id: 'B0.3',
      title: 'The script stops for an organization fork',
      caption:
        'The setup script won’t change a repository an organization owns. Add `--allow-shared-repository` only if you’re authorized and the `Repository:` line shows the right target. Issues missing? On GitHub.com, open your fork’s **Settings** → **Features**, turn on **Issues**, and rerun. Can’t run the script at all? The course’s Training GitHub Scenarios appendix has the manual steps. Do them before Chapter 02.',
      code: 'node .github/scripts/setup-training-scenarios.js --yes --allow-shared-repository',
      source: src('the-script-stops-for-an-organization-fork'),
    },
    {
      id: 'B0.4',
      title: 'The script stops with “Setup failed”',
      caption:
        'Read the message after `Setup failed`. Fix the problem it reports, then run the script with `--yes` again. It reuses the labels, issues, branches, and pull requests it already made, so you won’t get duplicates.',
      code: 'node .github/scripts/setup-training-scenarios.js --yes',
      source: src('the-script-stops-with-setup-failed'),
    },
  ],

  chests: [
    // Nell's chest holds the tool list (pages granted in dialogue aren't chests).
    { id: 'C0.1', page: 'pg.prereqs', doubloons: 10 },
    // Message bottles washed up round the island: optional troubleshooting pages (POC §4.4).
    { id: 'B0.1', page: 'B0.1', doubloons: 5, kind: 'bottle' },
    { id: 'B0.2', page: 'B0.2', doubloons: 5, kind: 'bottle' },
    { id: 'B0.3', page: 'B0.3', doubloons: 5, kind: 'bottle' },
    { id: 'B0.4', page: 'B0.4', doubloons: 5, kind: 'bottle' },
  ],

  glossary: [
    { id: 'fork', term: 'Fork', definition: 'Your own copy of a repository on GitHub.' },
    {
      id: 'project-session',
      term: 'Project session',
      definition: 'A session that works inside one of your projects (repositories).',
    },
    {
      id: 'current-checkout',
      term: 'Current checkout',
      definition: 'Run a session in the existing checkout: the clone that’s already on your machine.',
    },
    {
      id: 'worktree',
      term: 'Worktree',
      definition: 'A separate working copy of your repository, so a session’s changes stay out of your way.',
    },
    {
      id: 'review-panel',
      term: 'Review panel',
      definition:
        'The app’s side panel, with tabs such as Changes and Terminal. Open it with View → Toggle Review Panel.',
    },
    {
      id: 'github-actions',
      term: 'GitHub Actions workflows',
      definition:
        'Automated checks and jobs that GitHub runs for a repository. Not the same as the app’s Automations, which are saved agent tasks.',
    },
    {
      id: 'dry-run',
      term: 'Dry run',
      definition: 'A preview that shows what a command would do without changing anything.',
    },
  ],

  trials: [
    {
      id: 'T0',
      title: 'The Harbormaster’s Trial',
      items: ['T0.1', 'T0.9', 'T0.3', 'T0.4', 'T0.5', 'T0.6', 'T0.10', 'T0.8'],
      reward: { seal: 'Seal of Anchorage', doubloons: 50 },
    },
  ],
};
