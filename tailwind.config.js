/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"IBM Plex Sans"', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
      colors: {
        // Navigation rail: deep ink, not pure black.
        // A full scale: the light end is used for secondary text on paper and
        // for readable labels on the dark navigation rail.
        ink: {
          50: '#f2f6f8',
          100: '#e3ebef',
          200: '#c6d5dd',
          300: '#9fb6c2',
          400: '#7593a3',
          500: '#4f7387',
          600: '#2b5a6f',
          700: '#1d4254',
          800: '#143040',
          850: '#0f222d',
          900: '#0b1a23',
          950: '#07131a',
        },
        // Warm off-white workspace.
        paper: {
          50: '#fdfcfa',
          100: '#f8f6f2',
          200: '#f1eee8',
          300: '#e6e1d8',
          400: '#d5cec1',
        },
        // Single strong accent: deep teal.
        accent: {
          50: '#edfaf7',
          100: '#d2f2eb',
          200: '#a6e5d8',
          300: '#6ed0bf',
          400: '#38b3a0',
          500: '#159684',
          600: '#0c786b',
          700: '#0d6056',
          800: '#0f4d46',
          900: '#10403b',
        },
        // Semantic stage colours, muted enough to sit together in a list.
        stage: {
          identified: '#7c8694',
          offered: '#2f6fa8',
          sample: '#7a57c4',
          evaluation: '#b4762a',
          approved: '#15806a',
          commercial: '#0c6b4f',
          hold: '#9a6714',
          rejected: '#b23a34',
          discontinued: '#6b6257',
        },
        danger: { 50: '#fdf2f1', 200: '#f3c8c4', 500: '#c6453c', 600: '#a8352d', 700: '#8a2b24' },
        warn: { 50: '#fdf7ed', 200: '#f0d9a8', 500: '#b5811d', 600: '#95680f' },
        ok: { 50: '#eff8f3', 200: '#bfe3ce', 500: '#2a8456', 600: '#1f6b44' },
      },
      borderRadius: { sm: '4px', DEFAULT: '6px', md: '8px', lg: '10px', xl: '13px' },
      boxShadow: {
        hairline: '0 0 0 1px rgb(15 34 45 / 0.08)',
        tile: '0 1px 2px rgb(15 34 45 / 0.05), 0 1px 1px rgb(15 34 45 / 0.03)',
        raised: '0 2px 4px rgb(15 34 45 / 0.06), 0 6px 14px -6px rgb(15 34 45 / 0.14)',
        pop: '0 10px 30px -12px rgb(15 34 45 / 0.28), 0 2px 6px rgb(15 34 45 / 0.07)',
        inset: 'inset 0 1px 0 rgb(255 255 255 / 0.6)',
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem', letterSpacing: '0.02em' }],
        xs: ['0.75rem', { lineHeight: '1.1rem' }],
        sm: ['0.8125rem', { lineHeight: '1.25rem' }],
        base: ['0.875rem', { lineHeight: '1.4rem' }],
        lg: ['1rem', { lineHeight: '1.5rem' }],
        xl: ['1.125rem', { lineHeight: '1.6rem' }],
        '2xl': ['1.375rem', { lineHeight: '1.8rem', letterSpacing: '-0.01em' }],
        '3xl': ['1.75rem', { lineHeight: '2.1rem', letterSpacing: '-0.02em' }],
        '4xl': ['2.25rem', { lineHeight: '2.5rem', letterSpacing: '-0.025em' }],
      },
      keyframes: {
        'fade-up': { from: { opacity: '0', transform: 'translateY(6px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        shimmer: { '100%': { transform: 'translateX(100%)' } },
        'shake-x': {
          '0%,100%': { transform: 'translateX(0)' },
          '20%,60%': { transform: 'translateX(-5px)' },
          '40%,80%': { transform: 'translateX(5px)' },
        },
        'pulse-ring': {
          '0%': { transform: 'scale(0.9)', opacity: '0.7' },
          '70%': { transform: 'scale(1.6)', opacity: '0' },
          '100%': { transform: 'scale(1.6)', opacity: '0' },
        },
      },
      animation: {
        'fade-up': 'fade-up 260ms cubic-bezier(0.22, 1, 0.36, 1) both',
        shimmer: 'shimmer 1.6s infinite',
        'shake-x': 'shake-x 420ms cubic-bezier(0.36, 0.07, 0.19, 0.97)',
        'pulse-ring': 'pulse-ring 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
    },
  },
  plugins: [],
}
