import { useQuery } from '@tanstack/react-query'
import { ArrowDownUp, Lock, Pencil, Plus, Search, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router'
import { api } from '../api/client'
import { useCrud, type CollectionPath } from '../api/crud'
import { useCurrentTwin, useModel, useViewedRevision } from '../api/hooks'
import type { Asset, Connection, FirewallRule, Principal, TwinModel, Vulnerability } from '../api/types'
import { AssetForm, ConnectionForm, PrincipalForm, RuleForm, VulnForm } from '../components/forms/EntityForms'
import { ConfirmDialog, Dialog } from '../components/ui/Dialog'
import { GlassPanel } from '../components/ui/GlassPanel'
import { Empty, ErrorState, Loading } from '../components/ui/States'
import { Tabs } from '../components/ui/Tabs'
import type { Lang } from '../i18n'
import { fmtNumber, fmtScore } from '../i18n/format'
import { useApp } from '../store/app'

type TabKey = 'assets' | 'principals' | 'rules' | 'connections' | 'vulns'
type Row = { id: string }

interface Column<T> {
  key: string
  label: string
  value: (r: T) => string | number
  render?: (r: T) => ReactNode
  mono?: boolean
}

interface TabDef<T extends Row> {
  key: TabKey
  path: CollectionPath
  entity: string
  rows: (m: TwinModel) => T[]
  columns: Column<T>[]
  filter?: { label: string; options: { value: string; label: string }[]; match: (r: T, v: string) => boolean }
}

function Table<T extends Row>({ def, rows, onEdit, onDelete, editable }: {
  def: TabDef<T>; rows: T[]; onEdit: (r: T) => void; onDelete: (r: T) => void; editable: boolean
}) {
  const { t } = useTranslation()
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState('')
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 }>({ key: def.columns[0]?.key ?? 'id', dir: 1 })
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const col = def.columns.find((c) => c.key === sort.key)
    return rows
      .filter((r) => !needle || def.columns.some((c) => String(c.value(r)).toLowerCase().includes(needle)))
      .filter((r) => !filter || !def.filter || def.filter.match(r, filter))
      .sort((a, b) => {
        const va = col?.value(a) ?? ''
        const vb = col?.value(b) ?? ''
        return (typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb))) * sort.dir
      })
  }, [rows, q, filter, sort, def])
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-[220px] flex-1">
          <span className="sr-only">{t('ui.table.search')}</span>
          <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-400" />
          <input className="field pl-8" placeholder={t('ui.table.search')} value={q} onChange={(e) => setQ(e.target.value)} data-testid="table-search" />
        </label>
        {def.filter && (
          <label className="flex items-center gap-2 text-[13px]">
            <span className="text-ink-300">{def.filter.label}</span>
            <select className="field w-auto" value={filter} onChange={(e) => setFilter(e.target.value)} data-testid="table-filter">
              <option value="">{t('ui.table.all')}</option>
              {def.filter.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
        )}
        <span className="text-[12px] text-ink-400" aria-live="polite">{t('ui.table.count', { count: shown.length, total: rows.length })}</span>
      </div>
      {shown.length === 0 ? <Empty>{rows.length ? t('ui.table.noMatch') : t('ui.table.empty')}</Empty> : (
        <div className="overflow-x-auto rounded-xl border border-cyan/12">
          <table className="w-full min-w-[720px] border-collapse text-[13px]" data-testid={`table-${def.key}`}>
            <thead>
              <tr className="bg-ink-950/50 text-left text-ink-300">
                {def.columns.map((c) => (
                  <th key={c.key} scope="col" className="px-3 py-2 font-medium" aria-sort={sort.key === c.key ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
                    <button type="button" className="inline-flex items-center gap-1 hover:text-cyan" onClick={() => setSort((s) => ({ key: c.key, dir: s.key === c.key ? (s.dir === 1 ? -1 : 1) : 1 }))}>
                      {c.label} <ArrowDownUp size={12} className={sort.key === c.key ? 'text-cyan' : 'opacity-40'} />
                    </button>
                  </th>
                ))}
                <th scope="col" className="px-3 py-2 text-right font-medium">{t('ui.table.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id} className="border-t border-cyan/8 hover:bg-cyan/4" data-testid={`row-${r.id}`}>
                  {def.columns.map((c) => (
                    <td key={c.key} className={`px-3 py-2 align-top text-ink-100 ${c.mono ? 'font-mono text-[12.5px]' : ''}`}>{c.render ? c.render(r) : c.value(r)}</td>
                  ))}
                  <td className="whitespace-nowrap px-3 py-1.5 text-right">
                    <button type="button" className="mr-1 inline-grid h-8 w-8 place-items-center rounded-lg text-ink-300 hover:bg-cyan/10 hover:text-cyan disabled:opacity-30"
                      disabled={!editable} onClick={() => onEdit(r)} aria-label={t('ui.table.edit', { id: r.id })} data-testid={`edit-${r.id}`}><Pencil size={15} /></button>
                    <button type="button" className="inline-grid h-8 w-8 place-items-center rounded-lg text-ink-300 hover:bg-critical/10 hover:text-critical disabled:opacity-30"
                      disabled={!editable} onClick={() => onDelete(r)} aria-label={t('ui.table.delete', { id: r.id })} data-testid={`delete-${r.id}`}><Trash2 size={15} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function DependentsList({ twinId, assetId }: { twinId: number; assetId: string }) {
  const { t } = useTranslation()
  const q = useQuery({
    queryKey: ['dependents', twinId, assetId],
    queryFn: () => api.get<Record<string, string[]>>(`/twins/${twinId}/assets/${encodeURIComponent(assetId)}/dependents`),
  })
  if (q.isLoading) return <Loading rows={2} />
  if (q.isError) return <ErrorState error={q.error} />
  const entries = Object.entries(q.data ?? {}).filter(([, v]) => v.length)
  if (!entries.length) return <p className="mt-2 text-ink-300">{t('ui.table.noDependents')}</p>
  return (
    <div className="mt-3 flex flex-col gap-2" data-testid="dependents">
      <p className="text-ink-200">{t('ui.table.dependentsIntro')}</p>
      {entries.map(([k, ids]) => (
        <div key={k}>
          <div className="text-[12px] uppercase tracking-wider text-ink-400">{t(`ui.table.dep.${k}`)} ({ids.length})</div>
          <div className="mono text-ink-100">{ids.join(', ')}</div>
        </div>
      ))}
    </div>
  )
}

export function Assets() {
  const { t, i18n } = useTranslation()
  const lang = i18n.language as Lang
  const twin = useCurrentTwin()
  const viewed = useViewedRevision()
  const setRevision = useApp((s) => s.setRevision)
  const model = useModel()
  const [params, setParams] = useSearchParams()
  const [tab, setTab] = useState<TabKey>('assets')
  const [editing, setEditing] = useState<{ tab: TabKey; item: Row | null } | null>(null)
  const [deleting, setDeleting] = useState<{ tab: TabKey; item: Row } | null>(null)
  const isHead = !!twin && viewed === twin.head_revision

  const crudFor: Record<TabKey, ReturnType<typeof useCrud>> = {
    assets: useCrud('assets'), principals: useCrud('principals'), rules: useCrud('firewall-rules'),
    connections: useCrud('connections'), vulns: useCrud('vulnerabilities'),
  }

  // Deep link from the map drawer: /assets?edit=<id>
  const editParam = params.get('edit')
  const [handledEdit, setHandledEdit] = useState<string | null>(null)
  if (editParam && model.data && handledEdit !== editParam) {
    setHandledEdit(editParam)
    const a = model.data.assets.find((x) => x.id === editParam)
    if (a) {
      setTab('assets')
      setEditing({ tab: 'assets', item: a })
    }
  }
  useEffect(() => {
    if (editParam && handledEdit === editParam) setParams({}, { replace: true })
  }, [editParam, handledEdit, setParams])

  const yesNo = (b: boolean) => (b ? t('ui.common.yes') : t('ui.common.no'))
  const defs = {
    assets: {
      key: 'assets', path: 'assets', entity: 'asset', rows: (m) => m.assets,
      columns: [
        { key: 'name', label: t('ui.form.name'), value: (a) => a.name, render: (a) => <span translate="no"><b className="font-semibold">{a.name}</b> <span className="mono text-ink-400">{a.id}</span></span> },
        { key: 'ip', label: t('ui.asset.ip'), value: (a) => a.ip, mono: true },
        { key: 'type', label: t('ui.asset.type'), value: (a) => t(`assetType.${a.type}`) },
        { key: 'zone', label: t('ui.asset.zone'), value: (a) => t(`zone.${a.zone}`) },
        { key: 'crit', label: t('ui.asset.criticalityShort'), value: (a) => a.criticality },
        { key: 'vulns', label: t('ui.asset.vulns'), value: (a) => a.vulnerability_ids.length },
        { key: 'risk', label: t('ui.asset.risk'), value: (a) => a.risk_score, render: (a) => <span className="num text-[15px]">{fmtScore(lang, a.risk_score)}</span> },
      ],
      filter: { label: t('ui.asset.zone'), options: ['internet', 'dmz', 'internal', 'data', 'mgmt'].map((z) => ({ value: z, label: t(`zone.${z}`) })), match: (a, v) => a.zone === v },
    } satisfies TabDef<Asset>,
    principals: {
      key: 'principals', path: 'principals', entity: 'principal', rows: (m) => m.principals,
      columns: [
        { key: 'id', label: t('ui.form.id'), value: (p) => p.id, mono: true },
        { key: 'name', label: t('ui.form.name'), value: (p) => p.name },
        { key: 'kind', label: t('ui.principal.kind'), value: (p) => t(`ui.principal.${p.kind}`) },
        { key: 'priv', label: t('ui.principal.privilege'), value: (p) => t(`privilege.${p.privilege}`) },
        { key: 'str', label: t('ui.principal.strength'), value: (p) => t(`strength.${p.credential_strength}`) },
        { key: 'mfa', label: t('ui.asset.mfa'), value: (p) => yesNo(p.mfa) },
        { key: 'perms', label: t('ui.principal.permissions'), value: (p) => p.permissions.map((x) => `${x.asset_id}:${t(`level.${x.level}`)}`).join(', ') },
      ],
      filter: { label: t('ui.principal.kind'), options: [{ value: 'user', label: t('ui.principal.user') }, { value: 'service', label: t('ui.principal.service') }], match: (p, v) => p.kind === v },
    } satisfies TabDef<Principal>,
    rules: {
      key: 'rules', path: 'firewall-rules', entity: 'firewall_rule', rows: (m) => m.firewall_rules,
      columns: [
        { key: 'fw', label: t('ui.rule.firewall'), value: (r) => r.firewall_id, mono: true },
        { key: 'order', label: t('ui.rule.order'), value: (r) => r.order },
        { key: 'action', label: t('ui.rule.action'), value: (r) => t(`ui.rule.${r.action}`), render: (r) => <span className={r.action === 'allow' ? 'text-secure' : 'text-critical'}>{t(`ui.rule.${r.action}`)}</span> },
        { key: 'src', label: t('ui.rule.src'), value: (r) => r.src, mono: true },
        { key: 'dst', label: t('ui.rule.dst'), value: (r) => r.dst, mono: true },
        { key: 'port', label: t('ui.form.port'), value: (r) => (r.port === null ? t('ui.rule.any') : `${r.port}/${r.proto ?? 'tcp'}`) },
        { key: 'desc', label: t('ui.rule.description'), value: (r) => r.description },
      ],
      filter: { label: t('ui.rule.firewall'), options: (model.data?.assets ?? []).filter((a) => a.type === 'firewall').map((a) => ({ value: a.id, label: a.id })), match: (r, v) => r.firewall_id === v },
    } satisfies TabDef<FirewallRule>,
    connections: {
      key: 'connections', path: 'connections', entity: 'connection', rows: (m) => m.connections,
      columns: [
        { key: 'id', label: t('ui.form.id'), value: (c) => c.id, mono: true },
        { key: 'kind', label: t('ui.map.kind'), value: (c) => (c.kind === 'trust' ? t('ui.map.trust') : t('ui.map.flow')) },
        { key: 'source', label: t('ui.conn.source'), value: (c) => c.source, mono: true },
        { key: 'target', label: t('ui.conn.target'), value: (c) => c.target, mono: true },
        { key: 'label', label: t('ui.map.label'), value: (c) => c.label },
      ],
      filter: { label: t('ui.map.kind'), options: [{ value: 'network', label: t('ui.map.flow') }, { value: 'trust', label: t('ui.map.trust') }], match: (c, v) => c.kind === v },
    } satisfies TabDef<Connection>,
    vulns: {
      key: 'vulns', path: 'vulnerabilities', entity: 'vulnerability', rows: (m) => m.vulnerabilities,
      columns: [
        { key: 'cve', label: 'CVE', value: (v) => v.cve, mono: true },
        { key: 'title', label: t('ui.vuln.title'), value: (v) => v.title },
        { key: 'asset', label: t('ui.form.asset'), value: (v) => v.asset_id, mono: true },
        { key: 'cvss', label: 'CVSS', value: (v) => v.cvss, render: (v) => fmtNumber(lang, v.cvss, 1) },
        { key: 'kind', label: t('ui.vuln.kind'), value: (v) => t(`technique.${v.kind}`) },
        { key: 'port', label: t('ui.form.port'), value: (v) => v.port ?? '—' },
        { key: 'ill', label: t('ui.vuln.illustrativeShort'), value: (v) => yesNo(v.illustrative) },
      ],
      filter: { label: t('ui.vuln.kind'), options: [{ value: 'remote_exploit', label: t('technique.remote_exploit') }, { value: 'local_privesc', label: t('technique.local_privesc') }], match: (v, x) => v.kind === x },
    } satisfies TabDef<Vulnerability>,
  }

  const m = model.data
  const tabs: { key: TabKey; label: string; count?: number }[] = [
    { key: 'assets', label: t('ui.assetsPage.assets'), count: m?.assets.length },
    { key: 'principals', label: t('ui.assetsPage.principals'), count: m?.principals.length },
    { key: 'rules', label: t('ui.assetsPage.rules'), count: m?.firewall_rules.length },
    { key: 'connections', label: t('ui.assetsPage.connections'), count: m?.connections.length },
    { key: 'vulns', label: t('ui.assetsPage.vulns'), count: m?.vulnerabilities.length },
  ]
  const def = defs[tab] as unknown as TabDef<Row>
  const formId = 'entity-form'
  const editingDef = editing ? defs[editing.tab] : null
  const busy = editing ? (crudFor[editing.tab].create.isPending || crudFor[editing.tab].update.isPending) : false

  const submit = (item: object & { id: string }) => {
    if (!editing) return
    const c = crudFor[editing.tab]
    const done = { onSuccess: () => setEditing(null) }
    if (editing.item) c.update.mutate({ id: editing.item.id, item }, done)
    else c.create.mutate(item, done)
  }

  const formFor = () => {
    if (!editing || !m) return null
    const common = { model: m, formId, onSubmit: submit }
    switch (editing.tab) {
      case 'assets': {
        const a = editing.item as Asset | null
        return <AssetForm {...common} initial={a ? (({ vulnerability_ids: _v, risk_score: _r, ...rest }) => rest)(a) : null} />
      }
      case 'principals': return <PrincipalForm {...common} initial={editing.item as Principal | null} />
      case 'rules': return <RuleForm {...common} initial={editing.item as FirewallRule | null} />
      case 'connections': return <ConnectionForm {...common} initial={editing.item as Connection | null} />
      case 'vulns': return <VulnForm {...common} initial={editing.item as Vulnerability | null} />
    }
  }

  return (
    <div className="flex flex-col gap-3" data-testid="page-assets">
      <GlassPanel title={t('ui.nav.assets')} index={0}
        actions={!isHead && (
          <span className="chip border-warning/40 bg-warning/10 text-orange-200">
            <Lock size={13} /> {t('ui.map.readOnly', { n: viewed ?? '' })}
            <button type="button" className="underline" onClick={() => setRevision(null)}>{t('ui.map.goLatest')}</button>
          </span>
        )}>
        <div className="flex flex-col gap-3">
          <Tabs tabs={tabs} active={tab} onChange={setTab} label={t('ui.nav.assets')}
            right={<button type="button" className="btn-neon" disabled={!isHead || !m} onClick={() => setEditing({ tab, item: null })} data-testid="create-button">
              <Plus size={16} /> {t(`ui.assetsPage.new.${tab}`)}
            </button>} />
          {model.isLoading && <Loading rows={6} />}
          {model.isError && <ErrorState error={model.error} onRetry={() => void model.refetch()} />}
          {m && <Table key={tab} def={def} rows={def.rows(m)} editable={isHead}
            onEdit={(item) => setEditing({ tab, item })} onDelete={(item) => setDeleting({ tab, item })} />}
        </div>
      </GlassPanel>

      <Dialog open={!!editing} width={760} testId="entity-dialog" onClose={() => setEditing(null)}
        title={editing && editingDef ? (editing.item ? t('ui.crud.editTitle', { entity: t(`entity.${editingDef.entity}`), id: editing.item.id }) : t(`ui.assetsPage.new.${editing.tab}`)) : ''}
        footer={<>
          <button type="button" className="btn-ghost" onClick={() => setEditing(null)}>{t('ui.common.cancel')}</button>
          <button type="submit" form={formId} className="btn-neon" disabled={busy} data-testid="entity-save">{t('ui.common.save')}</button>
        </>}>
        <p className="mb-3 text-[12.5px] text-ink-400">{t('ui.crud.revisionNote')}</p>
        {formFor()}
      </Dialog>

      <ConfirmDialog open={!!deleting} danger testId="delete-dialog" onClose={() => setDeleting(null)}
        title={deleting ? t('ui.crud.deleteTitle', { entity: t(`entity.${defs[deleting.tab].entity}`), id: deleting.item.id }) : ''}
        confirmLabel={t('ui.common.delete')} busy={deleting ? crudFor[deleting.tab].remove.isPending : false}
        onConfirm={() => deleting && crudFor[deleting.tab].remove.mutate(deleting.item.id, { onSuccess: () => setDeleting(null) })}>
        <p>{t('ui.crud.deleteBody')}</p>
        {deleting?.tab === 'assets' && twin && <DependentsList twinId={twin.id} assetId={deleting.item.id} />}
      </ConfirmDialog>
    </div>
  )
}
