/** @type {import('tailwindcss').Config} */
const courtiqPreset = {
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        bg: {
          0: '#0A0B0E',
          1: '#13151A',
          2: '#1C1F26',
          3: '#262A33',
        },
        hairline: {
          DEFAULT: 'rgba(255,255,255,0.06)',
          2: 'rgba(255,255,255,0.10)',
        },
        foreground: {
          DEFAULT: '#F4F5F7',
          dim: '#9BA1AD',
          mute: '#5B6170',
        },
        brand: {
          DEFAULT: '#3BE383',
          dim: '#1F9F5B',
          ink: '#021810',
        },
        xp: {
          DEFAULT: '#FF8A3D',
          dim: '#B84E12',
        },
        iq: {
          DEFAULT: '#8B7CFF',
          dim: '#5040B8',
        },
        heat: {
          DEFAULT: '#FF4D6D',
        },
        info: {
          DEFAULT: '#5AC8FF',
        },
        court: {
          line: 'rgba(255,255,255,0.55)',
          fill: '#13151A',
          accent: 'rgba(59,227,131,0.08)',
        },
      },
      fontFamily: {
        display: ['var(--font-display)', "'Space Grotesk'", 'Inter', 'system-ui', 'sans-serif'],
        ui: ['var(--font-ui)', 'Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['var(--font-mono)', "'JetBrains Mono'", 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        sm: '6px',
        md: '12px',
        lg: '16px',
        xl: '18px',
        '2xl': '20px',
        '3xl': '24px',
      },
      spacing: {
        1: '4px',
        2: '8px',
        3: '12px',
        4: '16px',
        5: '20px',
        6: '24px',
        8: '32px',
        12: '48px',
        16: '64px',
      },
      boxShadow: {
        brand: '0 8px 24px -8px rgba(59,227,131,0.5)',
        'brand-sm': '0 4px 12px -4px rgba(59,227,131,0.4)',
        iq: '0 8px 24px -8px rgba(139,124,255,0.5)',
        xp: '0 8px 24px -8px rgba(255,138,61,0.5)',
        heat: '0 8px 24px -8px rgba(255,77,109,0.5)',
      },
      keyframes: {
        'ciq-pulse': {
          '0%, 100%': { opacity: '0.6', transform: 'scale(1)' },
          '50%': { opacity: '0.2', transform: 'scale(1.15)' },
        },
        'ciq-fadein': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'ciq-slideup': {
          from: { opacity: '0', transform: 'translateY(24px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'ciq-pop': {
          from: { opacity: '0', transform: 'scale(0.6)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
      },
      animation: {
        'ciq-pulse': 'ciq-pulse 1.8s ease-out infinite',
        'ciq-fadein': 'ciq-fadein 0.12s ease-out forwards',
        'ciq-slideup': 'ciq-slideup 0.28s cubic-bezier(0.2, 0.8, 0.2, 1) forwards',
        'ciq-pop': 'ciq-pop 0.32s cubic-bezier(0.34, 1.56, 0.64, 1) forwards',
      },
    },
  },
  plugins: [],
};

module.exports = courtiqPreset;
