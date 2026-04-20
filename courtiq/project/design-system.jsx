// CourtIQ Design System
// Dark-mode premium athletic. All colors use oklch where possible.

const CIQ = {
  // Background stack — near-black with cool tint
  bg0: '#0A0B0E',        // page
  bg1: '#13151A',        // card raised
  bg2: '#1C1F26',        // card raised 2
  bg3: '#262A33',        // hover / active
  hairline: 'rgba(255,255,255,0.06)',
  hairline2: 'rgba(255,255,255,0.10)',

  // Text
  text: '#F4F5F7',
  textDim: '#9BA1AD',
  textMute: '#5B6170',

  // Brand — electric signal green (oklch ~78% 0.22 142)
  brand: '#3BE383',
  brandDim: '#1F9F5B',
  brandInk: '#021810',      // on-brand text

  // XP / energy — orange
  xp: '#FF8A3D',
  xpDim: '#B84E12',

  // Accents
  iq: '#8B7CFF',            // purple-indigo for IQ metric
  iqDim: '#5040B8',
  heat: '#FF4D6D',          // streak/fire
  info: '#5AC8FF',

  // Court
  courtLine: 'rgba(255,255,255,0.55)',
  courtFill: '#13151A',
  courtAccent: 'rgba(59,227,131,0.08)',

  // Type
  display: "'Space Grotesk', 'Inter', system-ui, sans-serif",
  ui: "'Inter', system-ui, -apple-system, sans-serif",
  mono: "'JetBrains Mono', ui-monospace, monospace",
};

// ─────────────────────────────────────────────────────────────
// Small atoms
// ─────────────────────────────────────────────────────────────
function Chip({ children, color = CIQ.textDim, bg = 'rgba(255,255,255,0.04)', border, style = {} }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '4px 9px', borderRadius: 999,
      background: bg, color,
      border: border || `1px solid ${CIQ.hairline}`,
      fontFamily: CIQ.ui, fontSize: 11, fontWeight: 600,
      letterSpacing: 0.2, textTransform: 'uppercase',
      ...style,
    }}>{children}</span>
  );
}

function Dot({ size = 6, color = CIQ.brand, style = {} }) {
  return <span style={{ display: 'inline-block', width: size, height: size, borderRadius: 999, background: color, ...style }}/>;
}

function Icon({ name, size = 20, color = 'currentColor', strokeWidth = 2 }) {
  const p = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: color, strokeWidth, strokeLinecap: 'round', strokeLinejoin: 'round' };
  switch (name) {
    case 'home': return <svg {...p}><path d="M3 10l9-7 9 7v10a2 2 0 0 1-2 2h-4v-7h-6v7H5a2 2 0 0 1-2-2V10z"/></svg>;
    case 'academy': return <svg {...p}><path d="M3 7l9-4 9 4-9 4-9-4z"/><path d="M7 9v5c3 2 7 2 10 0V9"/><path d="M21 7v6"/></svg>;
    case 'play': return <svg {...p}><path d="M6 4l14 8-14 8V4z" fill={color}/></svg>;
    case 'trophy': return <svg {...p}><path d="M8 4h8v5a4 4 0 0 1-8 0V4z"/><path d="M4 4h4v3a2 2 0 0 1-4 0V4zM16 4h4v3a2 2 0 0 1-4 0V4z"/><path d="M10 16h4v3h-4zM8 21h8"/></svg>;
    case 'flame': return <svg {...p}><path d="M12 2s5 5 5 10a5 5 0 0 1-10 0c0-2 1-3 1-5 0 0 2 1 2 3 0-3 2-5 2-8z"/></svg>;
    case 'bolt': return <svg {...p}><path d="M13 2L4 14h7l-2 8 9-12h-7l2-8z" fill={color} stroke="none"/></svg>;
    case 'brain': return <svg {...p}><path d="M12 4a3 3 0 0 0-3 3v1a3 3 0 0 0-2 5 3 3 0 0 0 2 5v1a3 3 0 0 0 6 0v-1a3 3 0 0 0 2-5 3 3 0 0 0-2-5V7a3 3 0 0 0-3-3z"/><path d="M12 4v16M9 9h.5M9 15h1"/></svg>;
    case 'chevron-right': return <svg {...p}><path d="M9 6l6 6-6 6"/></svg>;
    case 'chevron-left': return <svg {...p}><path d="M15 6l-6 6 6 6"/></svg>;
    case 'lock': return <svg {...p}><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>;
    case 'check': return <svg {...p}><path d="M5 12l5 5L20 7"/></svg>;
    case 'x': return <svg {...p}><path d="M6 6l12 12M18 6L6 18"/></svg>;
    case 'target': return <svg {...p}><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1" fill={color}/></svg>;
    case 'eye': return <svg {...p}><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>;
    case 'shield': return <svg {...p}><path d="M12 3l8 3v6c0 5-4 8-8 9-4-1-8-4-8-9V6l8-3z"/></svg>;
    case 'zap': return <svg {...p}><path d="M13 2L4 14h7l-2 8 9-12h-7l2-8z"/></svg>;
    case 'clock': return <svg {...p}><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>;
    case 'user': return <svg {...p}><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>;
    case 'stats': return <svg {...p}><path d="M4 20V10M10 20V4M16 20v-8M22 20h-22"/></svg>;
    case 'arrow-right': return <svg {...p}><path d="M5 12h14M13 6l6 6-6 6"/></svg>;
    case 'sparkle': return <svg {...p}><path d="M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2 2-6zM19 14l.8 2.2L22 17l-2.2.8L19 20l-.8-2.2L16 17l2.2-.8L19 14z"/></svg>;
    case 'compass': return <svg {...p}><circle cx="12" cy="12" r="9"/><path d="M15 9l-2 6-4 2 2-6 4-2z" fill={color} stroke="none"/></svg>;
    case 'info': return <svg {...p}><circle cx="12" cy="12" r="9"/><path d="M12 8v.5M12 11v5"/></svg>;
    default: return null;
  }
}

