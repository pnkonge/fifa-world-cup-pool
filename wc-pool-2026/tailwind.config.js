/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Pitch — deep editorial green, the "newsprint football magazine" base
        pitch: {
          50: '#f1f5f3',
          100: '#dde8e1',
          200: '#bcd0c5',
          300: '#90b09e',
          400: '#658d77',
          500: '#48725d',
          600: '#365b48',
          700: '#2b483a',
          800: '#1f3329',
          900: '#0e1f17',
          950: '#061009',
        },
        // Gold — warm accent for #1, highlights, callouts
        gold: {
          50: '#fbf7ec',
          100: '#f5ecd0',
          200: '#ecd89e',
          300: '#dcbb5f',
          400: '#d4a038',
          500: '#bd8624',
          600: '#9d6a1f',
          700: '#7d521d',
          800: '#65411e',
          900: '#56361d',
        },
        // Paper — off-white background, has warmth
        paper: '#faf7f2',
        ink: '#1a1a1a',
      },
      fontFamily: {
        // Distinctive editorial display serif
        display: ['Fraunces', 'Georgia', 'serif'],
        // Refined sans for body + tables
        sans: ['"IBM Plex Sans"', 'system-ui', 'sans-serif'],
        // Tabular figures for scores
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
      fontFeatureSettings: {
        tabular: '"tnum"',
      },
      letterSpacing: {
        tightest: '-0.05em',
        widest: '0.2em',
      },
    },
  },
  plugins: [],
};
