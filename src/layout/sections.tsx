/**
 * The second level of navigation. Each sidebar item that covers more than one
 * list shows these tabs under its heading, so related views sit together
 * without each needing its own place in the sidebar.
 */

import { SectionTabs, type SectionTab } from '@/components/ui'

export type SectionKey = 'requirements' | 'engagements' | 'orders' | 'shipments' | 'commission' | 'reports'

export const SECTION_TABS: Record<SectionKey, SectionTab[]> = {
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
  reports: [
    { to: '/reports', label: 'Reports' },
    { to: '/relationships', label: 'Relationship explorer' },
    { to: '/documents', label: 'Documents & certificates' },
  ],
}

export function SectionNav({ section, className }: { section: SectionKey; className?: string }) {
  return <SectionTabs tabs={SECTION_TABS[section]} className={className ?? 'mt-3'} />
}
