/**
 * Stage configuration (FR-M6-06, and the transition list UF-07).
 *
 * The matrix is generated from the same transition table the engagement screens
 * check against, so it cannot describe a move the application would refuse. Two
 * rules sit outside a from-to grid and are stated underneath it.
 */

import * as React from 'react'
import { Check, GitBranch, Minus, ShieldAlert } from 'lucide-react'
import { STAGE_CONFIG, STAGE_LABEL } from '@/data/reference'
import { STAGE_TRANSITIONS } from '@/data/rules'
import { pluralise } from '@/lib/utils'
import type { EngagementStage } from '@/data/types'
import { Badge, Panel, PanelHeader, PageHeading, StageBadge, Tooltip } from '@/components/ui'
import { PrototypeNote } from './shared'

/** Every stage, in the configured display order. */
const ORDERED = [...STAGE_CONFIG].sort((a, b) => a.displayOrder - b.displayOrder).map((s) => s.stage)

export function WorkflowConfig() {
  const transitions = React.useMemo(() => {
    const map = new Map<string, { requiresPermission?: string }>()
    for (const t of STAGE_TRANSITIONS) map.set(`${t.from}>${t.to}`, { requiresPermission: t.requiresPermission })
    return map
  }, [])

  const overrideCount = STAGE_TRANSITIONS.filter((t) => t.requiresPermission).length

  return (
    <div className="space-y-4">
      <PageHeading
        title="Stage configuration"
        subtitle="The stages an engagement moves through, how long it may sit in each, and which moves are allowed."
        meta={
          <>
            <Badge tone="neutral">{pluralise(STAGE_CONFIG.length, 'stage')}</Badge>
            <Badge tone="accent">{pluralise(STAGE_TRANSITIONS.length, 'allowed transition')}</Badge>
            <Badge tone="warn">{pluralise(overrideCount, 'needs a permission', 'need a permission')}</Badge>
          </>
        }
      />

      <PrototypeNote title="Read-only in this build">
        In the built system an administrator edits the ageing thresholds and the transition list as configuration rows,
        as NFR-MA-03 requires, and the database enforces whatever is configured. The prototype reads both from one
        module and shows them here, so what you see is exactly what the engagement screens check against.
      </PrototypeNote>

      <Panel>
        <PanelHeader
          title="Stages"
          subtitle="The ageing threshold is the number of days before an engagement sitting in this stage is flagged as stale."
          icon={<GitBranch className="h-4 w-4" />}
        />
        <div className="scroll-slim overflow-x-auto">
          <table className="w-full min-w-[40rem] border-collapse text-sm">
            <thead>
              <tr className="bg-paper-100/60 text-2xs uppercase tracking-wide text-ink-500">
                <th className="w-16 px-3 py-2 text-left font-medium">Order</th>
                <th className="px-3 py-2 text-left font-medium">Stage</th>
                <th className="w-36 px-3 py-2 text-right font-medium">Ageing threshold</th>
                <th className="w-36 px-3 py-2 text-center font-medium">Reason required</th>
                <th className="w-28 px-3 py-2 text-center font-medium">Terminal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-paper-200">
              {[...STAGE_CONFIG]
                .sort((a, b) => a.displayOrder - b.displayOrder)
                .map((s) => (
                  <tr key={s.stage} className="hover:bg-paper-50">
                    <td className="px-3 py-2 tabular text-xs text-ink-400">{s.displayOrder}</td>
                    <td className="px-3 py-2">
                      <StageBadge stage={s.stage} />
                    </td>
                    <td className="px-3 py-2 text-right tabular text-xs text-ink-700">
                      {s.ageingThresholdDays > 0 ? `${s.ageingThresholdDays} days` : 'Not aged'}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <Mark on={s.requiresReason} />
                    </td>
                    <td className="px-3 py-2 text-center">
                      <Mark on={s.isTerminal} />
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel>
        <PanelHeader
          title="Allowed transitions"
          subtitle="Rows are the stage moved from, columns the stage moved to. Anything not ticked is refused."
          icon={<GitBranch className="h-4 w-4" />}
        />
        <div className="scroll-slim overflow-x-auto">
          <table className="border-collapse text-sm">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 border-b border-r border-paper-200 bg-white px-3 py-2 text-left text-2xs font-medium uppercase tracking-wide text-ink-500">
                  From \ to
                </th>
                {ORDERED.map((to) => (
                  <th
                    key={to}
                    className="h-28 border-b border-paper-200 bg-paper-100/60 px-1 align-bottom text-2xs font-medium text-ink-600"
                  >
                    <span className="flex h-24 items-end justify-center">
                      <span className="whitespace-nowrap [writing-mode:vertical-rl] [transform:rotate(180deg)]">
                        {STAGE_LABEL[to]}
                      </span>
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-paper-200">
              {ORDERED.map((from) => (
                <tr key={from} className="hover:bg-paper-50">
                  <th className="sticky left-0 z-10 border-r border-paper-200 bg-white px-3 py-1.5 text-left font-normal">
                    <StageBadge stage={from} size="sm" />
                  </th>
                  {ORDERED.map((to) => {
                    const rule = transitions.get(`${from}>${to}`)
                    return (
                      <td key={to} className="px-1 py-1.5 text-center">
                        <Cell from={from} to={to} rule={rule} />
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center gap-4 border-t border-paper-200 bg-paper-50 px-3 py-2 text-2xs text-ink-500">
          <span className="flex items-center gap-1.5">
            <Mark on /> Allowed
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-grid h-5 w-5 place-items-center rounded-full border border-warn-200 bg-warn-50 text-warn-600">
              <ShieldAlert className="h-3 w-3" />
            </span>
            Allowed, but needs an extra permission and a recorded note
          </span>
          <span className="flex items-center gap-1.5">
            <Mark on={false} /> Refused
          </span>
        </div>
      </Panel>

      <Panel>
        <PanelHeader title="Two rules the matrix cannot show" />
        <ul className="ml-4 list-disc space-y-2 p-3.5 pl-7 text-xs leading-relaxed text-ink-600">
          <li>
            An engagement on hold resumes only to the stage it was paused from. The matrix shows every stage as
            reachable from On hold because any of them can be the paused stage, but on a given record only one of them
            is offered.
          </li>
          <li>
            Approved reaches Commercial automatically when the first indent is placed against the engagement. Nobody
            moves that one by hand, which is why an approved engagement with a shipped indent can never be left
            describing itself as approved.
          </li>
        </ul>
      </Panel>
    </div>
  )
}

function Cell({
  from,
  to,
  rule,
}: {
  from: EngagementStage
  to: EngagementStage
  rule?: { requiresPermission?: string }
}) {
  if (!rule) {
    return from === to ? <span className="text-ink-300">·</span> : <Mark on={false} />
  }
  if (rule.requiresPermission) {
    return (
      <Tooltip content={`${STAGE_LABEL[from]} to ${STAGE_LABEL[to]} needs ${rule.requiresPermission}`}>
        <span className="inline-grid h-5 w-5 place-items-center rounded-full border border-warn-200 bg-warn-50 text-warn-600">
          <ShieldAlert className="h-3 w-3" />
        </span>
      </Tooltip>
    )
  }
  return <Mark on />
}

/** A tick or a dash, so an empty cell never has to be interpreted. */
function Mark({ on }: { on?: boolean }) {
  return on ? (
    <span
      aria-label="Yes"
      className="inline-grid h-5 w-5 place-items-center rounded-full border border-ok-200 bg-ok-50 text-ok-600"
    >
      <Check className="h-3 w-3" />
    </span>
  ) : (
    <span
      aria-label="No"
      className="inline-grid h-5 w-5 place-items-center rounded-full border border-paper-300 bg-paper-100 text-ink-400"
    >
      <Minus className="h-3 w-3" />
    </span>
  )
}

