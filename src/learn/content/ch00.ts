import type { ChapterContent } from '../types';

const ch = '00-setup' as const;
const src = (anchor: string) => ({ chapter: ch, anchor });

/** Island 00 · Anchorage Cay: Chapter 00 (Setup). POC §4.4-4.7. */
export const CH00: ChapterContent = {
  chapter: ch,
  images: [
    {
      id: 'ch00/sign-in-to-app',
      src: 'course/ch00/sign-in-to-app.webp',
      width: 1120,
      height: 490,
      alt: 'The Copilot app welcome screen with Sign in to GitHub and Sign in to GitHub Enterprise Cloud buttons',
    },
    {
      id: 'ch00/pick-a-theme',
      src: 'course/ch00/pick-a-theme.webp',
      width: 2436,
      height: 918,
      alt: 'The theme picker with palette cards, and Accessibility, Finish, and Back buttons',
    },
    {
      id: 'shared/github-copilot-app',
      src: 'course/shared/github-copilot-app.webp',
      width: 1920,
      height: 1080,
      alt: 'The GitHub Copilot app New page',
    },
    {
      id: 'ch00/app-add-project',
      src: 'course/ch00/app-add-project.webp',
      width: 1920,
      height: 1080,
      alt: 'The Projects + menu open, showing Chat, Add GitHub repository, Clone repository, and Open folder',
    },
    {
      id: 'ch00/local-repository-workspace-selector',
      src: 'course/ch00/local-repository-workspace-selector.webp',
      width: 2738,
      height: 838,
      alt: 'The workspace selector: New worktree (checked), Local repository, and Cloud',
    },
    {
      id: 'ch00/studio-setup-soundcheck',
      src: 'course/ch00/studio-setup-soundcheck.webp',
      width: 1536,
      height: 1024,
      alt: 'A recording studio being set up for a soundcheck',
    },
  ],

  quizzes: [
    {
      id: 'H0.1',
      type: 'hotspot',
      image: 'ch00/sign-in-to-app',
      mask: [],
      prompt: 'Point to how you’d sign in with a regular GitHub account.',
      targets: [
        { id: 'github', rect: [0.136, 0.714, 0.2, 0.1], label: 'Sign in to GitHub', correct: true },
        {
          id: 'ghe',
          rect: [0.349, 0.714, 0.415, 0.1],
          label: 'Sign in to GitHub Enterprise Cloud',
          feedback:
            'That one’s for organizations on *.ghe.com. A regular account uses **Sign in to GitHub**.',
        },
      ],
      explain: {
        correct: 'Right! **Sign in to GitHub** is the one for a regular GitHub account.',
        wrong: 'Look for the plain GitHub sign-in button.',
      },
      hints: [
        'There are two sign-in buttons. Which one isn’t for a special kind of organization?',
        'The Enterprise Cloud button is for *.ghe.com orgs.',
        'Select the green **Sign in to GitHub** button.',
      ],
      source: src('installation'),
    },
    {
      id: 'H0.2',
      type: 'hotspot',
      image: 'ch00/app-add-project',
      mask: [
        [0.23, 0.274, 0.031, 0.054],
        [0.371, 0.436, 0.031, 0.054],
      ],
      prompt: 'Where do you start adding a repository to the app?',
      targets: [
        {
          id: 'projects-plus',
          rect: [0.216, 0.318, 0.029, 0.052],
          label: '+ next to Projects',
          correct: true,
        },
        {
          id: 'new',
          rect: [0.008, 0.089, 0.24, 0.05],
          label: 'New',
          feedback: '**New** starts new work. Adding a project happens under **Projects**.',
        },
        {
          id: 'customize',
          rect: [0.008, 0.244, 0.24, 0.05],
          label: 'Customize',
          feedback: '**Customize** is for tailoring the app. Look beside the **Projects** heading.',
        },
      ],
      explain: {
        correct: 'Right: the **+** next to **Projects** opens the menu for adding a project.',
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
      id: 'H0.3',
      type: 'hotspot',
      image: 'ch00/app-add-project',
      mask: [
        [0.23, 0.274, 0.031, 0.054],
        [0.371, 0.436, 0.031, 0.054],
      ],
      prompt: 'Which option adds your fork from GitHub?',
      targets: [
        {
          id: 'add-github',
          rect: [0.223, 0.441, 0.228, 0.043],
          label: 'Add GitHub repository',
          correct: true,
        },
        {
          id: 'chat',
          rect: [0.223, 0.381, 0.228, 0.041],
          label: 'Chat',
          feedback: '**Chat** starts a chat session, not a project.',
        },
        {
          id: 'clone',
          rect: [0.223, 0.487, 0.228, 0.043],
          label: 'Clone repository',
          feedback:
            '**Clone repository** works when you have the fork’s URL. From GitHub, pick **Add GitHub repository**.',
        },
        {
          id: 'open-folder',
          rect: [0.223, 0.532, 0.228, 0.042],
          label: 'Open folder',
          feedback: '**Open folder** is for a copy that’s already on your machine.',
        },
      ],
      explain: {
        correct:
          'Yes! **Add GitHub repository**, then search for `copilot-app-for-beginners` and pick your fork.',
        wrong: 'Your fork lives on GitHub. Which option talks about GitHub?',
      },
      hints: [
        'Your fork is on GitHub.',
        'One option has the GitHub logo.',
        'Select **Add GitHub repository**.',
      ],
      source: src('connect-to-your-repository'),
    },
    {
      id: 'MC0.1',
      type: 'mc',
      prompt:
        'You already have a local copy of your fork. Which option do you pick after the **+** by **Projects**?',
      options: [
        { id: 'open', text: 'Open folder' },
        {
          id: 'clone',
          text: 'Clone repository',
          feedback: '**Clone repository** is for when you have the fork’s URL and no local copy yet.',
        },
        {
          id: 'add',
          text: 'Add GitHub repository',
          feedback: 'That downloads a fresh copy. You’ve already got one.',
        },
        {
          id: 'chat',
          text: 'Chat',
          feedback: '**Chat** starts a chat session. It doesn’t connect a repository.',
        },
      ],
      answer: 'open',
      explain: {
        correct:
          'Right: **Open folder**, then select the folder. **Clone repository** is for when you have the URL.',
        wrong: 'You’ve already got the files on your machine. Which option opens them?',
      },
      source: src('connect-to-your-repository'),
    },
    {
      id: 'H0.4',
      type: 'hotspot',
      image: 'ch00/local-repository-workspace-selector',
      mask: [
        [0.214, 0.76, 0.05, 0.16],
        [0.402, 0.372, 0.05, 0.16],
      ],
      prompt: 'For this one-time setup, where should the session run?',
      targets: [
        {
          id: 'local',
          rect: [0.248, 0.401, 0.366, 0.198],
          label: 'Local repository',
          correct: true,
        },
        {
          id: 'worktree',
          rect: [0.248, 0.204, 0.366, 0.174],
          label: 'New worktree',
          feedback:
            'The checkmark shows the default, **New worktree**, which creates a separate copy for the session. For setup, change it to **Local repository**.',
        },
        {
          id: 'cloud',
          rect: [0.248, 0.609, 0.366, 0.178],
          label: 'Cloud',
          feedback: '**Cloud** runs in a cloud sandbox. Setup uses the clone that’s already on your machine.',
        },
      ],
      explain: {
        correct:
          'Yes: **Local repository** works in the clone already on your machine. You’ll meet worktrees on Thousand-Bough Isle.',
        wrong: 'Setup should use the copy that’s already on your machine.',
      },
      hints: [
        'Don’t trust the checkmark. It just shows the default.',
        'You want the option that uses the repository already on your machine.',
        'Select **Local repository**.',
      ],
      source: src('check-your-tools-in-terminal'),
    },
    {
      id: 'M0.1',
      type: 'matching',
      prompt: 'Match each piece of gear to the version check it stands for.',
      pairs: [
        { left: { id: 'compass', text: '🧭 Compass (Git)' }, right: { id: 'git', text: 'git --version' } },
        { left: { id: 'lantern', text: '🏮 Lantern (Node.js)' }, right: { id: 'node', text: 'node -v' } },
        { left: { id: 'rope', text: '🪢 Rope coil (npm)' }, right: { id: 'npm', text: 'npm -v' } },
        {
          left: { id: 'spyglass', text: '🔭 Spyglass (GitHub CLI)' },
          right: { id: 'gh', text: 'gh --version' },
        },
      ],
      explain: {
        correct:
          'All four check out. Each command should print a version number. Install only what’s missing.',
        wrong: 'Think about which tool each command belongs to.',
      },
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
      source: src('your-first-prompt'),
    },

    // The Harbormaster's Trial (T0): 8 items, hints tier 3 off.
    {
      id: 'T0.1',
      type: 'ordering',
      prompt: 'Put the five decisions that matter in order.',
      items: [
        { id: 'signin', text: 'Sign in to GitHub in the app' },
        { id: 'fork', text: 'Fork the course repository' },
        { id: 'add', text: 'Add your fork: **+** by **Projects** → **Add GitHub repository**' },
        { id: 'local', text: 'Run this setup session on **Local repository**' },
        { id: 'dry', text: 'Run `--dry-run` and check `Repository:` before `--yes`' },
      ],
      explain: {
        correct:
          'That’s the whole voyage: sign in, fork, add, local repository, and preview before you commit.',
        wrong: 'You can’t add a fork you haven’t made yet, and the preview always comes first.',
      },
      source: src('connect-to-your-repository'),
    },
    {
      id: 'T0.2',
      type: 'mc',
      prompt: 'What is a fork?',
      options: [
        { id: 'copy', text: 'Your own copy of the repository on GitHub' },
        { id: 'branch', text: 'A branch inside the course repository' },
        { id: 'local', text: 'The folder on your computer' },
        { id: 'session', text: 'A kind of project session' },
      ],
      answer: 'copy',
      explain: {
        correct: 'Right: a fork is your own copy of the repository, on GitHub.',
        wrong: 'A fork lives on GitHub, and it belongs to you.',
      },
      source: src('connect-to-your-repository'),
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
      id: 'T0.7',
      type: 'mc',
      prompt: 'When is setup done?',
      options: [
        { id: 'complete', text: 'When the terminal shows `Setup complete.`' },
        { id: 'dry', text: 'As soon as the dry-run finishes' },
        { id: 'fork', text: 'When the fork appears on GitHub' },
      ],
      answer: 'complete',
      explain: {
        correct: 'Right. Wait for `Setup complete.` in the terminal.',
        wrong: 'The dry-run is only a preview. Watch the terminal for the finish line.',
      },
      source: src('add-the-course-practice-items'),
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
      id: 'pg.prereqs',
      title: 'What you need',
      caption:
        'A GitHub account, and a Copilot plan **or** your own model provider. For Copilot Business or Enterprise, the **GitHub Copilot app** policy must be on. You’ll also want Git, Node.js LTS, and GitHub CLI (`gh`).',
      source: src('prerequisites'),
    },
    {
      id: 'C0.1',
      title: 'Sign in',
      image: 'ch00/sign-in-to-app',
      caption: 'Open the app and select **Sign in to GitHub**.',
      source: src('installation'),
    },
    {
      id: 'C0.2',
      title: 'Pick a theme',
      image: 'ch00/pick-a-theme',
      caption: 'Pick a theme and select **Finish**. You can change it any time in settings.',
      source: src('installation'),
    },
    {
      id: 'C0.3',
      title: 'The New page',
      image: 'shared/github-copilot-app',
      caption: 'The **New** page is where work starts.',
      source: src('installation'),
    },
    {
      id: 'C0.4',
      title: 'Add your fork',
      image: 'ch00/app-add-project',
      caption:
        '**+** next to **Projects** → **Add GitHub repository**. Already have a local copy? **Open folder**. Have the URL? **Clone repository**.',
      source: src('connect-to-your-repository'),
    },
    {
      id: 'C0.5',
      title: 'Soundcheck',
      image: 'ch00/studio-setup-soundcheck',
      caption: 'Setting up the app is like prepping a studio before the first take.',
      source: src('the-course-theme-working-in-a-recording-studio'),
    },
    {
      id: 'C0.6',
      title: 'Local repository',
      image: 'ch00/local-repository-workspace-selector',
      caption: '**Local repository** works in the clone that’s already on your machine.',
      source: src('check-your-tools-in-terminal'),
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
      title: 'Your first prompt',
      caption:
        'Send requests to the agent from the **prompt box**, not **Terminal**. Your first one asks for an overview of the course, and the reply points out `samples/book-app-web`.',
      source: src('your-first-prompt'),
    },
  ],

  chests: [
    { id: 'C0.1', page: 'C0.1', doubloons: 10 },
    { id: 'C0.2', page: 'C0.2', doubloons: 10 },
    { id: 'C0.3', page: 'C0.3', doubloons: 10 },
    { id: 'C0.4', page: 'C0.4', doubloons: 10 },
    { id: 'C0.5', page: 'C0.5', doubloons: 10 },
    { id: 'C0.6', page: 'C0.6', doubloons: 25 },
  ],

  glossary: [
    { id: 'fork', term: 'Fork', definition: 'Your own copy of a repository on GitHub.' },
    {
      id: 'project-session',
      term: 'Project session',
      definition: 'A session that works inside one of your projects (repositories).',
    },
    {
      id: 'local-repository',
      term: 'Local repository',
      definition: 'Run a session in the clone that’s already on your machine.',
    },
    {
      id: 'worktree',
      term: 'Worktree',
      definition: 'A separate working copy of your repository, so a session’s changes stay out of your way.',
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
      items: ['T0.1', 'T0.2', 'T0.3', 'T0.4', 'T0.5', 'T0.6', 'T0.7', 'T0.8'],
      reward: { seal: 'Seal of Anchorage', doubloons: 50 },
    },
  ],
};
