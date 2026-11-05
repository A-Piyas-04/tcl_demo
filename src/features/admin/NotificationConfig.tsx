/**
 * Thresholds and notifications (NFR-MA-03, and doc 00 §3 on who gets told).
 *
 * The two thresholds the orders screens read while you watch are editable here,
 * so changing one visibly changes what the application allows. The rest are
 * shown read-only, because nothing in the prototype acts on them.
 */

import * as React from 'react'
import { BellRing, RotateCcw, SlidersHorizontal } from 'lucide-react'
import { useCanWrite, useSettings, useStore } from '@/data/store'
import { DEFAULT_SETTINGS } from '@/data/reference'
import { fmtNumber, pluralise } from '@/lib/utils'
import {
  Badge,
  Field,
  FieldGrid,
  FormRow,
  NumberInput,
  Panel,
  PanelHeader,
  PageHeading,
  WriteButton,
} from '@/components/ui'
import { PrototypeNote } from './shared'

/** The settings the prototype only displays, with what each one would govern. */
const READ_ONLY_SETTINGS: {
  key: keyof typeof DEFAULT_SETTINGS
  label: string
  unit: string
  description: string
}[] = [
  {
    key: 'sessionIdleMinutes',
    label: 'Session idle timeout',
    unit: 'minutes',
    description: 'An idle session is ended and the person signs in again (FR-M1-07).',
  },
  {
    key: 'loginLockoutAttempts',
    label: 'Failed sign-ins before lockout',
    unit: 'attempts',
    description: 'Consecutive failures that lock the account. Every failure is written to the security log.',
  },
  {
    key: 'maxUploadMb',
    label: 'Maximum upload size',
    unit: 'MB',
    description: 'Applied per document. A larger file is refused at upload rather than part-stored.',
  },
  {
    key: 'reportSyncRowLimit',
    label: 'Report row limit',
    unit: 'rows',
    description: 'Above this, an export is produced in the background and the requester is told when it is ready.',
  },
  {
    key: 'docExpiryWarnDays',
    label: 'Document expiry warning window',
    unit: 'days',
    description: 'How early an expiring certificate appears in the expiring-documents report.',
  },
]

