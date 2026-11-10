/**
 * The reports index (module M11).
 *
 * One bounded card per report, each saying which business question it answers
 * and carrying a live headline figure, so the choice is made before the click.
 */

import * as React from 'react'
import { BarChart3, ClipboardList, FileText, Filter, Network, PackageSearch, Wallet } from 'lucide-react'
import { useDb } from '@/data/store'
import {
  developmentRegister,
  documentRows,
  registerTotals,
  requirementRows,
} from '@/data/selectors'
import { useAsyncData } from '@/lib/hooks'
import { fmtMoneyTotals, fmtMonth, pluralise } from '@/lib/utils'
import { SectionNav } from '@/layout/sections'
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
    const offered = db.stageHistory.filter((h) => h.toStage === 'OFFERED').length
    const commercial = new Set(
      db.stageHistory.filter((h) => h.toStage === 'COMMERCIAL').map((h) => h.engagementId),
    ).size
    return {
      month: thisMonth,
      register,
      outstanding: db.commissions
        .filter((c) => c.status !== 'WRITTEN_OFF')
        .map((c) => ({ amount: (c.amount ?? 0) - c.receivedAmount, currency: c.currency })),
      engagements: db.engagements.length,
      commercial: db.engagements.filter((e) => e.stage === 'COMMERCIAL').length,
      conversion: offered > 0 ? Math.round((commercial / offered) * 100) : 0,
      unsourced: requirementRows(db, { unsourcedOnly: true, openOnly: true }).length,
      expiringDocs: documentRows(db, { expiringOnly: true }).length,
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
      figureLabel: 'engagements on record',
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
      to: '/commissions/analysis',
      title: 'Commission',
      icon: <Wallet className="h-4 w-4" />,
      question: 'What has TCL earned, billed and collected, and what is still owed?',
      figure: data ? fmtMoneyTotals(data.outstanding, { compact: true, decimals: 0 }) : '—',
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
    {
      to: '/relationships',
      title: 'Relationship explorer',
      icon: <Network className="h-4 w-4" />,
      question: 'Which clients take which molecules, from which manufacturers?',
      figure: data ? String(data.commercial) : '—',
      figureLabel: 'client × source pairs in commercial supply',
    },
    {
      to: '/documents',
      title: 'Documents & certificates',
      icon: <FileText className="h-4 w-4" />,
      question: 'Which DMFs, CEPs, GMP certificates and COAs are on file, and which are expiring?',
      figure: data ? String(data.expiringDocs) : '—',
      figureLabel: 'expired or expiring within 90 days',
    },
  ]

  return (
    <div className="space-y-5">
      <div>
        <PageHeading
          title="Reports"
          subtitle="Look back across the business. Each report answers one question; every export is open to both roles and is logged."
        />
        <SectionNav section="reports" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => (
          <Panel key={card.to} className="flex flex-col">
            <PanelHeader title={card.title} subtitle={card.question} icon={card.icon} />
            <div className="flex flex-1 flex-col justify-between gap-3 p-4">
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
