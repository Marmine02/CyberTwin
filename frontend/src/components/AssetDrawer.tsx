import { Pencil, X } from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import type { Asset, SimResult, TwinModel } from '../api/types'
import type { Lang } from '../i18n'
import { fmtNumber, fmtScore } from '../i18n/format'
import { renderMessage } from '../i18n/messages'
import { assetNames } from '../lib/model'
import { TYPE_COLOR, TYPE_ICON } from './map/visuals'

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(0,40%)_1fr] gap-2 py-1 text-[13px]">
      <dt className="text-ink-400">{k}</dt>
      <dd className="min-w-0 break-words text-ink-100">{v}</dd>
    </div>
  )
}

interface Props {
  asset: Asset
  model: TwinModel
  result?: SimResult | null
  onClose: () => void
  editable: boolean
}

export function AssetDrawer({ asset, model, result, onClose, editable }: Props) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language as Lang
  const reduce = useReducedMotion()
  const navigate = useNavigate()
  const Icon = TYPE_ICON[asset.type]
  const names = assetNames(model)
  const vulns = model.vulnerabilities.filter((v) => v.asset_id === asset.id)
  const principals = model.principals.filter((p) => p.logged_on_assets.includes(asset.id) || p.permissions.some((x) => x.asset_id === asset.id))
  const findings = result?.findings.filter((f) => f.asset_id === asset.id) ?? []
  const paths = result?.paths.filter((p) => p.assets.includes(asset.id)).map((p) => p.id) ?? []
  const sc = asset.security_config
  return (
    <motion.aside className="glass absolute right-3 top-3 bottom-3 z-30 flex w-[360px] max-w-[calc(100%-24px)] flex-col" role="complementary"
      aria-label={t('ui.drawer.title', { name: asset.name })} data-testid="asset-drawer"
      initial={reduce ? false : { opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }}>
      <header className="relative z-[2] flex items-start gap-3 px-4 pt-4 pb-2">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-cyan/30" style={{ color: TYPE_COLOR[asset.type], filter: `drop-shadow(0 0 6px ${TYPE_COLOR[asset.type]})` }}>
          <Icon size={24} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-[20px] font-bold leading-tight text-ink-100" translate="no">{asset.name}</h2>
          <div className="mono text-ink-300">{asset.id} · {asset.ip}</div>
        </div>
        <button type="button" className="grid h-8 w-8 place-items-center rounded-lg text-ink-300 hover:text-ink-100" onClick={onClose} aria-label={t('ui.common.close')} data-testid="drawer-close">
          <X size={18} />
        </button>
      </header>
      <div className="relative z-[2] min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        <dl className="divide-y divide-cyan/8">
          <Row k={t('ui.asset.type')} v={t(`assetType.${asset.type}`)} />
          <Row k={t('ui.asset.zone')} v={t(`zone.${asset.zone}`)} />
          <Row k={t('ui.asset.os')} v={asset.os || '—'} />
          <Row k={t('ui.asset.criticality')} v={`${asset.criticality} / 5`} />
          <Row k={t('ui.asset.sensitivity')} v={`${asset.data_sensitivity} / 3`} />
          <Row k={t('ui.asset.risk')} v={<span className="num text-[16px]">{fmtScore(lang, asset.risk_score)}</span>} />
          <Row k={t('ui.asset.ports')} v={asset.open_ports.length ? asset.open_ports.map((p) => `${p.port}/${p.proto} ${p.service}${p.version ? ` (${p.version})` : ''}`).join(', ') : t('ui.common.none')} />
          <Row k={t('ui.asset.software')} v={asset.software.length ? asset.software.map((s) => `${s.name} ${s.version}${s.eol ? ` · ${t('ui.asset.eol')}` : ''}`).join(', ') : t('ui.common.none')} />
          <Row k={t('ui.asset.security')} v={[
            `${t('ui.asset.mfa')}: ${sc.mfa ? t('ui.common.yes') : t('ui.common.no')}`,
            `${t('ui.asset.edr')}: ${sc.edr ? t('ui.common.yes') : t('ui.common.no')}`,
            `${t('ui.asset.passwordPolicy')}: ${t(`strength.${sc.password_policy}`)}`,
          ].join(' · ')} />
          <Row k={t('ui.asset.localAdmins')} v={sc.local_admins.join(', ') || t('ui.common.none')} />
          <Row k={t('ui.asset.vulns')} v={vulns.length ? vulns.map((v) => `${v.cve} (CVSS ${fmtNumber(lang, v.cvss, 1)})`).join(', ') : t('ui.common.none')} />
          <Row k={t('ui.asset.principals')} v={principals.map((p) => p.id).join(', ') || t('ui.common.none')} />
          <Row k={t('ui.asset.paths')} v={paths.length ? <span className="mono">{paths.join(', ')}</span> : t('ui.common.none')} />
        </dl>
        {findings.length > 0 && (
          <>
            <h3 className="panel-title mt-4 mb-1 text-[13px]">{t('ui.asset.findings')}</h3>
            <ul className="flex flex-col gap-1.5 text-[13px] text-ink-200">
              {findings.map((f) => <li key={f.id}>• {renderMessage(t, lang, f.message, names)}</li>)}
            </ul>
          </>
        )}
      </div>
      {editable && (
        <footer className="relative z-[2] border-t border-cyan/10 p-3">
          <button type="button" className="btn-ghost w-full" onClick={() => navigate(`/assets?edit=${encodeURIComponent(asset.id)}`)} data-testid="drawer-edit">
            <Pencil size={14} /> {t('ui.drawer.edit')}
          </button>
        </footer>
      )}
    </motion.aside>
  )
}
