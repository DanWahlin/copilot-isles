import type { CSSProperties } from 'react';

const panel: CSSProperties = {
  position: 'absolute',
  left: '6vw',
  top: '50%',
  transform: 'translateY(-50%)',
  color: '#f3e3c0',
  fontFamily: 'Georgia, "Times New Roman", serif',
  textShadow: '0 2px 18px rgba(0,0,0,0.45)',
  pointerEvents: 'auto',
};

/** Phase 0 placeholder; the real menu (PLAN §5, spec §3.1) arrives in Phase 1. */
export function TitleMenu() {
  return (
    <section style={panel} aria-label="Title">
      <h1 style={{ margin: 0, fontWeight: 300, letterSpacing: '0.3em', fontSize: 'clamp(2rem, 5vw, 4rem)' }}>
        COPILOT ISLES
      </h1>
      <p style={{ margin: '0.6em 0 0', fontStyle: 'italic', opacity: 0.8 }}>Phase 0 scaffold</p>
    </section>
  );
}
