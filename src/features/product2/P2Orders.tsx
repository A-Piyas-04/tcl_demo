/**
 * Product 2.0 — every client bulk order across all APIs, filterable by trade
 * stage, client and manufacturer.
 */

import * as React from 'react'
import { useNavigate } from 'react-router-dom'
import { ShoppingCart, SlidersHorizontal } from 'lucide-react'
import { useUrlFilters, useUrlSearch } from '@/lib/hooks'
import { pluralise } from '@/lib/utils'
import { Badge, Button, EmptyState, FilterBar, PageHeading, Panel, Select } from '@/components/ui'
import { useP2 } from './store'
import { P2Tabs, partyName, useFirstLoad } from './components'
import { OrdersTable } from './P2Detail'
import { TRADE_STAGES, currentTradeStage, tradeBundle } from './workflow'

const DEFAULTS = { q: '', status: '', stage: '', client: '', manufacturer: '' }

export function P2Orders() {
  const data = useP2()
  const navigate = useNavigate()
  const loading = useFirstLoad()
  const { values, setValue, clear, activeCount } = useUrlFilters(DEFAULTS)
  const [search, setSearch] = useUrlSearch(values.q, (v) => setValue('q', v))

  const bundles = React.useMemo(() => {
    const q = values.q.trim().toLowerCase()
    return data.tradeOrders
      .map((o) => tradeBundle(data, o))
      .filter((b) => {
        const stage = currentTradeStage(b)
        const src = data.sourcing.find((s) => s.id === b.order.sourcingId)
        if (q) {
          const api = data.apiProducts.find((a) => a.id === b.order.apiProductId)?.name.toLowerCase() ?? ''
          const hay = [
            b.order.orderRef,
            b.order.clientPoRef ?? '',
            api,
            partyName(data, b.order.clientId),
            b.pi?.piNumber ?? '',
            b.lc?.lcNumber ?? '',
            b.shipment?.blAwbNumber ?? '',
          ]
            .join(' ')
            .toLowerCase()
          if (!hay.includes(q)) return false
        }
        if (values.status === 'open' && stage === null) return false
        if (values.status === 'done' && stage !== null) return false
        if (values.stage && stage !== values.stage) return false
        if (values.client && b.order.clientId !== values.client) return false
        if (values.manufacturer && src?.manufacturerId !== values.manufacturer) return false
        return true
      })
      .sort((a, b) => (a.order.orderDate < b.order.orderDate ? 1 : -1))
  }, [data, values])

  const clients = data.parties.filter((p) => p.kind === 'CLIENT').sort((a, b) => a.name.localeCompare(b.name))
  const manufacturers = data.parties.filter((p) => p.kind === 'MANUFACTURER').sort((a, b) => a.name.localeCompare(b.name))

  return (
    <div className="space-y-4">
      <div>
        <PageHeading title="Product 2.0" subtitle="Client bulk orders across every API, and where each one stands." />
        <P2Tabs />
      </div>
      <Panel>
        <FilterBar
          search={search}
          onSearch={setSearch}
          searchPlaceholder="Order, PO, PI, LC, B/L, API or client…"
          activeCount={activeCount}
          onClear={clear}
          moreActive={['manufacturer'].filter((k) => values[k as keyof typeof values]).length}
          primary={
            <>
              <Select
                value={values.status}
                onChange={(v) => setValue('status', v)}
                allowEmpty
                emptyLabel="Open & completed"
                placeholder="Open & completed"
                options={[
                  { value: 'open', label: 'Open only' },
                  { value: 'done', label: 'Completed only' },
                ]}
              />
              <Select
                value={values.stage}
                onChange={(v) => setValue('stage', v)}
                allowEmpty
                emptyLabel="Any waiting stage"
                placeholder="Any waiting stage"
                options={TRADE_STAGES.map((s) => ({ value: s.key, label: `Waiting on: ${s.label}` }))}
              />
              <Select
                value={values.client}
                onChange={(v) => setValue('client', v)}
                allowEmpty
                emptyLabel="Any client"
                placeholder="Any client"
                options={clients.map((c) => ({ value: c.id, label: c.name }))}
              />
            </>
          }
          more={
            <Select
              value={values.manufacturer}
              onChange={(v) => setValue('manufacturer', v)}
              allowEmpty
              emptyLabel="Any manufacturer"
              placeholder="Any manufacturer"
              options={manufacturers.map((m) => ({ value: m.id, label: m.name }))}
            />
          }
          trailing={
            <span className="flex items-center gap-2 text-xs text-ink-500">
              <SlidersHorizontal className="h-3.5 w-3.5" />
              {pluralise(bundles.length, 'order')}
              {activeCount ? <Badge tone="accent">{activeCount} filters</Badge> : null}
            </span>
          }
        />
        <OrdersTable
          showApi
          bundles={bundles}
          data={data}
          loading={loading}
          onOpen={(b) => navigate(`/product-2/${b.order.apiProductId}/orders/${b.order.id}`)}
          empty={
            <EmptyState
              icon={<ShoppingCart className="h-5 w-5" />}
              title={activeCount ? 'No orders match these filters' : 'No trade orders yet'}
              description={activeCount ? 'Try removing a filter.' : 'Orders are created from an API’s page once a sample is accepted.'}
              action={
                activeCount ? (
                  <Button size="sm" onClick={clear}>
                    Clear filters
                  </Button>
                ) : null
              }
            />
          }
        />
      </Panel>
    </div>
  )
}
