import type { ChapterContent, Rect } from '../types';

const ch = '01-tour-the-app' as const;
const src = (anchor: string) => ({ chapter: ch, anchor });

/** A rect in the course's 1920 × 1080 app screenshots, in pixels → normalized. */
const px = (x: number, y: number, w: number, h: number): Rect => [x / 1920, y / 1080, w / 1920, h / 1080];

// app-new-page (measured from the course image): the sidebar rows and the controls round the prompt box.
const NEW = {
  new: px(10, 68, 330, 40),
  myWork: px(10, 108, 330, 40),
  automations: px(10, 148, 330, 40),
  customize: px(10, 188, 330, 40),
  projectsPlus: px(300, 250, 36, 34),
  chats: px(10, 284, 280, 38),
  project: px(10, 364, 330, 38),
  promptPlus: px(666, 528, 32, 36),
  mode: px(702, 530, 90, 32),
  model: px(796, 530, 168, 32),
  picker: px(664, 580, 86, 34),
  mic: px(1525, 530, 32, 32),
} as const;

// app-settings: the Settings list on the left of the dialog.
const SETTINGS = {
  general: px(400, 198, 270, 36),
  accounts: px(400, 238, 270, 36),
  sessions: px(400, 278, 270, 36),
  themes: px(400, 318, 270, 36),
  accessibility: px(400, 358, 270, 36),
  voice: px(400, 398, 270, 36),
  customize: px(400, 458, 270, 36),
  providers: px(400, 498, 270, 36),
  experimental: px(400, 558, 270, 36),
} as const;

