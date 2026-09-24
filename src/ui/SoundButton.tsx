/** Mute / unmute, as a round speaker button (title screen and the in-game purse). */
export function SoundButton({
  muted,
  onToggle,
  className = '',
}: {
  muted: boolean;
  onToggle: () => void;
  className?: string;
}) {
  const label = muted ? 'Unmute sound' : 'Mute sound';
  return (
    <button
      type="button"
      className={`ci-sound-btn ${muted ? 'muted' : ''} ${className}`}
      onClick={onToggle}
      aria-label={label}
      aria-pressed={muted}
      title={`${label} (N)`}
    >
      <SpeakerIcon muted={muted} />
    </button>
  );
}

export function SpeakerIcon({ muted }: { muted: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path className="body" d="M4 9.5h3.2L12 5.5v13l-4.8-4H4z" />
      {muted ? (
        <path className="x" d="M16 9.5l5 5M21 9.5l-5 5" />
      ) : (
        <path className="waves" d="M15.5 9.2a4 4 0 0 1 0 5.6M18.3 6.8a7.6 7.6 0 0 1 0 10.4" />
      )}
    </svg>
  );
}
