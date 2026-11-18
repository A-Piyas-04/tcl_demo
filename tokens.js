/**
 * Design tokens — the single source of truth for type, colour, spacing and
 * radius. Consumed by tailwind.config.js; nothing else in the app defines a
 * colour, a font size or a radius of its own.
 *
 * Rules this file encodes (see docs/UI_REFINEMENT.md):
 *  - Six type steps, nothing smaller than 12px, and 12px only inside a badge.
 *  - Two weights: 400 and 600. `medium`, `semibold` and `bold` all resolve
 *    to 600, so no third weight can creep in from a utility class.
 *  - One neutral ramp (paper 50–400 is its light end, ink 50–950 its dark
 *    end — one hue, one progression), one brand accent, four semantics.
 *  - One radius, borders instead of shadows, and a single overlay elevation
 *    for things that genuinely float (dialogs, menus, tooltips).
 *  - Spacing in multiples of 8; 4px survives only as an icon-to-label gap.
 */

// ---------------------------------------------------------------- type
// Six steps. Nothing else is available, so nothing else can be used.

const fontSize = {
  xs: ['0.75rem', { lineHeight: '1rem' }], //  12 — badges only
  sm: ['0.8125rem', { lineHeight: '1.125rem' }], //  13 — secondary lines, table headers
  base: ['0.875rem', { lineHeight: '1.25rem' }], //  14 — body and table text
  lg: ['1rem', { lineHeight: '1.5rem' }], //  16 — panel titles
  xl: ['1.25rem', { lineHeight: '1.625rem' }], //  20 — page titles, tile values
  '2xl': ['1.5rem', { lineHeight: '1.875rem' }], //  24 — the one display size
}

// 400 and 600. Every weight utility collapses onto one of the two.
const fontWeight = {
  normal: '400',
  medium: '600',
  semibold: '600',
  bold: '600',
}

// ---------------------------------------------------------------- colour
// One neutral ramp, expressed as two namespaces that continue each other:
// paper 50→400 is the light end (surfaces, borders), ink 50→950 the dark end
// (text, the navigation rail). Same hue, one unbroken progression.

const paper = {
  50: '#ffffff', // card surface
  100: '#f6f7f9', // workspace background
  200: '#eef0f3', // fills, zebra, hairlines inside a panel
  300: '#dfe3e8', // decorative rules only — table separators, panel dividers
  400: '#c4cbd4', // decorative emphasis, scrollbar thumb
  // Interactive boundaries (input, checkbox, radio, outlined button) use
  // ink-400, which clears 3:1. paper-300/400 never bound a control.
}

const ink = {
  50: '#f3f5f7', // on the dark rail: primary text
  100: '#e6eaee',
  200: '#cdd4dc',
  300: '#aab5c0', // on the dark rail: muted text
  400: '#7d8a98', // 3.4:1 — interactive borders (inputs, checkboxes) and icons
  500: '#5f6c7a', // secondary text on white, 5.6:1
  600: '#4b5765',
  700: '#3a4552',
  800: '#2b343f',
  850: '#212932',
  900: '#171e26', // primary text, 14.9:1
  950: '#0e1419',
}

// The brand pair: a muted violet against the graphite neutral. Chosen to sit
// apart from all four semantics (green / amber / red / blue), so an accent is
// never mistaken for a status. Used sparingly — primary action, active nav,
// current step, and the single-hue chart ramp.
const accent = {
  50: '#f7f5fb',
  100: '#efeaf7',
  200: '#ded3ee',
  300: '#c4b1e0',
  400: '#a587cd',
  500: '#8963b5',
  600: '#6f4a9b', //  primary button, 6.4:1 against white
  700: '#5b3c80',
  800: '#4a3268',
  900: '#3d2a55',
}

// Four semantics, each with the same three roles: 50 fill, 200 border,
// 600/700 text and dot. Never used decoratively.
const ok = { 50: '#edf7f1', 200: '#b9ddc8', 500: '#2f8558', 600: '#226b45', 700: '#1a5436' }
const warn = { 50: '#fdf6ea', 200: '#eed9ab', 500: '#9c6f14', 600: '#825b0c', 700: '#6a4a09' }
const danger = { 50: '#fdf1f0', 200: '#f1c5c1', 500: '#c0443b', 600: '#a2332b', 700: '#852922' }
const info = { 50: '#eef3fa', 200: '#c6d8ed', 500: '#3a6ea5', 600: '#2d5887', 700: '#24466c' }

export default {
  fontSize,
  fontWeight,
  colors: { paper, ink, accent, ok, warn, danger, info },
  /**
   * SQUARE. Containers in this product are not rounded rectangles.
   *
   * The rounded card with a coloured bar down one side is the single most
   * common shape in dashboard software, and it carries no meaning. Every
   * container here is a square-cornered plate marked at two opposite corners
   * with machined brackets (see `.slab` in styles/index.css); severity lives
   * in those brackets, so there is no bar anywhere in the product.
   *
   * `full` survives for dots, avatars and progress tracks only.
   */
  borderRadius: { none: '0', DEFAULT: '0', sm: '0', md: '0', lg: '0', xl: '0', full: '9999px' },

  /**
   * ELEVATION — "instrument", not "card".
   *
   * The flat white rectangle with a tinted edge is what every dashboard
   * template ships with. This is a real depth system instead: one light
   * source above, a 1px lit top edge on anything raised, and tight dark
   * shadows rather than big soft clouds. The result reads as machined panels
   * on a console — which is what this product actually is.
   *
   * Four steps, each meaning something:
   *   recessed — cut into the surface: inputs, table headers, wells
   *   raised   — sitting on it: panels, tiles, rows you can pick up
   *   lifted   — picked up: hover, drag, the active card
   *   pop      — off the surface entirely: menus, dialogs, tooltips
   */
  boxShadow: {
    none: 'none',
    recessed: 'inset 0 1px 2px rgb(14 20 25 / 0.08), inset 0 0 0 1px rgb(14 20 25 / 0.04)',
    raised:
      'inset 0 1px 0 rgb(255 255 255 / 0.95), 0 1px 1px rgb(14 20 25 / 0.05), 0 2px 4px -1px rgb(14 20 25 / 0.07)',
    lifted:
      'inset 0 1px 0 rgb(255 255 255 / 0.95), 0 2px 4px -1px rgb(14 20 25 / 0.07), 0 10px 20px -8px rgb(14 20 25 / 0.16)',
    pop: 'inset 0 1px 0 rgb(255 255 255 / 0.6), 0 14px 36px -10px rgb(14 20 25 / 0.3), 0 3px 10px -3px rgb(14 20 25 / 0.14)',
    // the primary action is a physical key: lit top edge, hard bottom edge
    key: 'inset 0 1px 0 rgb(255 255 255 / 0.26), inset 0 -1px 0 rgb(14 20 25 / 0.3), 0 1px 2px rgb(14 20 25 / 0.3), 0 3px 6px -2px rgb(14 20 25 / 0.28)',
    pressed: 'inset 0 2px 4px rgb(14 20 25 / 0.28), inset 0 1px 0 rgb(14 20 25 / 0.16)',
  },
}
