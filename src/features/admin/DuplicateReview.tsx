/**
 * Duplicate review (FR-M13-05, FR-M13-06).
 *
 * A record lands here when somebody saved it past a near-match warning, so each
 * one is either a genuine second record or a near-miss spelling. Clearing the
 * flag is a real write. Merging is not implemented in this prototype, and the
 * dialog says so rather than pretending.
 */

import * as React from 'react'
import { CopyCheck, GitMerge } from 'lucide-react'
import { useDb } from '@/data/store'
import { updateCompany, updateProduct } from '@/data/api'
import { normaliseName, similarity } from '@/data/rules'
import { PRODUCT_CATEGORY_LABEL, countryName } from '@/data/reference'
import { runAction } from '@/lib/hooks'
import { fmtDate, fmtPct, pluralise } from '@/lib/utils'
import {
  Badge,
  Button,
  Dialog,
  EmptyState,
  Field,
  FieldGrid,
  LinkButton,
  Meter,
  Panel,
  PanelHeader,
  PageHeading,
  WriteOnly,
} from '@/components/ui'
import { PrototypeNote } from './shared'

interface Candidate {
  id: string
  name: string
  score: number
  subtitle: string
  to: string
}

interface Flagged {
  id: string
  kind: 'company' | 'product'
  title: string
  subtitle: string
  normalised: string
  createdAt: string
  to: string
  candidates: Candidate[]
}

