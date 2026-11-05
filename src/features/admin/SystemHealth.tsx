/**
 * System health, prototype edition (NFR-MA-06 asks for a health endpoint).
 *
 * What a real deployment reports, database and file-storage connectivity, does
 * not exist here, so this page reports what it honestly can: how much is in the
 * store, which demonstration seed built it, and how to put it back.
 */

import * as React from 'react'
import { Activity, Database, RotateCcw, Timer } from 'lucide-react'
import { useDb, usePresenter, useStore } from '@/data/store'
import { SEED } from '@/data/seed'
import { fmtDateTime, fmtNumber, pluralise } from '@/lib/utils'
import type { Database as Db } from '@/data/types'
import {
  Badge,
  ConfirmDialog,
  Field,
  FieldGrid,
  Panel,
  PanelHeader,
  PageHeading,
  SegmentedControl,
  WriteButton,
} from '@/components/ui'
import { PrototypeNote } from './shared'

/** The collections worth counting, in the order the modules appear. */
const COLLECTIONS: { key: keyof Db; label: string }[] = [
  { key: 'companies', label: 'Companies' },
  { key: 'products', label: 'Products' },
  { key: 'manufacturerProducts', label: 'Sources' },
  { key: 'prices', label: 'Prices' },
  { key: 'requirements', label: 'Requirements' },
  { key: 'engagements', label: 'Engagements' },
  { key: 'samples', label: 'Sample rounds' },
  { key: 'clientOrders', label: 'Client orders' },
  { key: 'indents', label: 'Indents' },
  { key: 'shipments', label: 'Shipments' },
  { key: 'batches', label: 'Batches' },
  { key: 'documents', label: 'Documents' },
  { key: 'audit', label: 'Audit entries' },
  { key: 'security', label: 'Security entries' },
]

export function SystemHealth() {
  const db = useDb()
  const presenter = usePresenter()
  const setPresenter = useStore((s) => s.setPresenter)
  const resetDemoData = useStore((s) => s.resetDemoData)
  const [confirming, setConfirming] = React.useState(false)

  const counts = COLLECTIONS.map((c) => ({ ...c, count: (db[c.key] as unknown[]).length }))
  const total = counts.reduce((sum, c) => sum + c.count, 0)
  const newestAudit = db.audit[0]

  return (
    <div className="space-y-4">
      <PageHeading
        title="System health"
        subtitle="What this build is holding, and how to put it back the way it started."
        meta={
          <>
            <Badge tone="neutral">{pluralise(total, 'record')}</Badge>
            <Badge tone="outline">Seed {SEED}</Badge>
          </>
        }
        actions={
          <WriteButton
            variant="secondary"
            size="md"
            icon={<RotateCcw className="h-3.5 w-3.5" />}
            onClick={() => setConfirming(true)}
          >
            Reset demonstration data
          </WriteButton>
        }
      />

      <PrototypeNote title="There is no backend behind this build">
        Everything on this page is held in the browser's memory for as long as the tab is open. There is no server, no
        database and no file storage, so there is nothing to report on connectivity, replication or backups, and
        reloading the page starts the demonstration again. A real deployment answers all of that from the health
        endpoint NFR-MA-06 asks for.
      </PrototypeNote>

      <Panel>
        <PanelHeader
          title="Collections"
          subtitle="Row counts straight out of the store."
          icon={<Database className="h-4 w-4" />}
        />
        <div className="grid gap-3 p-3.5 sm:grid-cols-2 lg:grid-cols-4">
          {counts.map((c) => (
            <div key={c.key} className="rounded-md border border-paper-300 bg-white p-3">
              <p className="text-2xs font-semibold uppercase tracking-wider text-ink-500">{c.label}</p>
              <p className="mt-2 text-2xl font-semibold leading-none tracking-tight text-ink-900 tabular">
                {fmtNumber(c.count)}
              </p>
            </div>
          ))}
        </div>
      </Panel>

      <div className="grid gap-3 lg:grid-cols-2">
        <Panel>
          <PanelHeader title="This build" icon={<Activity className="h-4 w-4" />} />
          <div className="p-3.5">
            <FieldGrid cols={2}>
              <Field label="Demonstration seed" mono>
                {SEED}
              </Field>
              <Field label="Storage">In-memory, for this browser tab</Field>
              <Field label="Users on file">{pluralise(db.users.length, 'user')}</Field>
              <Field label="Newest audit entry">
                {newestAudit ? fmtDateTime(newestAudit.occurredAt) : 'None yet'}
              </Field>
            </FieldGrid>
          </div>
        </Panel>

        <Panel>
          <PanelHeader
            title="Simulated latency"
            subtitle="Every read and write waits, so loading states are real rather than decorative."
            icon={<Timer className="h-4 w-4" />}
          />
          <div className="space-y-3 p-3.5">
            <SegmentedControl
              value={presenter.latency}
              onChange={(v) => setPresenter({ latency: v })}
              options={[
                { value: 'off', label: 'Off' },
                { value: 'realistic', label: 'Realistic' },
                { value: 'slow', label: 'Slow' },
              ]}
            />
            <p className="text-xs leading-relaxed text-ink-500">
              Realistic waits between roughly 0.3 and 0.6 seconds, slow between 0.9 and 1.6, and off returns at once.
              It affects only the pause before an answer, never what the answer is.
            </p>
          </div>
        </Panel>
      </div>

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Reset demonstration data"
        recordName="every change made since this tab was opened"
        confirmLabel="Reset everything"
        consequence={
          <>
            The store is rebuilt from seed {SEED}, which discards {pluralise(total, 'record')} in their current state.
          </>
        }
        onConfirm={() => {
          resetDemoData()
          setConfirming(false)
        }}
      >
        <ul className="ml-4 list-disc space-y-1.5 text-xs leading-relaxed text-ink-600">
          <li>
            Every record added or edited during this session, including new users, products, engagements and orders.
          </li>
          <li>
            The audit log and the security log, both of which are rebuilt from the seed rather than carried over.
          </li>
          <li>Any threshold changed on the notifications page, which returns to its default.</li>
          <li>You stay signed in, and nothing outside this browser tab is touched.</li>
        </ul>
      </ConfirmDialog>
    </div>
  )
}
