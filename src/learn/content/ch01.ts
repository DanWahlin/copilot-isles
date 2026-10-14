import { courseRefs } from '../course/refs';
import type { ChapterContent, Rect } from '../types';

const ch = '01-tour-the-app' as const;
const src = courseRefs(ch);

/** A rect in the course's 1920 × 1080 app screenshots, in pixels → normalized. */
const px = (x: number, y: number, w: number, h: number): Rect => [x / 1920, y / 1080, w / 1920, h / 1080];

// app-new-page (measured on the course's app 1.1.27-1.1.28 screenshot): the sidebar rows and the
// controls round the prompt box.
const NEW = {
  new: px(10, 76, 368, 42),
  pullRequests: px(10, 120, 368, 42),
  issues: px(10, 164, 368, 42),
  automations: px(10, 209, 368, 42),
  customize: px(10, 253, 368, 42),
  more: px(10, 297, 368, 42),
  projectsPlus: px(336, 368, 34, 34),
  project: px(10, 405, 368, 40),
  promptPlus: px(638, 531, 32, 32),
  mode: px(678, 531, 94, 32),
  model: px(778, 531, 180, 32),
  picker: px(638, 588, 244, 32),
  checkout: px(894, 588, 230, 32),
  mic: px(1589, 529, 32, 32),
} as const;

// app-settings: the Settings list on the left of the dialog.
const SETTINGS = {
  general: px(340, 193, 296, 40),
  accounts: px(340, 238, 296, 40),
  sessions: px(340, 282, 296, 40),
  themes: px(340, 327, 296, 40),
  accessibility: px(340, 371, 296, 40),
  voice: px(340, 415, 296, 40),
  customize: px(340, 482, 296, 40),
  providers: px(340, 527, 296, 40),
  experimental: px(340, 593, 296, 40),
} as const;

/** The course's prompts for this chapter, word for word. */
const CH01_PROMPTS = {
  chat: 'In the GitHub Copilot app, explain when I should use a chat and when I should use a project session. Do not create or change files.',
  tour: "I'm learning the copilot-app-for-beginners course. Give me a beginner-friendly tour of the samples/book-app-web sample before I begin the hands-on exercises. Explain what the app does, the technologies it uses, how its main files are organized, how data flows through it and what the tests cover. Refer to specific file paths and finish with a suggested reading order. Do not change any files.",
  filterBooks:
    'In samples/book-app-web, explain how filterBooks searches book titles and authors. Does letter case affect the results? Refer to the relevant file. Do not change any files.',
} as const;

