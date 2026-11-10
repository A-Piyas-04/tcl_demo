/**
 * The two halves of a deal at a glance: the trade steps that follow approval,
 * and the single next step a person should take. Both read records that
 * already exist; neither changes anything by itself.
 */

import type * as React from 'react'
import { ArrowRight, CheckCircle2, CircleDot, Clock3, Lock } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { DealProgress as DealProgressData, NextStep } from '@/data/selectors'
import { Button, LinkButton, Tooltip } from '@/components/ui'
import { useCanWrite } from '@/data/store'

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
                  'block truncate text-[10px] leading-tight',
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

const TONE: Record<NextStep['tone'], { box: string; icon: React.ReactNode; label: string }> = {
  action: {
    box: 'border-accent-300 bg-accent-50/70',
    icon: <CircleDot className="h-4 w-4 text-accent-700" />,
    label: 'Next step',
  },
  waiting: {
    box: 'border-paper-300 bg-paper-50',
    icon: <Clock3 className="h-4 w-4 text-ink-500" />,
    label: 'Waiting',
  },
  done: {
    box: 'border-ok-200 bg-ok-50/70',
    icon: <CheckCircle2 className="h-4 w-4 text-ok-600" />,
    label: 'On track',
  },
  closed: {
    box: 'border-paper-300 bg-paper-100',
    icon: <Lock className="h-4 w-4 text-ink-400" />,
    label: 'Closed',
  },
}

/** Links that only open an existing record are fine for a View Only session. */
function isReadOnlyLink(step: NextStep) {
  return step.action?.kind === 'link' && !step.action.href.includes('/new') && !step.action.href.includes('raise=1')
}

export function NextStepCard({
  step,
  onAction,
  blockedReason,
  className,
}: {
  step: NextStep
  /** runs an in-page action (open a dialog); links navigate on their own */
  onAction: () => void
  /** when the suggested action cannot run yet, say why and offer the fix instead */
  blockedReason?: { text: string; href: string; label: string } | null
  className?: string
}) {
  const canWrite = useCanWrite()
  const tone = TONE[step.tone]
  const showAction = step.action && (canWrite || isReadOnlyLink(step))

  return (
    <div className={cn('flex flex-col gap-2 rounded-md border p-3.5', tone.box, className)}>
      <p className="flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wider text-ink-500">
        {tone.icon}
        {tone.label}
      </p>
      <p className="text-sm font-semibold text-ink-900">{step.title}</p>
      <p className="text-xs leading-relaxed text-ink-600">{step.detail}</p>
      {blockedReason ? (
        <div className="space-y-1.5">
          <p className="text-xs leading-relaxed text-warn-600">{blockedReason.text}</p>
          <LinkButton to={blockedReason.href} variant="secondary" size="sm">
            {blockedReason.label}
          </LinkButton>
        </div>
      ) : showAction && step.action ? (
        <div>
          {step.action.kind === 'link' ? (
            <LinkButton to={step.action.href} variant="primary" size="sm" icon={<ArrowRight className="h-3.5 w-3.5" />}>
              {step.actionLabel ?? step.action.label}
            </LinkButton>
          ) : (
            <Button variant="primary" size="sm" onClick={onAction} icon={<ArrowRight className="h-3.5 w-3.5" />}>
              {step.actionLabel}
            </Button>
          )}
        </div>
      ) : null}
    </div>
  )
}
