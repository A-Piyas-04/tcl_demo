/**
 * The reports index (module M11).
 *
 * One bounded card per report, each saying which business question it answers
 * and carrying a live headline figure, so the choice is made before the click.
 */

import * as React from 'react'
import { BarChart3, ClipboardList, Filter, PackageSearch, Wallet } from 'lucide-react'
import { useDb } from '@/data/store'
import {
  commissionTotals,
  developmentRegister,
  registerTotals,
  requirementRows,
} from '@/data/selectors'
import { useAsyncData } from '@/lib/hooks'
import { fmtMoney, fmtMonth, pluralise } from '@/lib/utils'
import { LinkButton, Panel, PanelHeader, PageHeading, Skeleton } from '@/components/ui'
import { ReportNote, monthEnd, monthStart } from './shared'

interface ReportCard {
  to: string
  title: string
  icon: React.ReactNode
  question: string
  figure: string
  figureLabel: string
}

export function ReportsHome() {
  const db = useDb()

  const { data, loading } = useAsyncData(() => {
    const thisMonth = `${new Date().toISOString().slice(0, 7)}-01`
    const register = registerTotals(developmentRegister(db, monthStart(thisMonth), monthEnd(thisMonth)))
    const commission = commissionTotals(db)
    const offered = db.stageHistory.filter((h) => h.toStage === 'OFFERED').length
    const commercial = new Set(
      db.stageHistory.filter((h) => h.toStage === 'COMMERCIAL').map((h) => h.engagementId),
    ).size
    return {
      month: thisMonth,
      register,
      commission,
      engagements: db.engagements.length,
      conversion: offered > 0 ? Math.round((commercial / offered) * 100) : 0,
      unsourced: requirementRows(db, { unsourcedOnly: true, openOnly: true }).length,
    }
  }, [])

  const cards: ReportCard[] = [
    {
      to: '/reports/development-register',
      title: 'Development register',
      icon: <ClipboardList className="h-4 w-4" />,
      question: 'What did clients ask us to develop this month, and how far has each one got?',
      figure: data ? String(data.register.requirements) : '—',
      figureLabel: data ? `requirements in ${fmtMonth(data.month)}` : 'this month',
    },
    {
      to: '/reports/pipeline',
      title: 'Pipeline',
      icon: <BarChart3 className="h-4 w-4" />,
      question: 'Where does the book stand by stage, by owner and by client?',
      figure: data ? String(data.engagements) : '—',
      figureLabel: 'live engagements',
    },
    {
      to: '/reports/funnel',
      title: 'Conversion funnel',
      icon: <Filter className="h-4 w-4" />,
      question: 'How much of what we offer turns into supply, and how long does each step take?',
      figure: data ? `${data.conversion}%` : '—',
      figureLabel: 'of offers reach commercial supply',
    },
    {
      to: '/reports/commission',
      title: 'Commission',
      icon: <Wallet className="h-4 w-4" />,
      question: 'What has TCL earned, billed and collected, and what is still owed?',
      figure: data ? fmtMoney(data.commission.outstanding, 'USD', { compact: true, decimals: 0 }) : '—',
      figureLabel: 'outstanding from clients',
    },
    {
      to: '/requirements/unsourced',
      title: 'Unsourced demand',
      icon: <PackageSearch className="h-4 w-4" />,
      question: 'Which molecules have clients asked for that TCL cannot yet supply?',
      figure: data ? String(data.unsourced) : '—',
      figureLabel: 'open requirements with no represented source',
    },
  ]

  return (
    <div className="space-y-5">
      <PageHeading
        title="Reports"
        subtitle="Each report answers one question. Every export is open to both roles and is logged."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => (
          <Panel key={card.to} className="flex flex-col">
            <PanelHeader title={card.title} icon={card.icon} />
            <div className="flex flex-1 flex-col justify-between gap-3 p-4">
              <p className="text-xs leading-relaxed text-ink-600">{card.question}</p>
              <div>
                {loading ? (
                  <Skeleton className="h-7 w-24" />
                ) : (
                  <p className="text-2xl font-semibold leading-none tracking-tight tabular text-ink-900">{card.figure}</p>
                )}
                <p className="mt-1 text-2xs text-ink-500">{card.figureLabel}</p>
              </div>
              <LinkButton to={card.to} variant="secondary" size="sm" className="self-start">
                Open report
              </LinkButton>
            </div>
          </Panel>
        ))}
      </div>

      <ReportNote>
        The development register counts requirements, not rows, because a requirement pursued with two sources produces
        two rows. {data ? pluralise(data.register.rows, 'row') : 'Rows'} this month against{' '}
        {data ? pluralise(data.register.requirements, 'requirement') : 'the requirements'}.
      </ReportNote>
    </div>
  )
}
