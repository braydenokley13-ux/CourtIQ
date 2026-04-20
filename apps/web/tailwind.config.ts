import type { Config } from 'tailwindcss'
import courtiqPreset from '@courtiq/config/tailwind'

const config: Config = {
  presets: [courtiqPreset],
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './features/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
}

export default config