/** The course's prompts for this chapter, word for word. */
export const CH01_PROMPTS = {
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
      width: 1536,
      height: 1024,
      alt: 'Your editor for deep coding beside the GitHub Copilot app for running and reviewing agent work',
    },
    {
      id: 'ch01/app-new-page',
      src: 'course/ch01/app-new-page.webp',
      width: 1920,
      height: 1080,
      alt: 'The New page: New, My work, Automations and Customize in the sidebar, Projects with Chats and the course project, and the prompt box with the mode, model and Chat controls',
    },
    {
      id: 'ch01/app-my-work-page',
      src: 'course/ch01/app-my-work-page.webp',
      width: 1920,
      height: 1080,
      alt: 'My work, listing the course’s practice issues and pull requests, one with a failed check',
    },
    {
      id: 'ch01/app-automations-page',
      src: 'course/ch01/app-automations-page.webp',
      width: 1920,
      height: 1080,
      alt: 'The Automations page with daily, weekly and manual templates such as Issue triage and Changelog draft',
    },
    {
      id: 'ch01/producer-control-room-modes',
      src: 'course/ch01/producer-control-room-modes.webp',
      width: 1536,
      height: 1024,
      alt: 'A producer in a recording studio’s control room, directing takes in different ways',
    },
    {
      id: 'ch01/app-quick-chat',
      src: 'course/ch01/app-quick-chat.webp',
      width: 1920,
      height: 1080,
      alt: 'A new quick chat: callout 1 on the + beside Chats, callout 2 on the project picker below the prompt, open with Chat checked',
    },
    {
      id: 'ch01/session-mode-decision-ladder',
      src: 'course/ch01/session-mode-decision-ladder.webp',
      width: 1248,
      height: 832,
      alt: 'Session modes Interactive, Plan and Autopilot side by side: pick one for the task',
    },
    {
      id: 'ch01/app-settings',
      src: 'course/ch01/app-settings.webp',
      width: 1920,
      height: 1080,
      alt: 'The Settings dialog: General, Accounts, Sessions, Themes, Accessibility, Voice dictation, Customize, Model providers and Experimental',
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
          left: { id: 'repeat', text: 'Retyping the same prompt every week' },
          right: {
            id: 'automations',
            text: 'Automations run a saved prompt on demand, on a schedule or on events',
          },
        },
      ],
      explain: {
        correct:
          'That’s it. The app doesn’t replace your editor. It gives agent work one place to run and be reviewed.',
        wrong:
          'Think about what each problem needs: separation, one place for the evidence, a safe space, or repetition.',
      },
      hints: [
        'Each challenge has one fix that answers it directly.',
        'Repeating yourself is a job for **Automations**. Mixing questions and changes is about **chats** versus **project sessions**.',
        'Shared copy → project sessions · scattered → one app · explore → chats · repeat → Automations.',
      ],
      source: src('the-solution'),
    },
    {
      id: 'H1.1',
      type: 'hotspot',
      image: 'ch01/app-new-page',
      mask: [],
      prompt:
        'The setup script made practice issues and pull requests in your fork. Where do they show up in the app?',
      targets: [
        { id: 'my-work', rect: NEW.myWork, label: 'My work', correct: true },
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
          feedback: '**Automations** holds recurring agent tasks, not your issues and pull requests.',
        },
        {
          id: 'project',
          rect: NEW.project,
          label: 'copilot-app-for-beginners',
          feedback: 'That’s your project and its sessions. Issues and pull requests have their own page.',
        },
      ],
      explain: {
        correct:
          'Right! **My work** is your GitHub inbox: issues, pull requests and review requests. You can start work on one from there.',
        wrong: 'Look for your GitHub inbox in the sidebar, near the top.',
      },
      hints: [
        'It’s one of the four pages at the top of the sidebar.',
        'Issues, pull requests and review requests are *your work*.',
        'Select **My work**.',
      ],
      source: src('my-work'),
    },
    {
      id: 'H1.2',
      type: 'hotspot',
      image: 'ch01/app-new-page',
      mask: [],
      prompt:
        'You’ve started a quick chat. Before you send, where do you check it’s a chat and not a project session?',
      targets: [
        { id: 'picker', rect: NEW.picker, label: 'The project picker (Chat)', correct: true },
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
          id: 'projects-plus',
          rect: NEW.projectsPlus,
          label: '+ by Projects',
          feedback: 'That adds a project to the app. Check the picker below the prompt instead.',
        },
      ],
      explain: {
        correct:
          'Right! The project picker below the prompt says **Chat**, so nothing touches your repository and no branch is made.',
        wrong: 'It’s below the prompt box, where it says where your prompt will go.',
      },
      hints: [
        'Look below the prompt box, not in it.',
        'It shows a speech bubble and the word **Chat**.',
        'Select **Chat**, below the prompt box.',
      ],
      source: src('chat-sessions'),
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
      source: src('modes'),
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
          label: 'Chat',
          feedback: 'That’s the project picker: chat or project. The model control is in the prompt box.',
        },
      ],
      explain: {
        correct:
          'Right! Open the model control to find **Model** and **Effort**. It shows **Auto** or a model name. Some app versions show separate model and reasoning controls.',
        wrong: 'It’s next to the mode selector and shows **Auto** or a model name.',
      },
      hints: [
        'It’s in the bottom row of the prompt box.',
        'It sits right beside the mode selector and shows a model’s name.',
        'Select **GPT-5.6 Sol · Medium**.',
      ],
      source: src('models-and-reasoning-effort'),
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
            '**Customize** manages the ways to extend the app. Instructions live with your session settings.',
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
      source: src('settings'),
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
      source: src('key-takeaways'),
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
          text: 'Switch the session to Local repository first',
          feedback:
            'That’s a workspace choice for the session. You can open the project in VS Code any time.',
        },
      ],
      answer: 'open',
      explain: {
        correct: 'Right. You can jump to VS Code from the app whenever you want the full editor.',
        wrong: 'The app can open the project in VS Code for you, any time.',
      },
      source: src('the-solution'),
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
          left: { id: 'items', text: 'See your issues, pull requests and review requests' },
          right: { id: 'my-work', text: 'My work' },
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
          'Right. New, My work, Projects and chats, Automations and Customize are the app’s work surfaces.',
        wrong: 'Picture Mina’s tour: the Voyage Office, the Bounty Board, the Clock Tower and the Outfitter.',
      },
      source: src('tour-the-app'),
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
      source: src('projects-and-chats'),
    },
    {
      id: 'A1.5',
      type: 'mc',
      prompt: 'A new project session starts in which workspace by default?',
      options: [
        { id: 'worktree', text: 'New worktree' },
        {
          id: 'local',
          text: 'Local repository',
          feedback:
            'You picked **Local repository** for the one-time setup in Chapter 00. That was the exception.',
        },
        {
          id: 'cloud',
          text: 'Cloud',
          feedback: 'Project sessions start on **New worktree** unless you choose otherwise.',
        },
      ],
      answer: 'worktree',
      explain: {
        correct:
          'Right. Separate worktrees let agents work at the same time without changing the same working copy.',
        wrong: 'The default keeps each session’s changes apart from the others.',
      },
      source: src('project-sessions'),
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
      source: src('modes'),
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
      source: src('models-and-reasoning-effort'),
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
          label: 'Chat',
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
      source: src('modes'),
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
      source: src('models-and-reasoning-effort'),
    },
  ],

  pages: [
    {
      id: 'pg1.why',
      title: 'Why use the Copilot app',
      image: 'ch01/editor-vs-app',
      caption:
        'Copilot in your editor or terminal is great next to the code you have open. The hard part is supervising agent work end to end. The app adds a place for it: **project sessions** keep focused work separate, sessions, diffs, terminal output, previews and GitHub work sit in **one app**, **chats** are for safe questions, and **Automations** save a prompt you’d otherwise retype. It isn’t a replacement for your editor, and it isn’t “multi-project support” by itself.',
      source: src('why-use-the-github-copilot-app'),
    },
    {
      id: 'pg1.editor',
      title: 'Keep your editor',
      caption:
        'Stay in VS Code, JetBrains or your usual editor for deep editing. Open the app to run project sessions, pick a mode, review what changed, and move work through issues and pull requests. You can open the project in VS Code from the app any time.',
      source: src('the-solution'),
    },
    {
      id: 'pg1.new',
      title: 'New',
      image: 'ch01/app-new-page',
      caption:
        'The landing view. Start a chat without a project, pick a connected project for a project session, choose a mode and model, or start from one of the sample project ideas.',
      source: src('new'),
    },
    {
      id: 'pg1.my-work',
      title: 'My work',
      image: 'ch01/app-my-work-page',
      caption:
        'Your GitHub inbox: issues, pull requests and review requests. You can start work on an item from here. The practice issues and pull requests from setup show up here.',
      source: src('my-work'),
    },
    {
      id: 'pg1.automations',
      title: 'Automations',
      image: 'ch01/app-automations-page',
      caption:
        'Recurring agent tasks. Templates run manually, daily or weekly, and automations can also be triggered by events. You choose local or cloud execution when you set one up. A later chapter goes deeper.',
      source: src('automations'),
    },
    {
      id: 'pg1.customize',
      title: 'Customize',
      caption:
        'Where you manage the ways to extend the app: skills, Model Context Protocol (MCP) servers, plugins and extensions. You don’t need any yet. Chapter 04 covers skills and custom agents, Chapter 05 MCP servers and plugins, and Chapter 06 canvases.',
      source: src('customize'),
    },
    {
      id: 'pg1.projects-chats',
      title: 'Chats and project sessions',
      caption:
        'Under **Projects** the sidebar groups your **Chats** and project sessions. A **chat session** is for asking, brainstorming, summarizing and getting your bearings, and it doesn’t create a branch or worktree. A **project session** is for planning, inspecting, editing, testing or making PR-ready work, and usually creates one, depending on session settings.',
      source: src('projects-and-chats'),
    },
    {
      id: 'pg1.control-room',
      title: 'In the control room',
      image: 'ch01/producer-control-room-modes',
      caption:
        'A producer doesn’t handle every song the same way. Some takes need close direction, some need the arrangement charted first, and some quick questions just need a fast answer. Sessions work the same way.',
      source: src('from-the-studio-in-the-control-room'),
    },
    {
      id: 'pg1.chat',
      title: 'Start a chat',
      image: 'ch01/app-quick-chat',
      caption:
        'Select the **+** next to **Chats** (it shows when you hover). Open the project picker below the prompt and check **Chat** is selected, then send the prompt. The reply should say chats suit general questions and project sessions bring repository context. No files change, and no branch or worktree is made.',
      code: 'In the GitHub Copilot app, explain when I should use a chat and when I should use a project session. Do not create or change files.',
      source: src('chat-sessions'),
    },
    {
      id: 'pg1.project',
      title: 'Tour the sample in a project session',
      caption:
        'Use a project session when the agent needs your repository, changes code or makes something like a pull request. They start on **New worktree** by default. Chapter 00’s setup session on **Local repository** was the exception. Return to that session and send this. The reply should cover `samples/book-app-web`’s purpose, technologies, main files, data flow and tests, and change nothing.',
      code: "I'm learning the copilot-app-for-beginners course. Give me a beginner-friendly tour of the samples/book-app-web sample before I begin the hands-on exercises. Explain what the app does, the technologies it uses, how its main files are organized, how data flows through it and what the tests cover. Refer to specific file paths and finish with a suggested reading order. Do not change any files.",
      source: src('project-sessions'),
    },
    {
      id: 'pg1.modes',
      title: 'Interactive, Plan and Autopilot',
      image: 'ch01/session-mode-decision-ladder',
      caption:
        '**Interactive**: step-by-step collaboration, for when you want to be involved throughout. **Plan**: plan first, execute when ready, for when the approach and details matter. **Autopilot**: end-to-end execution without interruption, for well-defined tasks with clear outcomes. Pick one for the task.',
      source: src('modes'),
    },
    {
      id: 'pg1.model',
      title: 'Model and reasoning effort',
      caption:
        'The model control sits below the prompt box, next to the mode selector, and shows **Auto** or a model name. Open it for **Model** and **Effort**. With **Auto** the app picks a model, which isn’t the same as **Autopilot**. For a tour or a short explanation, keep the defaults. For a hard bug or a change across several files, consider a model suited to complex coding and higher effort. Higher effort doesn’t guarantee a correct answer.',
      source: src('models-and-reasoning-effort'),
    },
    {
      id: 'pg1.try-controls',
      title: 'Try the controls',
      caption:
        'In your Chapter 00 project session, select **Interactive** mode. Open the model control, keep **Auto** or your current model and the default effort, and send this. The reply should say search matches titles and authors whatever the letter case, and point to `samples/book-app-web/src/App.tsx`. You can change the model and effort mid-session without changing the mode.',
      code: 'In samples/book-app-web, explain how filterBooks searches book titles and authors. Does letter case affect the results? Refer to the relevant file. Do not change any files.',
      source: src('try-the-controls'),
    },
    {
      id: 'pg1.settings',
      title: 'Settings',
      image: 'ch01/app-settings',
      caption:
        '**General**: updates, where repositories are stored, the theme. **Accounts**: add another GitHub account. **Sessions**: manage sessions and chats, response style, app-wide instructions, branch naming. **Themes**. **Accessibility**: zoom, keyboard shortcuts, notifications. **Voice dictation**: microphone, shortcut, transcription models. **Customize**. **Model providers**: your own API keys (it doesn’t replace the model picker). **Experimental**: preview features.',
      source: src('settings'),
    },
    {
      id: 'pg1.voice',
      title: 'Voice dictation (optional)',
      caption:
        'Voice dictation turns speech into editable prompt text. In **Settings**, select **Voice dictation**, allow the microphone in your operating system (**Microphone privacy** → **Open preferences**), select **Test mic**, and note the shortcut. Then create a new chat under **Chats** and try the shortcut.',
      source: src('settings'),
    },
    {
      id: 'B1.1',
      title: 'I can’t find a setting',
      caption:
        'Settings vary by app version, operating system, organization policy and enabled features. Look for the closest matching category, then check the official docs if the screen still doesn’t match.',
      source: src('i-cannot-find-a-setting-shown-in-the-chapter'),
    },
    {
      id: 'B1.2',
      title: 'Voice dictation doesn’t work',
      caption:
        'Check microphone permission, whether the local transcription model has downloaded, shortcut conflicts, and language support.',
      source: src('voice-dictation-does-not-work'),
    },
    {
      id: 'B1.3',
      title: 'A mode or model is missing',
      caption:
        'Check your plan, your organization’s policy, your project settings and your app version. Available models and effort levels vary, and some models don’t offer an effort setting.',
      source: src('a-mode-or-model-option-is-missing'),
    },
  ],

  chests: [
    // Lyra's chest at the tavern: the control-room analogy.
    { id: 'C1.1', page: 'pg1.control-room', doubloons: 10 },
    // The chest in the Hall of Records: the settings reference.
    { id: 'C1.2', page: 'pg1.settings', doubloons: 10 },
    // Message bottles round the harbour: the chapter's troubleshooting.
    { id: 'B1.1', page: 'B1.1', doubloons: 5, kind: 'bottle' },
    { id: 'B1.2', page: 'B1.2', doubloons: 5, kind: 'bottle' },
    { id: 'B1.3', page: 'B1.3', doubloons: 5, kind: 'bottle' },
  ],

  glossary: [
    {
      id: 'chat-session',
      term: 'Chat session',
      definition: 'A session for questions and brainstorming. It doesn’t create a branch or worktree.',
    },
    {
      id: 'my-work',
      term: 'My work',
      definition: 'The app’s GitHub inbox: your issues, pull requests and review requests.',
    },
    {
      id: 'automations',
      term: 'Automations',
      definition: 'Saved agent tasks that run on demand, on a schedule, or from selected GitHub events.',
    },
    {
      id: 'customize',
      term: 'Customize',
      definition: 'Where you manage skills, MCP servers, plugins and extensions.',
    },
    {
      id: 'session-modes',
      term: 'Session modes',
      definition:
        'Interactive (step by step), Plan (plan first, execute when ready) and Autopilot (end to end without interruption).',
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
};
