/**
 * The Techstream mark.
 *
 * Replaces the rounded accent square with a "T" in it, which is the default
 * every internal tool ships with. TCL's whole business is standing between two
 * sides that never meet, so the mark is exactly that: a supply chevron and a
 * demand chevron closing on the axis between them.
 *
 * Monochrome and drawn in `currentColor`, so it inherits the accent on paper
 * and the rail's light ink on the dark navigation — the accent is spent on the
 * mark and the primary action, and almost nowhere else.
 */
export function Mark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden focusable="false">
      <path
        d="M3.5 5.5 L9.25 12 L3.5 18.5"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M20.5 5.5 L14.75 12 L20.5 18.5"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M12 3.25 V20.75" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  )
}