export function NotificationConfig() {
  const settings = useSettings()
  const canWrite = useCanWrite()

  /**
   * The prototype keeps settings in the store rather than in a settings table,
   * so a local setter is enough. A real build would call the settings endpoint
   * and audit the change.
   */
  const setSetting = React.useCallback((key: keyof typeof DEFAULT_SETTINGS, value: number) => {
    useStore.setState((s) => ({ settings: { ...s.settings, [key]: value } }))
  }, [])

  const changed = (Object.keys(DEFAULT_SETTINGS) as (keyof typeof DEFAULT_SETTINGS)[]).filter(
    (k) => settings[k] !== DEFAULT_SETTINGS[k],
  )

  return (
    <div className="space-y-4">
      <PageHeading
        title="Thresholds and notifications"
        subtitle="The numbers the rules read from, and who hears about an event."
        meta={
          <>
            <Badge tone="neutral">{pluralise(Object.keys(settings).length, 'setting')}</Badge>
            {changed.length > 0 ? <Badge tone="warn">{changed.length} changed from the default</Badge> : null}
          </>
        }
        actions={
          changed.length > 0 ? (
            <WriteButton
              variant="secondary"
              size="md"
              icon={<RotateCcw className="h-3.5 w-3.5" />}
              onClick={() => useStore.setState({ settings: { ...DEFAULT_SETTINGS } })}
            >
              Restore defaults
            </WriteButton>
          ) : null
        }
      />

      <PrototypeNote title="Two of these are live">
        The over-shipment tolerance and the minimum shelf life are read by the orders and batch screens every time they
        check a quantity or a batch, so changing one here changes what the application accepts on the next attempt. The
        remaining settings are shown as they are configured, because nothing in this prototype acts on them.
      </PrototypeNote>

      <div className="grid gap-3 sm:grid-cols-2">
        <Panel>
          <PanelHeader
            title="Over-shipment tolerance"
            subtitle="FR-M8: how much more than the indented quantity may be shipped."
            icon={<SlidersHorizontal className="h-4 w-4" />}
          />
          <div className="space-y-2.5 p-3.5">
            <FormRow
              label="Tolerance"
              hint="A shipment line beyond this is refused rather than warned about. Zero means the indented quantity exactly."
            >
              {canWrite ? (
                <NumberInput
                  value={settings.overshipmentTolerancePct}
                  onChange={(v) => setSetting('overshipmentTolerancePct', Math.max(0, Math.min(100, v ?? 0)))}
                  suffix="%"
                />
              ) : (
                <p className="text-sm tabular text-ink-800">{settings.overshipmentTolerancePct}%</p>
              )}
            </FormRow>
            <p className="text-xs leading-relaxed text-ink-500">
              Currently {settings.overshipmentTolerancePct}%, so an indent for 1,000 KG accepts up to{' '}
              {fmtNumber(Math.round(1000 * (1 + settings.overshipmentTolerancePct / 100)))} KG.
              {settings.overshipmentTolerancePct === DEFAULT_SETTINGS.overshipmentTolerancePct
                ? ' This is the default.'
                : ` The default is ${DEFAULT_SETTINGS.overshipmentTolerancePct}%.`}
            </p>
          </div>
        </Panel>

        <Panel>
          <PanelHeader
            title="Minimum shelf life"
            subtitle="The remaining shelf life a batch must have on arrival."
            icon={<SlidersHorizontal className="h-4 w-4" />}
          />
          <div className="space-y-2.5 p-3.5">
            <FormRow
              label="Minimum remaining"
              hint="A client may hold a stricter figure of its own, and the stricter of the two applies."
            >
              {canWrite ? (
                <NumberInput
                  value={settings.minShelfLifeMonths}
                  onChange={(v) => setSetting('minShelfLifeMonths', Math.max(0, Math.min(120, v ?? 0)))}
                  suffix="months"
                />
              ) : (
                <p className="text-sm tabular text-ink-800">{settings.minShelfLifeMonths} months</p>
              )}
            </FormRow>
            <p className="text-xs leading-relaxed text-ink-500">
              Currently {settings.minShelfLifeMonths} months.
              {settings.minShelfLifeMonths === DEFAULT_SETTINGS.minShelfLifeMonths
                ? ' This is the default.'
                : ` The default is ${DEFAULT_SETTINGS.minShelfLifeMonths} months.`}
            </p>
          </div>
        </Panel>
      </div>

      <Panel>
        <PanelHeader title="Other configured thresholds" subtitle="Shown as configured, not editable in this build." />
        <div className="grid gap-3 p-3.5 sm:grid-cols-2 lg:grid-cols-3">
          {READ_ONLY_SETTINGS.map((s) => (
            <div key={s.key} className="rounded-md border border-paper-300 bg-white p-3">
              <p className="text-2xs font-semibold uppercase tracking-wider text-ink-500">{s.label}</p>
              <p className="mt-2 flex items-baseline gap-1.5">
                <span className="text-2xl font-semibold leading-none tracking-tight text-ink-900">
                  {fmtNumber(settings[s.key])}
                </span>
                <span className="text-xs font-medium text-ink-400">{s.unit}</span>
              </p>
              <p className="mt-2 text-xs leading-relaxed text-ink-500">{s.description}</p>
            </div>
          ))}
        </div>
      </Panel>

      <Panel>
        <PanelHeader title="Who a notification goes to" icon={<BellRing className="h-4 w-4" />} />
        <div className="space-y-3 p-3.5">
          <FieldGrid cols={2}>
            <Field label="Record events">
              The owner of the record concerned, for example the owner of an ageing engagement or a shipment held at
              customs
            </Field>
            <Field label="Company-wide events">
              Every active Full Access user, for unsourced demand, a certificate about to expire, and a failed upload
              scan
            </Field>
            <Field label="Never">A persona or a team, because the system has no concept of either</Field>
            <Field label="Muting">Each user can mute categories from their own profile</Field>
          </FieldGrid>
          <p className="text-xs leading-relaxed text-ink-500">
            Job titles such as BD officer or sourcing officer describe who owns a task in the business. They carry no
            permissions and cannot be addressed, so a notification is sent to the recorded owner or to everyone who
            could act on it.
          </p>
        </div>
      </Panel>
    </div>
  )
}
