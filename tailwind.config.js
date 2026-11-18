import tokens from './tokens.js'

/**
 * The theme is *replaced*, not extended, for type, weight, colour, radius and
 * shadow. A utility that is not in the token file does not exist, so a stray
 * `text-[11px]`, `bg-emerald-500` or `rounded-xl` cannot quietly reappear.
 *
 * @type {import('tailwindcss').Config}
 */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    fontSize: tokens.fontSize,
    fontWeight: tokens.fontWeight,
    borderRadius: tokens.borderRadius,
    boxShadow: tokens.boxShadow,
    colors: {
      transparent: 'transparent',
      current: 'currentColor',
      inherit: 'inherit',
      white: '#ffffff',
      black: '#000000',
      ...tokens.colors,
    },
    extend: {
      fontFamily: {
        sans: ['"IBM Plex Sans"', 'system-ui', 'sans-serif'],
        // Codes only: CAS, AWB, document references, record identifiers.
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
      keyframes: {
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(4px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: { '100%': { transform: 'translateX(100%)' } },
        'shake-x': {
          '0%,100%': { transform: 'translateX(0)' },
          '20%,60%': { transform: 'translateX(-4px)' },
          '40%,80%': { transform: 'translateX(4px)' },
        },
      },
      animation: {
        'fade-up': 'fade-up 200ms cubic-bezier(0.22, 1, 0.36, 1) both',
        shimmer: 'shimmer 1.6s infinite',
        'shake-x': 'shake-x 420ms cubic-bezier(0.36, 0.07, 0.19, 0.97)',
      },
    },
  },
  plugins: [],
}
