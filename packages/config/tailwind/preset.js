/** @type {import('tailwindcss').Config} */
const courtiqPreset = {
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Background stack — dark-mode first (ARCHITECTURE.md §4.2)
        bg: {
          0: '#0A0B0E',
          1: '#13151A',
          2: '#1C1F26',
          3: '#262A33',
        },
        // Borders
        hairline: {
          DEFAULT: 'rgba(255,255,255,0.06)',
          2: 'rgba(255,255,255,0.10)',
        },
        // Text
        foreground: {
          DEFAULT: '#F4F5F7',
          dim: '#9BA1AD',
          mute: '#5B6170',
        },
        // Brand — electric signal-green; on-brand ink #021810
        brand: {
          DEFAULT: '#3BE383',
          dim: '#1F9F5B',
          ink: '#021810',
        },
        // Accents
        xp:   { DEFAULT: '#FF8A3D', dim: '#B84E12' },
        iq:   { DEFAULT: '#8B7CFF', dim: '#5040B8' },
        heat: '#FF4D6D',
        info: '#5AC8FF',
        // Court
        court: {
          line:   'rgba(255,255,255,0.55)',
          fill:   '#13151A',
          accent: 'rgba(59,227,131,0.08)',
        },
      },
      fontFamily: {
        // CSS vars injected by next/font; fallback chain preserves intent without next/font
        display: ['var(--font-display)', "'Space Grotesk'", "'Inter'", 'system-ui', 'sans-serif'],
        ui:      ['var(--font-ui)',      "'Inter'",         'system-ui', '-apple-system', 'sans-serif'],
        mono:    ['var(--font-mono)',    "'JetBrains Mono'", 'ui-monospace', 'monospace'],
      },
      // Spacing: 4/8/12/16/20/24/32/48/64 — already covered by Tailwind defaults
      borderRadius: {
        sm:    '6px',
        md:    '12px',
        lg:    '16px',
        xl:    '18px',   // primary button
        '2xl': '20px',   // cards
        '3xl': '24px',
      },
    },
  },
}

module.exports = courtiqPreset
