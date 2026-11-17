import { Eye, Lock, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useCrud, useSavePositions } from '../api/crud'
import { useCurrentTwin, useLatestRun, useModel, useViewedRevision } from '../api/hooks'
import { ASSET_TYPES, ZONES, type AssetType, type Connection, type Zone } from '../api/types'
import { AssetDrawer } from '../components/AssetDrawer'
import { TopologyMap } from '../components/map/TopologyMap'
import { ConfirmDialog, Dialog } from '../components/ui/Dialog'
import { GlassPanel } from '../components/ui/GlassPanel'
import { ErrorState, Loading } from '../components/ui/States'
import { useApp } from '../store/app'

type Kind = 'network' | 'trust'

function connectionId(kind: Kind, a: string, b: string, existing: Set<string>): string {
  const base = `${kind === 'network' ? 'n' : 't'}-${a}--${b}`.slice(0, 60)
  let id = base
  for (let i = 2; existing.has(id); i++) id = `${base}-${i}`
  return id
}

export function NetworkMap() {
  const { t } = useTranslation()
  const twin = useCurrentTwin()
  const viewed = useViewedRevision()
  const setRevision = useApp((s) => s.setRevision)
  const model = useModel()
  const latest = useLatestRun(null)
  const crud = useCrud('connections')
  const savePositions = useSavePositions()
  const [zone, setZone] = useState<Zone | null>(null)
  const [types, setTypes] = useState<AssetType[]>([])
  const [showPath, setShowPath] = useState(true)
  const [showDerived, setShowDerived] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const [draft, setDraft] = useState<{ source: string; target: string; kind: Kind; label: string } | null>(null)
  const [editing, setEditing] = useState<Connection | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<Connection | null>(null)
  const isHead = !!twin && viewed === twin.head_revision
  const result = latest.data?.result ?? null
  const asset = model.data?.assets.find((a) => a.id === selected)
  const ids = useMemo(() => new Set(model.data?.connections.map((c) => c.id) ?? []), [model.data])
  const nameOf = (id: string) => model.data?.assets.find((a) => a.id === id)?.name ?? id

  const toggleType = (ty: AssetType) => setTypes((cur) => (cur.includes(ty) ? cur.filter((x) => x !== ty) : [...cur, ty]))

  return (
    <div className="flex h-full min-h-[600px] flex-col gap-3" data-testid="page-map">
      <GlassPanel title={t('ui.nav.map')} index={0} className="min-h-0 flex-1" bodyClassName="flex flex-col gap-2"
        actions={!isHead && (
          <span className="chip border-warning/40 bg-warning/10 text-orange-200" data-testid="readonly-chip">
            <Lock size={13} /> {t('ui.map.readOnly', { n: viewed ?? '' })}
            <button type="button" className="underline" onClick={() => setRevision(null)}>{t('ui.map.goLatest')}</button>
          </span>
        )}>
        <div className="flex flex-wrap items-center gap-2 text-[13px]">
          <label className="flex items-center gap-2">
            <span className="text-ink-300">{t('ui.asset.zone')}</span>
            <select className="field w-auto py-1" value={zone ?? ''} onChange={(e) => setZone((e.target.value || null) as Zone | null)} data-testid="map-zone">
              <option value="">{t('ui.overview.zoneAll')}</option>
              {ZONES.map((z) => <option key={z} value={z}>{t(`zone.${z}`)}</option>)}
            </select>
          </label>
          <div className="flex flex-wrap gap-1" role="group" aria-label={t('ui.map.typeFilter')}>
            {ASSET_TYPES.map((ty) => (
              <button key={ty} type="button" aria-pressed={types.includes(ty)} onClick={() => toggleType(ty)}
                className={`chip ${types.includes(ty) ? 'border-cyan bg-cyan/20 text-cyan' : 'text-ink-300'}`}>{t(`assetType.${ty}`)}</button>
            ))}
          </div>
          <label className="ml-auto flex items-center gap-1.5 text-ink-200">
            <input type="checkbox" checked={showPath} onChange={(e) => setShowPath(e.target.checked)} /> {t('ui.map.showPath')}
          </label>
          <label className="flex items-center gap-1.5 text-ink-200">
            <input type="checkbox" checked={showDerived} onChange={(e) => setShowDerived(e.target.checked)} data-testid="toggle-derived" /> {t('ui.map.showPermissions')}
          </label>
        </div>
        <div className="relative min-h-[460px] flex-1 overflow-hidden rounded-xl border border-cyan/10">
          {model.isLoading && <Loading rows={6} />}
          {model.isError && <ErrorState error={model.error} onRetry={() => void model.refetch()} />}
          {model.data && (
            <TopologyMap model={model.data} result={showPath ? result : null} pathId={showPath ? result?.primary_path : null}
              zone={zone} types={types} showMinimap showControls showDerived={showDerived} editable={isHead}
              onNodeClick={setSelected}
              onNodeMoved={(id, x, y) => savePositions.mutate({ [id]: { x, y } })}
              onConnect={(source, target) => setDraft({ source, target, kind: 'network', label: '' })}
              onEdgeClick={(id) => {
                const c = model.data?.connections.find((x) => x.id === id)
                if (c && isHead) setEditing(c)
              }}
              ariaLabel={t('ui.nav.map')} />
          )}
          {asset && model.data && (
            <AssetDrawer asset={asset} model={model.data} result={result} onClose={() => setSelected(null)} editable={isHead} />
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-[12px] text-ink-300">
          <span className="font-semibold text-ink-200">{t('ui.map.legend')}:</span>
          <span className="flex items-center gap-1.5"><i className="inline-block h-0.5 w-6 bg-gradient-to-r from-cyan to-violet" />{t('ui.map.flow')}</span>
          <span className="flex items-center gap-1.5"><i className="inline-block w-6 border-t-2 border-dashed border-violet" />{t('ui.map.trust')}</span>
          <span className="flex items-center gap-1.5"><i className="inline-block w-6 border-t-2 border-dotted border-magenta" />{t('ui.map.permission')}</span>
          <span className="flex items-center gap-1.5"><i className="inline-block h-1 w-6 bg-critical shadow-[0_0_6px_#f43f5e]" />{t('ui.map.attackPath')}</span>
          <span className="flex items-center gap-1.5"><Eye size={13} />{isHead ? t('ui.map.hintEdit') : t('ui.map.hintReadOnly')}</span>
        </div>
      </GlassPanel>

      <Dialog open={!!draft} title={t('ui.map.newConnection')} onClose={() => setDraft(null)} testId="connect-dialog"
        footer={<>
          <button type="button" className="btn-ghost" onClick={() => setDraft(null)}>{t('ui.common.cancel')}</button>
          <button type="button" className="btn-neon" disabled={crud.create.isPending} data-testid="connect-save"
            onClick={() => {
              if (!draft) return
              crud.create.mutate({ id: connectionId(draft.kind, draft.source, draft.target, ids), source: draft.source, target: draft.target, kind: draft.kind, label: draft.label },
                { onSuccess: () => setDraft(null) })
            }}>{t('ui.common.save')}</button>
        </>}>
        {draft && (
          <div className="flex flex-col gap-3 text-sm">
            <p className="text-ink-200">{t('ui.map.connectFromTo', { a: nameOf(draft.source), b: nameOf(draft.target) })}</p>
            <label className="flex flex-col gap-1">
              <span className="text-ink-300">{t('ui.map.kind')}</span>
              <select className="field" value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value as Kind })} data-testid="connect-kind">
                <option value="network">{t('ui.map.flow')}</option>
                <option value="trust">{t('ui.map.trustExplained', { a: nameOf(draft.target), b: nameOf(draft.source) })}</option>
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-ink-300">{t('ui.map.label')}</span>
              <input className="field" maxLength={80} value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} />
            </label>
            <p className="text-[12px] text-ink-400">{t('ui.map.connectNote')}</p>
          </div>
        )}
      </Dialog>

      <Dialog open={!!editing} title={t('ui.map.editConnection')} onClose={() => setEditing(null)} testId="edge-dialog"
        footer={<>
          <button type="button" className="btn-ghost btn-danger mr-auto" onClick={() => { setConfirmDelete(editing); setEditing(null) }} data-testid="edge-delete">
            <Trash2 size={14} /> {t('ui.common.delete')}
          </button>
          <button type="button" className="btn-ghost" onClick={() => setEditing(null)}>{t('ui.common.cancel')}</button>
          <button type="button" className="btn-neon" disabled={crud.update.isPending} data-testid="edge-save"
            onClick={() => {
              if (!editing) return
              const { id, source, target, kind, label } = editing
              crud.update.mutate({ id, item: { id, source, target, kind, label } }, { onSuccess: () => setEditing(null) })
            }}>{t('ui.common.save')}</button>
        </>}>
        {editing && (
          <div className="flex flex-col gap-3 text-sm">
            <p className="mono text-ink-300">{editing.id}</p>
            <p className="text-ink-200">{nameOf(editing.source)} → {nameOf(editing.target)}</p>
            <label className="flex flex-col gap-1">
              <span className="text-ink-300">{t('ui.map.kind')}</span>
              <select className="field" value={editing.kind} onChange={(e) => setEditing({ ...editing, kind: e.target.value as Kind })}>
                <option value="network">{t('ui.map.flow')}</option>
                <option value="trust">{t('ui.map.trust')}</option>
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-ink-300">{t('ui.map.label')}</span>
              <input className="field" maxLength={80} value={editing.label} onChange={(e) => setEditing({ ...editing, label: e.target.value })} data-testid="edge-label" />
            </label>
          </div>
        )}
      </Dialog>

      <ConfirmDialog open={!!confirmDelete} title={t('ui.map.deleteConnection')} danger confirmLabel={t('ui.common.delete')}
        busy={crud.remove.isPending} onClose={() => setConfirmDelete(null)}
        onConfirm={() => confirmDelete && crud.remove.mutate(confirmDelete.id, { onSuccess: () => setConfirmDelete(null) })}>
        {confirmDelete && t('ui.map.deleteConnectionBody', { a: nameOf(confirmDelete.source), b: nameOf(confirmDelete.target) })}
      </ConfirmDialog>
    </div>
  )
}