/** Island 01 · Port Meridian: Chapter 01 (Tour the App), in the chapter's order. */
export const CH01: ChapterContent = {
  chapter: ch,
  images: [
    {
      id: 'ch01/editor-vs-app',
      src: 'course/ch01/editor-vs-app.webp',
      hash: 'e320e3aa4b6e',
      width: 1536,
      height: 1024,
      alt: 'Your editor for deep coding beside the GitHub Copilot app for running and reviewing agent work',
    },
    {
      id: 'ch01/app-new-page',
      src: 'course/ch01/app-new-page.webp',
      hash: '37be111c3c45',
      width: 1920,
      height: 1080,
      alt: 'The New view: New, Pull requests, Issues, Automations, Customize and More in the sidebar, Projects with the course project, and the prompt box with the mode and model controls, the project picker and Current checkout',
    },
    {
      id: 'ch01/app-pull-requests-page',
      src: 'course/ch01/app-pull-requests-page.webp',
      hash: 'ac5c638405ce',
      width: 1920,
      height: 1080,
      alt: 'The Pull requests view on its Authored by me tab, listing the three practice pull requests. Failing stats check practice shows Failed',
    },
    {
      id: 'ch01/app-issues-page',
      src: 'course/ch01/app-issues-page.webp',
      hash: '09e6cab47ef6',
      width: 1920,
      height: 1080,
      alt: 'The Issues view on its Assigned to me tab, listing the five practice issues, such as Make search case-insensitive',
    },
    {
      id: 'ch01/app-automations-page',
      src: 'course/ch01/app-automations-page.webp',
      hash: '690be38e00a2',
      width: 1920,
      height: 1080,
      alt: 'The Automations view: Set up automations, templates such as Issue triage (Daily), Changelog draft (Weekly) and Repo audit (Manual), and the skills you can turn into automations',
    },
    {
      id: 'ch01/producer-control-room-modes',
      src: 'course/ch01/producer-control-room-modes.webp',
      hash: 'e31f0eb3029b',
      width: 1536,
      height: 1024,
      alt: 'A producer’s control room with a Chat Session and Project Session switch, and Interactive, Plan and Autopilot sections on the mixing desk',
    },
    {
      id: 'ch01/app-quick-chat',
      src: 'course/ch01/app-quick-chat.webp',
      hash: '0e15d445340b',
      width: 1920,
      height: 1080,
      alt: 'The Projects menu open: callout 1 on the + next to Projects and callout 2 on Chat, above the course project, Add GitHub repository, Clone repository and Open folder',
    },
    {
      id: 'ch01/session-mode-decision-ladder',
      src: 'course/ch01/session-mode-decision-ladder.webp',
      hash: '3ca6f6fbb217',
      width: 1536,
      height: 1024,
      alt: 'Session modes Interactive, Plan and Autopilot, with more autonomy from left to right: pick the mode that fits the task',
    },
    {
      id: 'ch01/app-settings',
      src: 'course/ch01/app-settings.webp',
      hash: '5bfe69fa74d5',
      width: 1920,
      height: 1080,
      alt: 'The Settings dialog on General, with General, Accounts, Sessions, Themes, Accessibility, Voice dictation, Customize, Model providers, Experimental and Projects, and an arrow to the gear at the bottom of the sidebar',
    },
  ],

  // One check per talk, on what's specific to the app or easy to mix up. Hotspots use the screen
  // as it looks before you act.
  quizzes: [
    {
      id: 'M1.1',
      type: 'matching',
      prompt: 'Match each challenge to what the Copilot app adds.',
      pairs: [
        {
          left: { id: 'shared', text: 'Two agent tasks change the same folder and branch' },
          right: { id: 'sessions', text: 'Project sessions keep focused work separate' },
        },
        {
          left: {
            id: 'scattered',
            text: 'Plan in chat, diff in the editor, tests in a terminal, PR in the browser',
          },
          right: {
            id: 'together',
            text: 'Sessions, diffs, terminal output, previews and GitHub work in one app',
          },
        },
        {
          left: { id: 'explore', text: 'A quick question feels the same as a real code change' },
          right: { id: 'chats', text: 'Chats for safe questions, project sessions for work in the repo' },
        },
        {
          left: { id: 'buried', text: 'Plan steps, checks and notes scroll away in a long chat' },
          right: { id: 'canvases', text: 'Canvases: a shared board in the side panel that you both update' },
        },
        {
          left: { id: 'repeat', text: 'Retyping the same prompt every week' },
          right: {
            id: 'automations',
            text: 'Automations run a saved prompt on demand, on a schedule or on events',
          },
        },
      ],
      explain: {
        correct:
          'That’s it. The app doesn’t replace your editor. It gives you one control center to run and review agent work.',
        wrong:
          'Think about what each problem needs: separation, one place for the evidence, a safe space, a shared board, or repetition.',
      },
      hints: [
        'Each challenge has one fix that answers it directly.',
        'Repeating yourself is a job for **Automations**. Mixing questions and changes is about **chats** versus **project sessions**.',
        'Shared copy → project sessions · scattered → one app · explore → chats · buried → canvases · repeat → Automations.',
      ],
      source: src('why-use-the-github-copilot-app', 'e71d52ac5d1c'),
    },
    {
      id: 'H1.1',
      type: 'hotspot',
      image: 'ch01/app-new-page',
      mask: [],
      prompt:
        'The setup script made practice issues in your fork and assigned them to you. Where do you find them in the app?',
      targets: [
        { id: 'issues', rect: NEW.issues, label: 'Issues', correct: true },
        {
          id: 'pull-requests',
          rect: NEW.pullRequests,
          label: 'Pull requests',
          feedback: '**Pull requests** lists pull requests. Issues have their own view, just below it.',
        },
        {
          id: 'new',
          rect: NEW.new,
          label: 'New',
          feedback: '**New** is where you start work. Your GitHub items are listed somewhere else.',
        },
        {
          id: 'automations',
          rect: NEW.automations,
          label: 'Automations',
          feedback: '**Automations** holds recurring agent tasks, not your issues.',
        },
        {
          id: 'project',
          rect: NEW.project,
          label: 'copilot-app-for-beginners',
          feedback: 'That’s your project and its sessions. Issues have their own view.',
        },
      ],
      explain: {
        correct:
          'Right! **Issues** lists the GitHub issues that involve you. The practice issues are on its **Assigned to me** tab, and the practice pull requests are in **Pull requests**.',
        wrong: 'Each kind of GitHub item has its own view near the top of the sidebar.',
      },
      hints: [
        'It’s one of the views at the top of the sidebar.',
        'Pull requests and issues each have their own view.',
        'Select **Issues**.',
      ],
      source: src('issues', 'dd5009d56d26', { src: 'course/ch01/app-new-page.webp', hash: '37be111c3c45' }),
    },
    {
      id: 'H1.2',
      type: 'hotspot',
      image: 'ch01/app-new-page',
      mask: [],
      prompt: 'Before you send, where do you check whether your prompt goes to a chat or to a project?',
      targets: [
        { id: 'picker', rect: NEW.picker, label: 'The project picker', correct: true },
        {
          id: 'mode',
          rect: NEW.mode,
          label: 'Interactive',
          feedback:
            'That’s the mode: how independently the agent works. Chat or project is picked just below the prompt.',
        },
        {
          id: 'model',
          rect: NEW.model,
          label: 'The model control',
          feedback:
            'That picks the model and effort. Where the prompt goes is set just below the prompt box.',
        },
        {
          id: 'checkout',
          rect: NEW.checkout,
          label: 'Current checkout',
          feedback:
            'That’s the workspace selector: where a project session runs. Chat or project is the picker beside it.',
        },
      ],
      explain: {
        correct:
          'Right! The project picker below the prompt box shows **Chat** or a project. For a chat, it says **Chat**, so nothing touches your repository and no branch is made.',
        wrong: 'It’s below the prompt box, where it says where your prompt will go.',
      },
      hints: [
        'Look below the prompt box, not in it.',
        'Right now it shows the project’s name.',
        'Select **copilot-app-for-beginners**, below the prompt box.',
      ],
      source: src('chat-sessions', '98f6ea579753', {
        src: 'course/ch01/app-new-page.webp',
        hash: '37be111c3c45',
      }),
    },
    {
      id: 'M1.2',
      type: 'matching',
      prompt: 'Match each task to the session mode that suits it.',
      pairs: [
        {
          left: { id: 'involved', text: 'You want to stay involved at every step' },
          right: { id: 'interactive', text: 'Interactive' },
        },
        {
          left: {
            id: 'approach',
            text: 'The approach and project details matter, so you want to see a plan first',
          },
          right: { id: 'plan', text: 'Plan' },
        },
        {
          left: { id: 'defined', text: 'A well-defined task with a clear outcome' },
          right: { id: 'autopilot', text: 'Autopilot' },
        },
      ],
      explain: {
        correct:
          'Exactly. The modes aren’t levels to work through. Pick the one that suits the task, as you did at each helm.',
        wrong:
          'Think about how much you want to be involved: every step, a plan to approve, or hand it over.',
      },
      hints: [
        'Remember the three helms: crew check-ins, a charted route, and a destination.',
        '**Plan** shows you the route before anything happens.',
        'Every step → Interactive · plan first → Plan · clear, well-defined task → Autopilot.',
      ],
      source: src('modes', '4a1370424345'),
    },
    {
      id: 'H1.3',
      type: 'hotspot',
      image: 'ch01/app-new-page',
      mask: [],
      prompt: 'Where do you choose the model and its reasoning effort?',
      targets: [
        { id: 'model', rect: NEW.model, label: 'The model control', correct: true },
        {
          id: 'mode',
          rect: NEW.mode,
          label: 'Interactive',
          feedback:
            'Close, it’s right next to it! That’s the mode selector: it sets how independently the agent works.',
        },
        {
          id: 'plus',
          rect: NEW.promptPlus,
          label: '+ in the prompt box',
          feedback: 'That **+** adds things to your prompt. The model has its own control below the prompt.',
        },
        {
          id: 'picker',
          rect: NEW.picker,
          label: 'The project picker',
          feedback: 'That’s the project picker: chat or project. The model control is in the prompt box.',
        },
      ],
      explain: {
        correct:
          'Right! Open the model control to find **Model**, **Effort** and **Context window**. It shows **Auto** or a model name. If the **Auto** switch is on, those settings are hidden, so turn it off to see them. Some app versions show separate model and reasoning controls.',
        wrong: 'It’s next to the mode selector and shows **Auto** or a model name.',
      },
      hints: [
        'It’s in the bottom row of the prompt box.',
        'It sits right beside the mode selector and shows a model’s name.',
        'Select **GPT-6.1 Sol · Medium**.',
      ],
      source: src('models-and-reasoning-effort', '84d625491118', {
        src: 'course/ch01/app-new-page.webp',
        hash: '37be111c3c45',
      }),
    },
    {
      id: 'H1.4',
      type: 'hotspot',
      image: 'ch01/app-settings',
      mask: [],
      prompt: 'You want to give the app instructions that apply to every session. Which settings area?',
      targets: [
        { id: 'sessions', rect: SETTINGS.sessions, label: 'Sessions', correct: true },
        {
          id: 'general',
          rect: SETTINGS.general,
          label: 'General',
          feedback: '**General** covers updates, where repositories are stored, and the theme.',
        },
        {
          id: 'customize',
          rect: SETTINGS.customize,
          label: 'Customize',
          feedback:
            '**Customize** points you to the **Customize** view, where you extend the app. Instructions live with your session settings.',
        },
        {
          id: 'providers',
          rect: SETTINGS.providers,
          label: 'Model providers',
          feedback:
            '**Model providers** connects other providers with your own API keys. It doesn’t replace the model picker.',
        },
      ],
      explain: {
        correct:
          'Right! **Sessions** is where you manage sessions and chats, set the response style and app-wide instructions, and configure branch naming.',
        wrong: 'App-wide instructions shape every session, so look for the area named after them.',
      },
      hints: [
        'Instructions apply to the work the agent does in a session.',
        'The area is named after what it configures.',
        'Select **Sessions**.',
      ],
      source: src('settings', '5b95eb5b50e3', { src: 'course/ch01/app-settings.webp', hash: '5bfe69fa74d5' }),
    },

    // ---- The Admiral's Exam (A1): the chapter's six key takeaways ----
    {
      id: 'A1.1',
      type: 'scenario',
      situation: 'You want to step through a tricky function with breakpoints and edit it by hand.',
      prompt: 'Where do you do that?',
      options: [
        { id: 'editor', text: 'In your editor, such as VS Code' },
        {
          id: 'autopilot',
          text: 'In the app, with an Autopilot session',
          feedback:
            'The app runs and reviews agent work. Deep hands-on editing and debugging stay in your editor.',
        },
        {
          id: 'automation',
          text: 'In an automation',
          feedback: 'Automations are for repeatable agent runs, not hands-on debugging.',
        },
      ],
      answer: 'editor',
      explain: {
        correct: 'Right. Keep your editor for deep coding. The app is for running and reviewing agent work.',
        wrong: 'The app isn’t a replacement for your editor.',
      },
      source: src('key-takeaways', 'c91fe4b46114'),
    },
    {
      id: 'A1.2',
      type: 'mc',
      prompt:
        'You’re in a project session in the app and want the full editor on the same project. What do you do?',
      options: [
        { id: 'open', text: 'Open the project in VS Code from the app' },
        {
          id: 'clone',
          text: 'Clone the repository again in your editor',
          feedback: 'No need. The app opens the project in VS Code for you.',
        },
        {
          id: 'switch',
          text: 'Switch the session to Current checkout first',
          feedback:
            'That’s a workspace choice for the session. You can open the project in VS Code any time.',
        },
      ],
      answer: 'open',
      explain: {
        correct: 'Right. You can jump to VS Code from the app whenever you want the full editor.',
        wrong: 'The app can open the project in VS Code for you, any time.',
      },
      source: src('why-use-the-github-copilot-app', 'e71d52ac5d1c'),
    },
    {
      id: 'A1.3',
      type: 'matching',
      prompt: 'Match each need to where it lives in the app.',
      pairs: [
        {
          left: { id: 'start', text: 'Start a chat or a project session' },
          right: { id: 'new', text: 'New' },
        },
        {
          left: { id: 'checks', text: 'Read a pull request’s checks and comments' },
          right: { id: 'pull-requests', text: 'Pull requests' },
        },
        {
          left: { id: 'assigned', text: 'Find the issues assigned to you' },
          right: { id: 'issues', text: 'Issues' },
        },
        {
          left: { id: 'weekly', text: 'Run a pull request summary every week' },
          right: { id: 'automations', text: 'Automations' },
        },
        {
          left: { id: 'extend', text: 'Add an MCP server or a skill later' },
          right: { id: 'customize', text: 'Customize' },
        },
      ],
      explain: {
        correct:
          'Right. New, Pull requests, Issues, Automations and Customize, with Projects for your chats and sessions, are the app’s work surfaces.',
        wrong: 'Picture Mina’s tour: the Voyage Office, the Bounty Board, the Clock Tower and the Outfitter.',
      },
      source: src('tour-the-app', 'a583ed20b8e9'),
    },
    {
      id: 'A1.4',
      type: 'scenario',
      situation: 'You want to ask how regular expressions work in general. You don’t need your repository.',
      prompt: 'What do you start?',
      options: [
        { id: 'chat', text: 'A chat session' },
        {
          id: 'project',
          text: 'A project session',
          feedback: 'A project session gives the agent your repository. A general question doesn’t need it.',
        },
        {
          id: 'automation',
          text: 'An automation',
          feedback: 'Automations are for work you repeat. This is a one-off question.',
        },
      ],
      answer: 'chat',
      explain: {
        correct: 'Right. Chats are for exploring and asking, and they don’t make a branch or a worktree.',
        wrong: 'General questions and brainstorming belong in a chat.',
      },
      source: src('projects-and-chats', '2e0d39688597'),
    },
    // Sea battle 2, waves 2 and 3 (the bosun's questions; .plans/battle-plan.md "Teaching map").
    {
      id: 'N1.1',
      type: 'mc',
      prompt:
        'You want the agent to ask before every tool it uses. Which **Tool permissions** setting do you pick?',
      options: [
        { id: 'always', text: '**Always ask**' },
        { id: 'approve', text: '**Approve all**', feedback: '**Approve all** runs tools without asking.' },
        {
          id: 'assisted',
          text: '**Assisted**',
          feedback: '**Assisted** asks only when a tool request fails an AI safety check.',
        },
      ],
      answer: 'always',
      explain: {
        correct:
          'Right. **Always ask** asks each time. Check this setting so you know when to expect approval requests.',
        wrong: 'Pick the setting that asks each time.',
      },
      source: src('modes', '4a1370424345'),
    },
    {
      id: 'N1.2',
      type: 'mc',
      prompt: 'Does a higher **Reasoning effort** guarantee a correct answer?',
      options: [
        { id: 'no', text: 'No. It can help with complex problems, but it can take longer.' },
        { id: 'yes', text: 'Yes', feedback: 'Higher effort does not guarantee a correct answer.' },
        {
          id: 'auto',
          text: 'Only when the model is set to **Auto**',
          feedback:
            'With **Auto**, the app chooses the model. Higher effort still doesn’t guarantee a correct answer.',
        },
      ],
      answer: 'no',
      explain: {
        correct:
          'Right. Higher effort can help with complex problems, but can take longer. Higher effort does not guarantee a correct answer.',
        wrong: 'More effort isn’t a promise of a right answer.',
      },
      source: src('models-and-reasoning-effort', '84d625491118'),
    },
    // Your setup: one of N1.3 and N1.4, for what the player says they kept in the model control.
    {
      id: 'N1.3',
      type: 'mc',
      prompt: 'You kept **Auto** in the model control. Where does the app tell you which model it chose?',
      options: [
        { id: 'conversation', text: 'In the conversation, with a short reason for its choice' },
        {
          id: 'settings',
          text: 'In **Settings**',
          feedback: 'With **Auto**, the app says which model it picked right in the conversation.',
        },
        {
          id: 'hidden',
          text: 'Nowhere: **Auto** hides the model',
          feedback:
            'The **Auto** switch hides **Model**, **Effort** and **Context window**, but the conversation still shows which model the app picked.',
        },
      ],
      answer: 'conversation',
      explain: {
        correct:
          'Right. With **Auto**, the app chooses a model for your task and shows which one it picked in the conversation, with a short reason why.',
        wrong: 'Look where the app answers you.',
      },
      hints: [
        'It’s where the reply appears.',
        'Not a menu: the conversation itself.',
        'In the conversation.',
      ],
      source: src('models-and-reasoning-effort', '84d625491118'),
    },
    {
      id: 'N1.4',
      type: 'mc',
      prompt:
        'Your model control shows {model}. Partway through the session, you want a different model or effort. What do you do?',
      options: [
        { id: 'change', text: 'Change it in the model control. The session keeps its mode.' },
        {
          id: 'new',
          text: 'Start a new session',
          feedback: 'You don’t need a new session. You can change the model and effort mid-session.',
        },
        {
          id: 'mode',
          text: 'Switch the mode to **Autopilot** first',
          feedback: '**Autopilot** is a mode. Changing the model or effort doesn’t change the mode.',
        },
      ],
      answer: 'change',
      explain: {
        correct:
          'Right. You can change the model and reasoning effort during a session without changing its mode.',
        wrong: 'Oren said you can change them mid-session.',
      },
      hints: [
        'You don’t have to start again.',
        'The mode stays as it is.',
        'Change it in the model control.',
      ],
      source: src('try-the-controls', '1a9a4b2f69f1'),
    },
    // The course's one shortcut, in the player's computer's keys (Your setup).
    {
      id: 'N1.5',
      type: 'mc',
      prompt: 'Where do you find the prompts you sent before, across all your sessions?',
      options: [
        { id: 'history', text: 'Press **{key:mod+R}** for your prompt history' },
        {
          id: 'hash',
          text: 'Type `#` in the prompt box',
          feedback: '`#` attaches issues and pull requests.',
        },
        { id: 'slash', text: 'Type `/` in the prompt box', feedback: '`/` runs commands.' },
      ],
      answer: 'history',
      explain: {
        correct:
          'Right. **{key:mod+R}** opens your prompt history, across all sessions. Search it, and select a prompt to reuse it.',
        wrong: 'It’s a keyboard shortcut, not a character you type.',
      },
      hints: ['It’s a keyboard shortcut.', 'Hold one key and press R.', 'Press {key:mod+R}.'],
      source: src('prompts-and-shortcuts', '06812f77c4eb'),
    },
    {
      id: 'A1.5',
      type: 'mc',
      prompt: 'Which workspace should most project sessions use?',
      options: [
        { id: 'worktree', text: 'New worktree' },
        {
          id: 'local',
          text: 'Current checkout',
          feedback:
            'You picked **Current checkout** for the one-time setup in Chapter 00. That was the exception, and you’ll switch back in Chapter 02.',
        },
      ],
      answer: 'worktree',
      explain: {
        correct:
          'Right. Separate worktrees let agents work at the same time without changing the same working copy.',
        wrong: 'The right choice keeps each session’s changes apart from the others.',
      },
      source: src('project-sessions', 'b8e172159d21'),
    },
    {
      id: 'A1.6',
      type: 'matching',
      prompt: 'Match each mode to how the app describes it.',
      pairs: [
        {
          left: { id: 'interactive', text: 'Interactive' },
          right: { id: 'step', text: 'Step-by-step collaboration' },
        },
        {
          left: { id: 'plan', text: 'Plan' },
          right: { id: 'first', text: 'Plan first, execute when ready' },
        },
        {
          left: { id: 'autopilot', text: 'Autopilot' },
          right: { id: 'end', text: 'End-to-end execution without interruption' },
        },
      ],
      explain: {
        correct:
          'Right. The modes change the level of autonomy: how much the agent does before it checks with you.',
        wrong: 'Think of the helms: crew check-ins, an approved route, then a destination.',
      },
      source: src('modes', '4a1370424345'),
    },
    {
      id: 'A1.7',
      type: 'mc',
      prompt: 'The model control says **Auto**. What does that mean?',
      options: [
        { id: 'model', text: 'The app chooses a model for your task' },
        {
          id: 'autopilot',
          text: 'The session will run in Autopilot mode',
          feedback: '**Autopilot** is a mode. **Auto** is about which model handles your request.',
        },
        {
          id: 'effort',
          text: 'The reasoning effort is set to the highest level',
          feedback: 'Effort is its own setting. **Auto** is about the model.',
        },
      ],
      answer: 'model',
      explain: {
        correct:
          'Right. With **Auto**, the app picks the model. **Autopilot** is different: it controls how independently the agent works.',
        wrong: 'Auto and Autopilot sound alike but control different things.',
      },
      source: src('models-and-reasoning-effort', '84d625491118'),
    },
    {
      id: 'A1.8',
      type: 'hotspot',
      image: 'ch01/app-new-page',
      mask: [],
      prompt: 'You want the agent to show you a plan before it changes anything. What do you select?',
      targets: [
        { id: 'mode', rect: NEW.mode, label: 'The mode selector (Interactive)', correct: true },
        {
          id: 'model',
          rect: NEW.model,
          label: 'The model control',
          feedback: 'The model control changes which model answers, not how independently it works.',
        },
        {
          id: 'picker',
          rect: NEW.picker,
          label: 'The project picker',
          feedback: 'That picks chat or project. The mode is chosen in the prompt box.',
        },
        {
          id: 'automations',
          rect: NEW.automations,
          label: 'Automations',
          feedback: 'Automations are saved, repeatable runs. Plan is a session mode.',
        },
      ],
      explain: {
        correct: 'Right. Open the mode selector (it says **Interactive** now) and pick **Plan**.',
        wrong: 'Modes are chosen below the prompt, where it says **Interactive**.',
      },
      source: src('modes', '4a1370424345', { src: 'course/ch01/app-new-page.webp', hash: '37be111c3c45' }),
    },
    {
      id: 'A1.9',
      type: 'multi',
      prompt: 'Which of these are true? Select all that apply.',
      options: [
        { id: 'default', text: 'For a short explanation, keep **Auto** or your model’s default effort' },
        {
          id: 'switch',
          text: 'You can change the model and effort during a session without changing its mode',
        },
        {
          id: 'guarantee',
          text: 'Higher effort guarantees a correct answer',
          feedback:
            'Higher effort can help with complex problems, but it doesn’t guarantee a correct answer.',
        },
        {
          id: 'providers',
          text: '**Model providers** in Settings replaces the model picker',
          feedback: 'Model providers connects more providers. You still choose below the prompt box.',
        },
      ],
      answers: ['default', 'switch'],
      explain: {
        correct: 'Right. Keep the defaults for simple tasks, and consider higher effort for complex work.',
        wrong:
          'Two are true. Higher effort helps but guarantees nothing, and Model providers adds providers.',
      },
      source: src('models-and-reasoning-effort', '84d625491118'),
    },
  ],

  pages: [
    {
      id: 'pg1.why',
      title: 'Why use the Copilot app',
      image: 'ch01/editor-vs-app',
      caption:
        'Copilot in your editor or terminal is great next to the code you have open. The hard part is supervising agent work end to end. The app doesn’t replace your editor. It’s one desktop control center to run and review that work: **project sessions** keep focused work separate, sessions, diffs, terminal output, previews and GitHub work sit in **one app**, **chats** are for safe questions, **canvases** give you and the agent a shared board in the side panel, and **Automations** save a prompt you’d otherwise retype.',
      source: src('why-use-the-github-copilot-app', 'e71d52ac5d1c'),
    },
    {
      id: 'pg1.editor',
      title: 'Keep your editor',
      caption:
        'Keep VS Code, Visual Studio, JetBrains or your usual editor for deep editing. From the app, you can open the same project in VS Code any time you want a full editor.',
      source: src('why-use-the-github-copilot-app', 'e71d52ac5d1c'),
    },
    {
      id: 'pg1.new',
      title: 'New',
      image: 'ch01/app-new-page',
      caption:
        'The landing view. Start a chat without a project, pick a connected project for a project session, choose a mode and model, or start from one of the suggested prompts.',
      source: src('new', '2089b0a43f88'),
    },
    {
      id: 'pg1.pull-requests',
      title: 'Pull requests',
      image: 'ch01/app-pull-requests-page',
      caption:
        'Lists the GitHub pull requests that involve you. Tabs such as **Authored by me** and **Review requests** filter the list, and the **All repositories** picker narrows it to one repository. Open a pull request to read its checks and comments, or start a session to work on it. The practice pull requests from setup are on the **Authored by me** tab.',
      source: src('pull-requests', 'b7a35175db25'),
    },
    {
      id: 'pg1.issues',
      title: 'Issues',
      image: 'ch01/app-issues-page',
      caption:
        'The same idea for GitHub issues, with tabs such as **Assigned to me** and **Created by me**. Start a session from an issue, or select **New issue** to create one. The practice issues from setup are assigned to you, so they’re on the **Assigned to me** tab.',
      source: src('issues', 'dd5009d56d26'),
    },
    {
      id: 'pg1.automations',
      title: 'Automations',
      image: 'ch01/app-automations-page',
      caption:
        'Recurring agent tasks. The view shows templates that run manually, daily or weekly, and automations can also be triggered by events. You choose local or cloud execution when you set one up. Chapter 07 covers automations.',
      source: src('automations', '6963992826ba'),
    },
    {
      id: 'pg1.customize',
      title: 'Customize',
      caption:
        'Where you manage the ways to extend the app: skills, Model Context Protocol (MCP) servers, plugins, extensions and canvases. You don’t need any yet. Chapter 04 covers skills and custom agents, Chapter 05 MCP servers and plugins, and Chapter 06 canvases.',
      source: src('customize', '40d6c4c7a5bf'),
    },
    {
      id: 'pg1.more',
      title: 'More',
      caption:
        'Select **More**, then **Edit sidebar...** to choose which views appear in the sidebar. The course uses all of them, so keep them visible.',
      source: src('more', '16538ba2b64e'),
    },
    {
      id: 'pg1.projects-chats',
      title: 'Chats and project sessions',
      caption:
        'The **Projects** area of the sidebar lists each connected project, and a **Chats** row appears there once you’ve started your first chat. A **chat session** is for asking, brainstorming, summarizing and getting your bearings, and it doesn’t create a branch or worktree. A **project session** is for planning, inspecting, editing, testing or making PR-ready work, and usually creates one, depending on session settings.',
      source: src('chats-project-sessions-and-modes', 'b86c511bd0da'),
    },
    {
      id: 'pg1.control-room',
      title: 'In the control room',
      image: 'ch01/producer-control-room-modes',
      caption:
        'A producer doesn’t handle every song the same way. Some quick questions just need a fast answer, some takes need close direction, and some need the arrangement charted first. The app works the same way: first choose the kind of session, then a mode for how closely you direct the work.',
      source: src('from-the-studio-in-the-control-room', '7847b6fe96d3'),
    },
    {
      id: 'pg1.chat',
      title: 'Start a chat',
      image: 'ch01/app-quick-chat',
      caption:
        'Select **+** next to **Projects**, then **Chat**. Check that the project picker below the prompt box shows **Chat**, then send the prompt. The reply should say chats suit general questions and project sessions bring repository context. It shouldn’t change any files, and the app doesn’t create a branch or worktree for a chat.',
      code: CH01_PROMPTS.chat,
      source: src('chat-sessions', '98f6ea579753'),
    },
    {
      id: 'pg1.project',
      title: 'Tour the sample in a project session',
      caption:
        'Use a project session when the agent needs your repository, changes code or makes something like a pull request. Most project sessions should use a **New worktree**. Chapter 00’s setup session on **Current checkout** was the exception. The app remembers that choice for your next session, so you’ll switch back to **New worktree** in Chapter 02. Return to the setup session, listed under `copilot-app-for-beginners` in the sidebar, and send this. The reply should cover `samples/book-app-web`’s purpose, technologies, main files, data flow and tests, and change nothing.',
      code: CH01_PROMPTS.tour,
      source: src('project-sessions', 'b8e172159d21'),
    },
    {
      id: 'pg1.modes',
      title: 'Interactive, Plan and Autopilot',
      image: 'ch01/session-mode-decision-ladder',
      caption:
        '**Interactive**: step-by-step collaboration, for when you want to be involved throughout. **Plan**: plan first, execute when ready, for when the approach and details matter. **Autopilot**: end-to-end execution without interruption, for well-defined tasks with clear outcomes. Pick the mode that fits the task. The mode menu also has **Tool permissions**: **Always ask** asks before each tool, **Approve all** runs tools without asking, and **Assisted** asks only when a tool request fails an AI safety check.',
      source: src('modes', '4a1370424345'),
    },
    {
      id: 'pg1.model',
      title: 'Model and reasoning effort',
      caption:
        'The model control sits below the prompt box, next to the mode selector, and shows **Auto** or a model name. Open it for **Model**, **Effort** and **Context window**. If the **Auto** switch is on, they’re hidden, so turn it off to see them. With **Auto** the app picks a model, then tells you in the conversation which one it chose and why. That isn’t the same as **Autopilot**. The context window is how much text the model can hold at once; a larger one can help long sessions or large codebases, but uses more AI credits. For a tour or a short explanation, keep the defaults. For a hard bug or a change across several files, consider a model suited to complex coding and higher effort. Higher effort doesn’t guarantee a correct answer. If a response doesn’t work for you, select **Retry** below it to try again with a different model, effort or context window, without retyping your prompt.',
      source: src('models-and-reasoning-effort', '84d625491118'),
    },
    {
      id: 'pg1.try-controls',
      title: 'Try the controls',
      caption:
        'In your project session, select **Interactive** mode. Open the model control, keep **Auto** or your current model and the default effort, and send this. The reply should say search matches titles and authors whatever the letter case, and point to `samples/book-app-web/src/App.tsx`. You can change the model and effort mid-session without changing the mode.',
      code: CH01_PROMPTS.filterBooks,
      setup: ['model'],
      source: src('try-the-controls', '1a9a4b2f69f1'),
    },
    {
      id: 'pg1.prompts',
      title: 'Prompts and shortcuts',
      caption:
        'You’ll type most prompts in the composer box below the session. Press **{key:mod+R}** to see your recent prompts across all sessions: search them, and select one to reuse it. Type `@` to attach files and folders, `#` for issues and pull requests, and `/` to run commands.',
      setup: ['os'],
      source: src('prompts-and-shortcuts', '06812f77c4eb'),
    },
    {
      id: 'pg1.settings',
      title: 'Settings',
      image: 'ch01/app-settings',
      caption:
        'Select the gear at the bottom of the sidebar to open **Settings**. **General**: updates, where repositories are stored, the theme. **Accounts**: add another GitHub account. **Sessions**: manage sessions and chats, response style, app-wide instructions, branch naming. **Themes**: pick and customize the app theme. **Accessibility**: zoom, keyboard shortcuts, notifications. **Voice dictation**: microphone, shortcut, transcription models. **Customize**: points you to the **Customize** view. **Model providers**: your own API keys (it doesn’t replace the model picker). **Experimental**: preview features. **Projects**: per-project settings, such as **Show in sidebar**, sandbox rules and the default branch.',
      source: src('settings', '5b95eb5b50e3'),
    },
    {
      id: 'pg1.voice',
      title: 'Voice dictation (optional)',
      caption:
        'Voice dictation turns speech into editable prompt text, and it’s on by default. In **Settings**, select **Voice dictation** to set up your input device, and change the microphone or transcription model if you need to. Under **Microphone privacy**, select **Open preferences** to allow the microphone in your operating system, then select **Test mic** and note the shortcut. Then start a new chat (**+** next to **Projects**, then **Chat**) and try the shortcut.',
      source: src('settings', '5b95eb5b50e3'),
    },
    {
      id: 'pg1.next',
      title: 'Next: Chapter 02',
      caption:
        'Chapter 02 solves the “shared working copy” challenge: isolated sessions with worktrees, plus focused context with `@`, `#` and `/`. [Continue to Chapter 02 ↗](https://github.com/github/copilot-app-for-beginners/blob/main/02-sessions-worktrees-context/README.md)',
      source: src('whats-next', '379b67eeb747'),
    },
    {
      id: 'B1.1',
      title: 'I can’t find a setting',
      caption:
        'Settings vary by app version, operating system, organization policy and enabled features. Look for the closest matching category, then check the official docs if the screen still doesn’t match.',
      source: src('i-cannot-find-a-setting-shown-in-the-chapter', 'a78cb1a046e1'),
    },
    {
      id: 'B1.2',
      title: 'Voice dictation doesn’t work',
      caption:
        'Check microphone permission, whether the local transcription model has downloaded, shortcut conflicts, and language support.',
      source: src('voice-dictation-does-not-work', 'cd335d6b8206'),
    },
    {
      id: 'B1.3',
      title: 'A mode or model is missing',
      caption:
        'Check your plan, your organization’s policy, your project settings and your app version. Available models and effort levels vary, and some models don’t offer an effort setting.',
      source: src('a-mode-or-model-option-is-missing', '980596b3795d'),
    },
  ],

  chests: [
    // Lyra's chest on the tavern stage: the control-room analogy. (Pell files the troubleshooting.)
    { id: 'C1.1', page: 'pg1.control-room', doubloons: 10 },
  ],

  glossary: [
    {
      id: 'chat-session',
      term: 'Chat session',
      definition: 'A session for questions and brainstorming. It doesn’t create a branch or worktree.',
    },
    {
      id: 'pull-requests',
      term: 'Pull requests (view)',
      definition:
        'The sidebar view that lists the pull requests that involve you, with tabs such as Authored by me and Review requests.',
    },
    {
      id: 'issues',
      term: 'Issues (view)',
      definition:
        'The sidebar view that lists the issues that involve you, with tabs such as Assigned to me and Created by me.',
    },
    {
      id: 'automations',
      term: 'Automations',
      definition: 'Saved agent tasks that run on demand, on a schedule, or from selected GitHub events.',
    },
    {
      id: 'customize',
      term: 'Customize',
      definition: 'Where you manage skills, MCP servers, plugins, extensions and canvases.',
    },
    {
      id: 'session-modes',
      term: 'Session modes',
      definition:
        'Interactive (step by step), Plan (plan first, execute when ready) and Autopilot (end to end without interruption).',
    },
    {
      id: 'tool-permissions',
      term: 'Tool permissions',
      definition:
        'In the mode menu: whether the agent asks before it uses a tool. Always ask, Approve all, or Assisted (asks only when a request fails an AI safety check).',
    },
    {
      id: 'auto-model',
      term: 'Auto (model)',
      definition: 'The app chooses a model for your task. Not the same as Autopilot mode.',
    },
    {
      id: 'reasoning-effort',
      term: 'Reasoning effort',
      definition:
        'How much reasoning a supported model uses. Higher can help with complex problems but takes longer.',
    },
    {
      id: 'context-window',
      term: 'Context window',
      definition:
        'How much text the model can hold at once, including the conversation and the files it reads. Larger can help long sessions but uses more AI credits.',
    },
    {
      id: 'model-providers',
      term: 'Model providers',
      definition: 'A setting that connects models from other providers with your own API keys.',
    },
  ],

  trials: [
    {
      id: 'A1',
      title: 'The Admiral’s Exam',
      items: ['A1.1', 'A1.2', 'A1.3', 'A1.4', 'A1.5', 'A1.6', 'A1.7', 'A1.8', 'A1.9'],
      reward: { seal: 'Seal of Meridian', doubloons: 60 },
    },
  ],

  // The course section each voiced teaching line paraphrases (PLAN §8.3): the drift report flags
  // a line when its section changes upstream. Banter and directions aren't listed.
  voiced: {
    'mer.tobias.01': src('why-use-the-github-copilot-app', 'e71d52ac5d1c'),
    'mer.tobias.02': src('why-use-the-github-copilot-app', 'e71d52ac5d1c'),
    'mer.tobias.03': src('why-use-the-github-copilot-app', 'e71d52ac5d1c'),
    'mer.tobias.04': src('why-use-the-github-copilot-app', 'e71d52ac5d1c'),
    'mer.tobias.05': src('why-use-the-github-copilot-app', 'e71d52ac5d1c'),
    'mer.tobias.06': src('why-use-the-github-copilot-app', 'e71d52ac5d1c'),
    'mer.mina.01': src('tour-the-app', 'a583ed20b8e9'),
    'mer.mina.new': src('new', '2089b0a43f88'),
    'mer.mina.board': src('pull-requests', 'b7a35175db25'),
    'mer.mina.board2': src('issues', 'dd5009d56d26'),
    'mer.mina.automations': src('automations', '6963992826ba'),
    'mer.mina.customize': src('customize', '40d6c4c7a5bf'),
    'mer.mina.more': src('more', '16538ba2b64e'),
    'mer.mina.projects': src('projects-and-chats', '2e0d39688597'),
    'mer.lyra.02': src('from-the-studio-in-the-control-room', '7847b6fe96d3'),
    'mer.lyra.03': src('chat-sessions', '98f6ea579753'),
    'mer.lyra.04': src('chat-sessions', '98f6ea579753'),
    'mer.lyra.05': src('chat-sessions', '98f6ea579753'),
    'mer.lyra.06': src('chat-sessions', '98f6ea579753'),
    'mer.anders.01': src('project-sessions', 'b8e172159d21'),
    'mer.anders.02': src('project-sessions', 'b8e172159d21'),
    'mer.anders.03': src('project-sessions', 'b8e172159d21'),
    'mer.anders.04': src('project-sessions', 'b8e172159d21'),
    'mer.anders.05': src('project-sessions', 'b8e172159d21'),
    'mer.rhea.02': src('modes', '4a1370424345'),
    'mer.rhea.03': src('modes', '4a1370424345'),
    'mer.rhea.tools': src('modes', '4a1370424345'),
    'mer.oren.01': src('models-and-reasoning-effort', '84d625491118'),
    'mer.oren.02': src('models-and-reasoning-effort', '84d625491118'),
    'mer.oren.03': src('models-and-reasoning-effort', '84d625491118'),
    'mer.oren.auto': src('models-and-reasoning-effort', '84d625491118'),
    'mer.oren.04': src('models-and-reasoning-effort', '84d625491118'),
    'mer.oren.05': src('models-and-reasoning-effort', '84d625491118'),
    'mer.oren.06': src('models-and-reasoning-effort', '84d625491118'),
    'mer.oren.context': src('models-and-reasoning-effort', '84d625491118'),
    'mer.oren.07': src('try-the-controls', '1a9a4b2f69f1'),
    'mer.oren.08': src('try-the-controls', '1a9a4b2f69f1'),
    'mer.pell.01': src('settings', '5b95eb5b50e3'),
    'mer.pell.02': src('settings', '5b95eb5b50e3'),
    'mer.pell.03': src('settings', '5b95eb5b50e3'),
    'mer.pell.04': src('settings', '5b95eb5b50e3'),
    'mer.pell.05': src('settings', '5b95eb5b50e3'),
    'mer.admiral.next': src('whats-next', '379b67eeb747'),
  },
};