// ─────────────────────────────────────────────────────────────
// Buttons
// ─────────────────────────────────────────────────────────────
function PrimaryButton({ children, onClick, icon, style = {}, disabled }) {
  const [down, setDown] = React.useState(false);
  return (
    <button
      onClick={onClick}
      onMouseDown={() => setDown(true)}
      onMouseUp={() => setDown(false)}
      onMouseLeave={() => setDown(false)}
      onTouchStart={() => setDown(true)}
      onTouchEnd={() => setDown(false)}
      disabled={disabled}
      style={{
        appearance: 'none', border: 'none', cursor: disabled ? 'default' : 'pointer',
        width: '100%', height: 58, borderRadius: 18,
        background: disabled ? CIQ.bg3 : CIQ.brand,
        color: disabled ? CIQ.textMute : CIQ.brandInk,
        fontFamily: CIQ.display, fontWeight: 700, fontSize: 17,
        letterSpacing: 0.3, textTransform: 'uppercase',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
        boxShadow: disabled ? 'none'
          : down
            ? 'inset 0 2px 4px rgba(0,0,0,0.2), 0 0 0 1px rgba(59,227,131,0.4)'
            : '0 1px 0 rgba(255,255,255,0.2) inset, 0 -2px 0 rgba(0,0,0,0.15) inset, 0 8px 24px -8px rgba(59,227,131,0.5)',
        transform: down ? 'translateY(1px)' : 'translateY(0)',
        transition: 'transform 80ms, box-shadow 80ms',
        ...style,
      }}>
      {children}
      {icon && <Icon name={icon} size={18} color={CIQ.brandInk} strokeWidth={3} />}
    </button>
  );
}

function GhostButton({ children, onClick, style = {} }) {
  return (
    <button onClick={onClick} style={{
      appearance: 'none', cursor: 'pointer',
      height: 44, padding: '0 18px', borderRadius: 12,
      background: 'transparent', color: CIQ.text,
      border: `1px solid ${CIQ.hairline2}`,
      fontFamily: CIQ.ui, fontWeight: 600, fontSize: 14, letterSpacing: 0.1,
      display: 'inline-flex', alignItems: 'center', gap: 8,
      ...style,
    }}>{children}</button>
  );
}

// ─────────────────────────────────────────────────────────────
// Progress bar
// ─────────────────────────────────────────────────────────────
function Progress({ value, max = 100, color = CIQ.brand, height = 6, glow = false, style = {} }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div style={{
      height, borderRadius: 999, background: 'rgba(255,255,255,0.06)',
      overflow: 'hidden', position: 'relative', ...style,
    }}>
      <div style={{
        width: `${pct}%`, height: '100%', borderRadius: 999,
        background: color,
        boxShadow: glow ? `0 0 12px ${color}80` : 'none',
        transition: 'width 500ms cubic-bezier(0.2, 0.8, 0.2, 1)',
      }}/>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Card
// ─────────────────────────────────────────────────────────────
function Card({ children, style = {}, bg = CIQ.bg1, pad = 16, onClick, interactive }) {
  return (
    <div onClick={onClick} style={{
      background: bg, borderRadius: 20, padding: pad,
      border: `1px solid ${CIQ.hairline}`,
      cursor: interactive ? 'pointer' : 'default',
      ...style,
    }}>{children}</div>
  );
}

Object.assign(window, {
  CIQ, Chip, Dot, Icon, PrimaryButton, GhostButton, Progress, Card,
});
