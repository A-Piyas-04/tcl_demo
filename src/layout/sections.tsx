/**
 * Navigation below the sidebar.
 *
 * The sidebar holds four doors — Today, Deals, Directory, Reports. Everything
 * else is reached by going *down*, not sideways, so a page is never more than
 * three levels from home:
 *
 *   sidebar group  →  section tabs (where in the chain you are)
 *                  →  sub tabs     (which view of that step)
 *
 * The Deals tabs are deliberately in the order the work happens — a requirement
 * becomes an engagement, becomes an order, becomes a shipment, becomes
 * commission — so the tab row doubles as a picture of the business.
 */

import { Link, useLocation } from 'react-router-dom'
import { SectionTabs, type SectionTab } from '@/components/ui'
import { cn } from '@/lib/utils'

/** A section is one step of the chain, or one register. */
export type SectionKey =
  // Deals — the nine steps of one piece of business
  | 'requirements'
  | 'engagements'
  | 'orders'
  | 'shipments'
  | 'commission'
  // Directory — who and what
  | 'molecules'
  | 'manufacturers'
  | 'clients'
  // Reports — read and export
  | 'reports'

export type GroupKey = 'deals' | 'directory' | 'reports'

const GROUP_OF: Record<SectionKey, GroupKey> = {
  requirements: 'deals',
  engagements: 'deals',
  orders: 'deals',
  shipments: 'deals',
  commission: 'deals',
  molecules: 'directory',
  manufacturers: 'directory',
  clients: 'directory',
  reports: 'reports',
}

/** The first level under a sidebar entry. Deals reads left to right as the workflow. */
export const GROUP_TABS: Record<GroupKey, SectionTab[]> = {
  deals: [
    { to: '/requirements', label: 'Requirements' },
    { to: '/engagements', label: 'Engagements', match: ['/samples'] },
    { to: '/client-orders', label: 'Orders', match: ['/indents'] },
    { to: '/shipments', label: 'Shipments', match: ['/batches'] },
    { to: '/commissions', label: 'Commission' },
  ],
  directory: [
    // Product 2.0 is the molecule register now; the earlier catalogue stays at
    // /products/all and its record pages at /products/:id.
    { to: '/product-2', label: 'Molecules', match: ['/products', '/sources'] },
    { to: '/manufacturers', label: 'Manufacturers' },
    { to: '/clients', label: 'Clients' },
  ],
  reports: [
    { to: '/reports', label: 'Reports' },
    { to: '/relationships', label: 'Relationship explorer' },
    { to: '/documents', label: 'Documents & certificates' },
  ],
}

/**
 * The second level: different views of the same step. Only rendered when a
 * section has more than one, so most pages show a single tab row.
 */
export const SUB_TABS: Partial<Record<SectionKey, SectionTab[]>> = {
  requirements: [
    { to: '/requirements', label: 'All requirements' },
    { to: '/requirements/unsourced', label: 'Unsourced demand' },
  ],
  engagements: [
    { to: '/engagements', label: 'Pipeline' },
    { to: '/samples', label: 'Sample rounds' },
  ],
  orders: [
    { to: '/client-orders', label: 'Client orders' },
    { to: '/indents', label: 'Indents (manufacturer orders)' },
  ],
  shipments: [
    { to: '/shipments', label: 'Shipments' },
    { to: '/batches', label: 'Batches' },
  ],
  commission: [
    { to: '/commissions', label: 'Tracker' },
    { to: '/commissions/analysis', label: 'Analysis' },
  ],
  molecules: [
    { to: '/product-2', label: 'API products' },
    { to: '/product-2/orders', label: 'Trade orders' },
    { to: '/product-2/commission', label: 'Commission' },
  ],
}

export function SectionNav({
  section,
  subTabs,
  className,
}: {
  section: SectionKey
  /** overrides the standard sub tabs, for a page that can supply counts */
  subTabs?: SectionTab[]
  className?: string
}) {
  const subs = subTabs ?? SUB_TABS[section]
  return (
    <div className={className ?? 'mt-3'}>
      <SectionTabs tabs={GROUP_TABS[GROUP_OF[section]]} />
      {subs && subs.length > 1 ? <SubTabs tabs={subs} /> : null}
    </div>
  )
}

/** Lighter than the section tabs on purpose: it is a view switch, not a place. */
function SubTabs({ tabs }: { tabs: SectionTab[] }) {
  const location = useLocation()
  const isActive = (t: SectionTab) =>
    [t.to, ...(t.match ?? [])].some((p) => location.pathname === p || location.pathname.startsWith(`${p}/`))
  const active = tabs.filter(isActive).sort((a, b) => b.to.length - a.to.length)[0]

  return (
    <nav aria-label="Views" className="flex gap-1 overflow-x-auto pt-2">
      {tabs.map((t) => {
        const on = active?.to === t.to
        return (
          <Link
            key={t.to}
            to={t.to}
            aria-current={on ? 'page' : undefined}
            className={cn(
              'flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-sm transition-colors',
              on ? 'bg-ink-900 font-medium text-paper-50' : 'text-ink-500 hover:bg-paper-200 hover:text-ink-800',
            )}
          >
            {t.label}
            {typeof t.count === 'number' ? (
              <span className={cn('tabular text-sm', on ? 'text-paper-300' : 'text-ink-400')}>{t.count}</span>
            ) : null}
          </Link>
        )
      })}
    </nav>
  )
}
