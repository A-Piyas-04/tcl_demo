/**
 * Relationships landing page (module M9).
 *
 * Three ways of reading the same triangle. The tree follows one path; the two
 * matrices compare many rows at once. Short, bounded cards, no banner.
 */

import type * as React from 'react'
import { Grid3x3, Network, Share2 } from 'lucide-react'
import { useDb } from '@/data/store'
import { clients as clientList, manufacturers as mfrList } from '@/data/selectors'
import { pluralise } from '@/lib/utils'
import { AnimatedNumber, LinkButton, Panel, PanelHeader, PageHeading } from '@/components/ui'
import { StatCell, StatGrid } from './shared'
import { SectionNav } from '@/layout/sections'

interface Card {
  to: string
  title: string
  icon: React.ReactNode
  question: string
  detail: string
  cta: string
}

export function RelationshipsHome() {
  const db = useDb()

  const engagements = db.engagements.length
  const commercial = db.engagements.filter((e) => e.stage === 'COMMERCIAL').length
  const clientCount = clientList(db).length
  const manufacturerCount = mfrList(db).length
  const represented = db.portfolio.filter((p) => p.isActive).length

  const cards: Card[] = [
    {
      to: '/relationships/tree',
      title: 'Connection tree',
      icon: <Network className="h-4 w-4" />,
      question: 'Who supplies this molecule, and who takes it?',
      detail:
        'Root the tree on a client, a product or a manufacturer and follow the engagements outward. Edges carry the stage.',
      cta: 'Open the tree',
    },
    {
      to: '/relationships/client-product',
      title: 'Client against product',
      icon: <Grid3x3 className="h-4 w-4" />,
      question: 'What does each client take from TCL, and how far has it got?',
      detail: 'One row per client, one column per molecule, each cell the furthest stage that pairing has reached.',
      cta: 'Open the matrix',
    },
    {
      to: '/relationships/manufacturer-product',
      title: 'Manufacturer against product',
      icon: <Share2 className="h-4 w-4" />,
      question: 'What does each manufacturer supply through TCL, and to whom?',
      detail: 'The same map from the supply side, which is the view a manufacturer asks for when it wants volumes.',
      cta: 'Open the matrix',
    },
  ]

  return (
    <div className="space-y-5">
      <div>
        <PageHeading
          title="Reports"
          subtitle="Relationship explorer: the client, product and manufacturer triangle, read from any direction. Each client, product and manufacturer page also shows its own side of it."
        />
        <SectionNav section="reports" />
      </div>

      <StatGrid>
        <StatCell
          label="Engagements"
          value={<AnimatedNumber value={engagements} />}
          hint={`${commercial} in commercial supply`}
        />
        <StatCell label="Clients" value={<AnimatedNumber value={clientCount} />} hint="Bangladeshi pharma buyers" />
        <StatCell
          label="Manufacturers"
          value={<AnimatedNumber value={manufacturerCount} />}
          hint="Foreign API and excipient makers"
        />
        <StatCell
          label="Represented sources"
          value={<AnimatedNumber value={represented} />}
          tone="accent"
          hint="Manufacturer products TCL may offer"
        />
      </StatGrid>

      <div className="grid gap-4 lg:grid-cols-3">
        {cards.map((card) => (
          <Panel key={card.to} className="flex flex-col">
            <PanelHeader title={card.title} subtitle={card.question} icon={card.icon} />
            <div className="flex flex-1 flex-col justify-between gap-3 p-4">
              <p className="text-xs leading-relaxed text-ink-600">{card.detail}</p>
              <LinkButton to={card.to} variant="secondary" size="sm" className="self-start">
                {card.cta}
              </LinkButton>
            </div>
          </Panel>
        ))}
      </div>

      <p className="text-xs text-ink-500">
        {pluralise(engagements, 'engagement')} across {pluralise(clientCount, 'client')} and{' '}
        {pluralise(manufacturerCount, 'manufacturer')}. Every view here is read-only, and every export is logged.
      </p>
    </div>
  )
}
