/**
 * The two halves of a deal at a glance: the trade steps that follow approval,
 * and a plain summary of what is and is not recorded. Both read records that
 * already exist; neither changes anything, prescribes anything, or decides what
 * should happen next.
 */

import { CheckCircle2, CircleDot } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { DealProgress as DealProgressData, RecordSummary as RecordSummaryData } from '@/data/selectors'
import { Tooltip } from '@/components/ui'

export function TradeSteps({ steps }: { steps: DealProgressData['steps'] }) {
  return (
    <div className="flex items-stretch gap-1">
      {steps.map((s) => (
        <div key={s.key} className="min-w-0 flex-1">
          <Tooltip content={s.detail}>
            <div className="flex flex-col gap-1.5">
              <div
                className={cn(
                  'h-1.5 rounded-full',
                  s.state === 'done' ? 'bg-ok-500' : s.state === 'partial' ? 'bg-ok-200' : 'bg-paper-300',
                )}
              />
              <span
                className={cn(
                  'block truncate text-sm leading-tight',
                  s.state === 'todo' ? 'text-ink-400' : 'text-ink-700',
                )}
              >
                {s.label}
              </span>
            </div>
          </Tooltip>
        </div>
      ))}
    </div>
  )
}

/**
 * Two plain lists — what is recorded, and what is not — with no tone, no verbs
 * and no buttons. It states facts; the person decides what, if anything, to do.
 */
export function RecordSummary({ summary, className }: { summary: RecordSummaryData; className?: string }) {
  return (
    <div className={cn('rounded-md border bg-white p-3.5', className)}>
      <div className="space-y-3">
        <div>
          <p className="mb-1.5 text-sm font-semibold text-ink-500">Recorded</p>
          {summary.recorded.length ? (
            <ul className="space-y-1">
              {summary.recorded.map((t, i) => (
                <li key={i} className="flex items-start gap-1.5 text-sm text-ink-800">
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ok-500" />
                  <span>{t}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-ink-400">Nothing recorded yet.</p>
          )}
        </div>
        {summary.missing.length ? (
          <div>
            <p className="mb-1.5 text-sm font-semibold text-ink-500">Not recorded</p>
            <ul className="space-y-1">
              {summary.missing.map((t, i) => (
                <li key={i} className="flex items-start gap-1.5 text-sm text-ink-500">
                  <CircleDot className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-300" />
                  <span>{t}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </div>
  )
}