export function DuplicateReview() {
  const db = useDb()
  const [merging, setMerging] = React.useState<Flagged | null>(null)
  const [clearing, setClearing] = React.useState<string | null>(null)

  const flagged = React.useMemo<Flagged[]>(() => {
    const companies = db.companies
      .filter((c) => c.possibleDuplicate && c.isActive)
      .map<Flagged>((c) => ({
        id: c.id,
        kind: 'company',
        title: c.legalName,
        subtitle: `${c.displayName} · ${countryName(c.countryCode)}`,
        normalised: normaliseName(c.legalName),
        createdAt: c.createdAt,
        to: c.kind === 'CLIENT' ? `/clients/${c.id}` : `/manufacturers/${c.id}`,
        candidates: db.companies
          .filter((other) => other.id !== c.id && other.isActive)
          .map((other) => ({
            id: other.id,
            name: other.legalName,
            score: similarity(c.legalName, other.legalName),
            subtitle: `${other.displayName} · ${countryName(other.countryCode)}`,
            to: other.kind === 'CLIENT' ? `/clients/${other.id}` : `/manufacturers/${other.id}`,
          }))
          .filter((cand) => cand.score >= 0.5)
          .sort((a, b) => b.score - a.score)
          .slice(0, 4),
      }))

    const products = db.products
      .filter((p) => p.possibleDuplicate && p.isActive)
      .map<Flagged>((p) => ({
        id: p.id,
        kind: 'product',
        title: p.genericName,
        subtitle: `${PRODUCT_CATEGORY_LABEL[p.category]}${p.casNumber ? ` · CAS ${p.casNumber}` : ''}`,
        normalised: normaliseName(p.genericName),
        createdAt: p.createdAt,
        to: `/products/${p.id}`,
        candidates: db.products
          .filter((other) => other.id !== p.id && other.isActive)
          .map((other) => ({
            id: other.id,
            name: other.genericName,
            score: similarity(p.genericName, other.genericName),
            subtitle: `${PRODUCT_CATEGORY_LABEL[other.category]}${
              other.casNumber ? ` · CAS ${other.casNumber}` : ''
            }`,
            to: `/products/${other.id}`,
          }))
          .filter((cand) => cand.score >= 0.5)
          .sort((a, b) => b.score - a.score)
          .slice(0, 4),
      }))

    return [...companies, ...products].sort(
      (a, b) => (b.candidates[0]?.score ?? 0) - (a.candidates[0]?.score ?? 0),
    )
  }, [db])

  const clearFlag = async (row: Flagged) => {
    setClearing(row.id)
    await runAction(
      async () => {
        if (row.kind === 'company') await updateCompany(row.id, { possibleDuplicate: false })
        else await updateProduct(row.id, { possibleDuplicate: false })
      },
      { success: `${row.title} is no longer flagged as a possible duplicate.` },
    )
    setClearing(null)
  }

  return (
    <div className="space-y-4">
      <PageHeading
        title="Duplicate review"
        subtitle="Companies and products saved past a near-match warning, beside the records they most resemble."
        meta={
          <>
            <Badge tone={flagged.length > 0 ? 'warn' : 'ok'}>{pluralise(flagged.length, 'record')} flagged</Badge>
            <Badge tone="neutral">
              {pluralise(flagged.filter((f) => f.kind === 'company').length, 'company', 'companies')}
            </Badge>
            <Badge tone="neutral">{pluralise(flagged.filter((f) => f.kind === 'product').length, 'product')}</Badge>
          </>
        }
      />

      <PrototypeNote title="Names are compared after normalising">
        The comparison lowercases the name, strips accents and punctuation, and removes company suffixes such as Ltd,
        GmbH and Pvt, so "Aurobindo Pharma Ltd." and "aurobindo pharma limited" are the same string. The percentage is
        the overlap of three-character sequences between the two normalised names. Both roles can see the normalised
        form, because it is what the duplicate check actually looked at.
      </PrototypeNote>

      {flagged.length === 0 ? (
        <Panel className="p-4">
          <EmptyState
            icon={<CopyCheck className="h-5 w-5" />}
            title="Nothing awaiting review"
            description="A record is flagged only when somebody saves it past a near-match warning. An exact match on name and country is refused outright, so it never reaches this queue."
            action={
              <LinkButton to="/manufacturers" variant="secondary" size="sm">
                Open manufacturers
              </LinkButton>
            }
            secondary={
              <LinkButton to="/products" variant="ghost" size="sm">
                Open products
              </LinkButton>
            }
          />
        </Panel>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {flagged.map((row) => (
            <Panel key={row.id}>
              <PanelHeader
                title={row.title}
                subtitle={row.subtitle}
                icon={<CopyCheck className="h-4 w-4" />}
                actions={<Badge tone="warn">{row.kind === 'company' ? 'Company' : 'Product'}</Badge>}
              />
              <div className="space-y-3 p-3.5">
                <FieldGrid cols={2}>
                  <Field label="Normalised name" mono>
                    {row.normalised}
                  </Field>
                  <Field label="Created">{fmtDate(row.createdAt)}</Field>
                </FieldGrid>

                <div className="space-y-2">
                  <p className="text-2xs font-medium uppercase tracking-wide text-ink-500">Likely matches</p>
                  {row.candidates.length === 0 ? (
                    <p className="text-xs leading-relaxed text-ink-500">
                      Nothing above fifty per cent similarity remains. Whatever it was first compared against may since
                      have been archived, so this flag can probably be cleared.
                    </p>
                  ) : (
                    <ul className="space-y-2">
                      {row.candidates.map((cand) => (
                        <li key={cand.id} className="rounded border border-paper-300 bg-paper-50 p-2.5">
                          <div className="flex items-baseline justify-between gap-2">
                            <LinkButton to={cand.to} variant="ghost" size="sm" className="-ml-2 max-w-full">
                              <span className="truncate">{cand.name}</span>
                            </LinkButton>
                            <span className="shrink-0 text-xs font-semibold tabular text-ink-700">
                              {fmtPct(cand.score * 100, 0)}
                            </span>
                          </div>
                          <p className="truncate text-2xs text-ink-500">{cand.subtitle}</p>
                          <p className="mt-0.5 font-mono text-2xs text-ink-400">{normaliseName(cand.name)}</p>
                          <Meter
                            value={cand.score}
                            max={1}
                            className="mt-1.5"
                            tone={cand.score >= 0.8 ? 'bg-danger-600' : 'bg-warn-600'}
                          />
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <WriteOnly>
                  <div className="flex flex-wrap items-center gap-2 border-t border-paper-200 pt-3">
                    <Button
                      variant="secondary"
                      size="sm"
                      loading={clearing === row.id}
                      onClick={() => void clearFlag(row)}
                    >
                      Not a duplicate
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={<GitMerge className="h-3.5 w-3.5" />}
                      onClick={() => setMerging(row)}
                    >
                      Merge
                    </Button>
                  </div>
                </WriteOnly>
              </div>
            </Panel>
          ))}
        </div>
      )}

      {merging ? <MergeDialog row={merging} onClose={() => setMerging(null)} /> : null}
    </div>
  )
}

/** FR-M13-06 is a "could have", and this build does not implement it. */
function MergeDialog({ row, onClose }: { row: Flagged; onClose: () => void }) {
  const target = row.candidates[0]
  return (
    <Dialog
      open
      onOpenChange={(o) => (o ? null : onClose())}
      title={`Merge ${row.title}`}
      description={
        target
          ? `The closest match is ${target.name}, at ${fmtPct(target.score * 100, 0)} similarity.`
          : 'No close match remains to merge into.'
      }
      icon={<GitMerge className="h-5 w-5 text-accent-600" />}
      footer={
        <Button variant="secondary" size="sm" onClick={onClose}>
          Close
        </Button>
      }
    >
      <div className="space-y-3 text-xs leading-relaxed text-ink-600">
        <p className="font-medium text-ink-800">What a merge would do</p>
        <ul className="ml-4 list-disc space-y-1.5">
          <li>
            Keep one record as the survivor and re-point every reference to the other: sites, contacts, sources,
            prices, requirements, engagements, offers, samples, orders, indents, shipments, documents and activities.
          </li>
          <li>Mark the absorbed record inactive rather than deleting it, so older links still resolve.</li>
          <li>
            Write the merge to the audit trail as a single event naming both records, so the history of each one
            remains readable afterwards.
          </li>
          <li>Refuse the merge outright if the two records are not the same kind, or if either is already inactive.</li>
        </ul>
        <p className="rounded border border-warn-200 bg-warn-50 p-2.5 text-warn-600">
          Merging is not implemented in this prototype. Closing this dialog changes nothing, and no record is touched.
          In the built system this is an administrator tool run inside one transaction, since a half-finished merge
          would leave references pointing at a record that no longer exists.
        </p>
        <p>
          Until then the honest option is to clear the flag on whichever record is genuine and mark the other inactive
          from its own page.
        </p>
      </div>
    </Dialog>
  )
}
