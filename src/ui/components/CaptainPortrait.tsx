import type { CaptainBody } from '../bridge';

/**
 * The captain-select portraits: the bearded captain with his parrot, and the long-haired captain.
 * Both wear the same gold-trimmed tricorn as Anne's in-game hat.
 */
export function CaptainPortrait({ body }: { body: CaptainBody }) {
  const man = body === 'man';
  const id = `portrait-${body}`;
  return (
    <svg className="ci-portrait" viewBox="0 0 180 180" aria-hidden="true">
      <defs>
        <radialGradient id={`${id}-bg`} cx="50%" cy="42%" r="60%">
          <stop offset="0" stopColor={man ? '#3c5a6e' : '#4a5a5a'} />
          <stop offset="1" stopColor="#1b2a36" />
        </radialGradient>
        <linearGradient id={`${id}-felt`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2e241d" />
          <stop offset="1" stopColor="#15110d" />
        </linearGradient>
        <linearGradient id={`${id}-wingL`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#453629" />
          <stop offset="1" stopColor="#1c1611" />
        </linearGradient>
        <linearGradient id={`${id}-wingR`} x1="1" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2c231b" />
          <stop offset="1" stopColor="#110d0a" />
        </linearGradient>
        <linearGradient id={`${id}-skin`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f1c7a3" />
          <stop offset="1" stopColor="#d9a47f" />
        </linearGradient>
        <linearGradient id={`${id}-hair`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#e6c77e" />
          <stop offset="1" stopColor="#b98c45" />
        </linearGradient>
        <clipPath id={`${id}-clip`}>
          <circle cx="90" cy="90" r="80" />
        </clipPath>
      </defs>
      <circle cx="90" cy="90" r="80" fill={`url(#${id}-bg)`} />
      <g clipPath={`url(#${id}-clip)`}>
        {man ? <CaptainFigure id={id} /> : <AnneFigure id={id} />}
        <Tricorn id={id} dy={man ? 4 : 2} />
      </g>
      <circle cx="90" cy="90" r="80" fill="none" stroke="rgba(232,200,138,.55)" strokeWidth="2" />
    </svg>
  );
}

/**
 * A front-on tricorn: the crown peeking above two upturned wings of brim that meet in a point over
 * the brow (the red band shows through the dip), edged in gold.
 */
function Tricorn({ id, dy }: { id: string; dy: number }) {
  return (
    <g transform={`translate(0 ${dy})`}>
      <path d="M58 70C58 38 72 24 90 24s32 14 32 46z" fill={`url(#${id}-felt)`} />
      <path d="M58 60c10-4 22-6 32-6s22 2 32 6v9c-10-4-22-6-32-6s-22 2-32 6z" fill="#8b1e1f" />
      <path
        d="M22 60C26 44 36 32 50 30c16 0 30 20 40 44-16 4-32 2-46-4-8-3-16-6-22-10z"
        fill={`url(#${id}-wingL)`}
      />
      <path
        d="M158 60c-4-16-14-28-28-30-16 0-30 20-40 44 16 4 32 2 46-4 8-3 16-6 22-10z"
        fill={`url(#${id}-wingR)`}
      />
      <path
        d="M32 56c4-10 10-17 18-19M148 56c-4-10-10-17-18-19"
        fill="none"
        stroke="rgba(255,236,200,.12)"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M22 60c6 4 14 7 22 10 14 6 30 8 46 4 16 4 32 2 46-4 8-3 16-6 22-10"
        fill="none"
        stroke="#0b0907"
        strokeWidth="1.6"
        opacity=".7"
      />
      <path
        d="M22 60C26 44 36 32 50 30c16 0 30 20 40 44 10-24 24-44 40-44 14 2 24 14 28 30"
        fill="none"
        stroke="#d6a74e"
        strokeWidth="3.2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </g>
  );
}

function CaptainFigure({ id }: { id: string }) {
  return (
    <>
      {/* Coat, shirt, and lapels. */}
      <path d="M30 184c4-34 24-50 60-50s56 16 60 50z" fill="#5a3a24" />
      <path d="M72 138l18 30 18-30z" fill="#e8dcc4" />
      <path d="M62 140l28 36-10-40zM118 140l-28 36 10-40z" fill="#3e2616" />
      <path d="M58 150h64" stroke="#b5872f" strokeWidth="3" />
      {/* Parrot on his shoulder. */}
      <g transform="translate(132 110)">
        <path d="M-6 26c-2-14 2-26 12-30 8-3 14 2 14 10 0 10-8 18-26 20z" fill="#2f86c9" />
        <path d="M0 -4c0-10 8-16 16-14 7 2 10 9 8 16z" fill="#f4f4ef" />
        <path d="M2 -12c2-8 8-12 16-10-4 2-7 5-8 9z" fill="#6cc832" />
        <path d="M22 0c6 1 9 5 7 10-3-3-6-4-9-4z" fill="#f29a2e" />
        <circle cx="13" cy="-4" r="2.6" fill="#15110d" />
      </g>
      {/* Head, ears, sideburns, and beard. */}
      <ellipse cx="62" cy="92" rx="7" ry="9" fill="#e2ad88" />
      <ellipse cx="118" cy="92" rx="7" ry="9" fill="#e2ad88" />
      <path
        d="M62 80c0-22 12-32 28-32s28 10 28 32v14c0 20-12 32-28 32S62 114 62 94z"
        fill={`url(#${id}-skin)`}
      />
      <path
        d="M59 68c-1 10 1 20 5 30l5-2c-2-10-3-19-2-28zM121 68c1 10-1 20-5 30l-5-2c2-10 3-19 2-28z"
        fill="#c9581f"
      />
      <path
        d="M62 92c2 18 10 36 28 40 18-4 26-22 28-40-6 6-10 10-16 10-4-3-8-4-12-4s-8 1-12 4c-6 0-10-4-16-10z"
        fill="#d8662a"
      />
      <path d="M80 104c6-4 14-4 20 0-4 3-8 4-10 4s-6-1-10-4z" fill="#b84d1c" />
      <path d="M74 81l12 3M106 81l-12 3" stroke="#b84d1c" strokeWidth="4.5" strokeLinecap="round" />
      <ellipse cx="80" cy="91" rx="4" ry="4.6" fill="#15110d" />
      <ellipse cx="100" cy="91" rx="4" ry="4.6" fill="#15110d" />
      <circle cx="81.4" cy="89.4" r="1.2" fill="#fff" />
      <circle cx="101.4" cy="89.4" r="1.2" fill="#fff" />
      <path d="M88 93c-2 5-2 8 2 9" fill="none" stroke="#c98a66" strokeWidth="2" strokeLinecap="round" />
    </>
  );
}

function AnneFigure({ id }: { id: string }) {
  const hair = `url(#${id}-hair)`;
  return (
    <>
      {/* Hair falling from under the hat to below the shoulders. */}
      <path d="M52 60C40 90 42 126 36 158c10 8 24 10 40 6h28c16 4 30 2 40-6-6-32-4-68-16-98z" fill={hair} />
      <path
        d="M50 96c-2 20-4 40-8 58M130 96c2 20 4 40 8 58M58 112c-2 16-3 30-6 44M122 112c2 16 3 30 6 44"
        fill="none"
        stroke="#a67a38"
        strokeWidth="1.6"
        strokeLinecap="round"
        opacity=".7"
      />
      {/* Cream blouse under a laced brown vest, with a gold buckle. */}
      <path d="M30 184c4-32 24-48 60-48s56 16 60 48z" fill="#e7dcc4" />
      <path d="M52 184c2-24 12-40 22-44l16 26 16-26c10 4 20 20 22 44z" fill="#6b4524" />
      <path d="M84 152l12 6M84 160l12-6" stroke="#d9c49a" strokeWidth="1.4" />
      <rect x="82" y="166" width="16" height="10" rx="2" fill="none" stroke="#d6a74e" strokeWidth="3" />
      {/* Face. */}
      <path
        d="M63 86c0-22 12-32 27-32s27 10 27 32v8c0 22-11 34-27 34S63 116 63 94z"
        fill={`url(#${id}-skin)`}
      />
      {/* Locks framing the face and falling forward over the shoulders. */}
      <path d="M60 66C52 96 50 124 46 152c6 6 14 6 19-1 0-26 2-50 5-80z" fill={hair} />
      <path d="M120 66c8 30 10 58 14 86-6 6-14 6-19-1 0-26-2-50-5-80z" fill={hair} />
      {/* Side-swept fringe under the hat. */}
      <path d="M62 90c0-16 12-28 28-28s28 10 28 20c-8-4-16-4-22-1-8 4-18 5-26 4-4 1-7 3-8 5z" fill={hair} />
      <path d="M78 76c6 4 12 5 18 4" fill="none" stroke="#b98c45" strokeWidth="1.4" strokeLinecap="round" />
      {/* Brows, eyes with lashes, nose, blush, and smile. */}
      <path d="M74 89l10 1M106 89l-10 1" stroke="#9a7440" strokeWidth="3" strokeLinecap="round" />
      <ellipse cx="80" cy="98" rx="4.6" ry="5.4" fill="#15110d" />
      <ellipse cx="100" cy="98" rx="4.6" ry="5.4" fill="#15110d" />
      <path d="M75 94l-3-2M105 94l3-2" stroke="#15110d" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="81.6" cy="96" r="1.4" fill="#fff" />
      <circle cx="101.6" cy="96" r="1.4" fill="#fff" />
      <path
        d="M89 101c-1.6 4-1 6 1.4 6.4"
        fill="none"
        stroke="#c98a66"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <ellipse cx="73" cy="108" rx="5" ry="3" fill="#e8907a" opacity=".35" />
      <ellipse cx="107" cy="108" rx="5" ry="3" fill="#e8907a" opacity=".35" />
      <path
        d="M83 114c4 3.4 10 3.4 14 0"
        fill="none"
        stroke="#9a4a3a"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </>
  );
}
