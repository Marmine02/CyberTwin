import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '../../api/client'
import {
  ASSET_TYPES, ZONES, type Asset, type AssetType, type Connection, type FirewallRule, type OpenPort, type Permission,
  type Principal, type Software, type Strength, type TwinModel, type Vulnerability, type Zone,
} from '../../api/types'
import { Checkbox, ID_RE, IPV4_RE, ListEditor, MultiSelect, NumberInput, SelectInput, TextInput, type Errors } from './Field'

export interface FormProps<T> {
  initial: T | null
  model: TwinModel
  onSubmit: (item: T) => void
  formId: string
}

const STRENGTHS: Strength[] = ['weak', 'medium', 'strong']

function useCommon() {
  const { t } = useTranslation()
  const req = (v: string) => (v.trim() ? undefined : t('ui.form.required'))
  const idErr = (v: string, taken: string[], isNew: boolean) =>
    !ID_RE.test(v) ? t('ui.form.idFormat') : isNew && taken.includes(v) ? t('ui.form.idTaken') : undefined
  return { t, req, idErr }
}

function clean(errs: Record<string, string | undefined>): Errors {
  const out: Errors = {}
  for (const [k, v] of Object.entries(errs)) if (v) out[k] = v
  return out
}

// ---- asset ----------------------------------------------------------------------------------------
type AssetDraft = Omit<Asset, 'vulnerability_ids' | 'risk_score'>

export function AssetForm({ initial, model, onSubmit, formId }: FormProps<AssetDraft>) {
  const { t, req, idErr } = useCommon()
  const isNew = initial === null
  const [a, setA] = useState<AssetDraft>(initial ?? {
    id: '', name: '', ip: '', type: 'app_server', os: '', zone: 'internal', open_ports: [], software: [],
    security_config: { mfa: false, password_policy: 'medium', edr: false, local_admins: [] }, criticality: 3, data_sensitivity: 0,
  })
  const [errors, setErrors] = useState<Errors>({})
  const set = <K extends keyof AssetDraft>(k: K, v: AssetDraft[K]) => setA((x) => ({ ...x, [k]: v }))
  const validate = (): Errors => {
    const portKeys = a.open_ports.map((p) => `${p.port}/${p.proto}`)
    return clean({
      id: idErr(a.id, model.assets.map((x) => x.id), isNew),
      name: req(a.name),
      ip: IPV4_RE.test(a.ip) ? undefined : t('ui.form.ipv4'),
      ports: a.open_ports.some((p) => p.port < 1 || p.port > 65535 || !p.service.trim()) ? t('ui.form.portRow')
        : new Set(portKeys).size !== portKeys.length ? t('ui.form.portDup') : undefined,
      software: a.software.some((s) => !s.name.trim() || !s.version.trim()) ? t('ui.form.softwareRow') : undefined,
    })
  }
  return (
    <form id={formId} noValidate className="grid grid-cols-1 gap-3 md:grid-cols-2" onSubmit={(e) => {
      e.preventDefault()
      const errs = validate()
      setErrors(errs)
      if (!Object.keys(errs).length) onSubmit({ ...a, os: a.os.trim(), name: a.name.trim() })
    }}>
      <TextInput label={t('ui.form.id')} value={a.id} onChange={(v) => set('id', v)} disabled={!isNew} error={errors.id} mono hint={t('ui.form.idHint')} maxLength={64} testId="f-id" />
      <TextInput label={t('ui.form.name')} value={a.name} onChange={(v) => set('name', v)} error={errors.name} maxLength={80} testId="f-name" />
      <TextInput label={t('ui.asset.ip')} value={a.ip} onChange={(v) => set('ip', v.trim())} error={errors.ip} mono testId="f-ip" />
      <TextInput label={t('ui.asset.os')} value={a.os} onChange={(v) => set('os', v)} maxLength={80} />
      <SelectInput label={t('ui.asset.type')} value={a.type} onChange={(v) => set('type', v as AssetType)} options={ASSET_TYPES.map((x) => ({ value: x, label: t(`assetType.${x}`) }))} testId="f-type" />
      <SelectInput label={t('ui.asset.zone')} value={a.zone} onChange={(v) => set('zone', v as Zone)} options={ZONES.map((z) => ({ value: z, label: t(`zone.${z}`) }))} testId="f-zone" />
      <NumberInput label={t('ui.asset.criticality')} value={a.criticality} min={1} max={5} onChange={(v) => set('criticality', Math.min(5, Math.max(1, v ?? 1)))} testId="f-criticality" />
      <NumberInput label={t('ui.asset.sensitivity')} value={a.data_sensitivity} min={0} max={3} onChange={(v) => set('data_sensitivity', Math.min(3, Math.max(0, v ?? 0)))} />
      <div className="md:col-span-2">
        <ListEditor<OpenPort> label={t('ui.asset.ports')} items={a.open_ports} onChange={(v) => set('open_ports', v)} empty={t('ui.form.noPorts')}
          addLabel={t('ui.form.addPort')} error={errors.ports} newItem={() => ({ port: 443, proto: 'tcp', service: '', version: '' })}
          render={(p, setP) => <>
            <NumberInput label={t('ui.form.port')} value={p.port} min={1} max={65535} onChange={(v) => setP({ ...p, port: v ?? 0 })} />
            <SelectInput label={t('ui.form.proto')} value={p.proto} onChange={(v) => setP({ ...p, proto: v })} options={[{ value: 'tcp', label: 'TCP' }, { value: 'udp', label: 'UDP' }]} />
            <TextInput label={t('ui.form.service')} value={p.service} onChange={(v) => setP({ ...p, service: v })} maxLength={64} />
            <TextInput label={t('ui.form.version')} value={p.version} onChange={(v) => setP({ ...p, version: v })} maxLength={64} />
          </>} />
      </div>
      <div className="md:col-span-2">
        <ListEditor<Software> label={t('ui.asset.software')} items={a.software} onChange={(v) => set('software', v)} empty={t('ui.form.noSoftware')}
          addLabel={t('ui.form.addSoftware')} error={errors.software} newItem={() => ({ name: '', version: '', eol: false })}
          render={(s, setS) => <>
            <TextInput label={t('ui.form.name')} value={s.name} onChange={(v) => setS({ ...s, name: v })} maxLength={64} />
            <TextInput label={t('ui.form.version')} value={s.version} onChange={(v) => setS({ ...s, version: v })} maxLength={64} />
            <div className="flex items-end pb-2"><Checkbox label={t('ui.asset.eol')} checked={s.eol} onChange={(v) => setS({ ...s, eol: v })} /></div>
          </>} />
      </div>
      <fieldset className="grid grid-cols-1 gap-3 rounded-xl border border-cyan/12 p-3 md:col-span-2 md:grid-cols-3">
        <legend className="px-1 text-[13px] text-ink-300">{t('ui.asset.security')}</legend>
        <Checkbox label={t('ui.asset.mfa')} checked={a.security_config.mfa} onChange={(v) => set('security_config', { ...a.security_config, mfa: v })} />
        <Checkbox label={t('ui.asset.edr')} checked={a.security_config.edr} onChange={(v) => set('security_config', { ...a.security_config, edr: v })} testId="f-edr" />
        <SelectInput label={t('ui.asset.passwordPolicy')} value={a.security_config.password_policy}
          onChange={(v) => set('security_config', { ...a.security_config, password_policy: v })} options={STRENGTHS.map((s) => ({ value: s, label: t(`strength.${s}`) }))} />
        <div className="md:col-span-3">
          <MultiSelect label={t('ui.asset.localAdmins')} value={a.security_config.local_admins}
            onChange={(v) => set('security_config', { ...a.security_config, local_admins: v })}
            options={model.principals.map((p) => ({ value: p.id, label: p.id }))} />
        </div>
      </fieldset>
    </form>
  )
}

// ---- principal ------------------------------------------------------------------------------------
export function PrincipalForm({ initial, model, onSubmit, formId }: FormProps<Principal>) {
  const { t, req, idErr } = useCommon()
  const isNew = initial === null
  const [p, setP] = useState<Principal>(initial ?? {
    id: '', name: '', kind: 'user', privilege: 'user', credential_strength: 'medium', mfa: false, kerberoastable: false,
    logged_on_assets: [], permissions: [],
  })
  const [errors, setErrors] = useState<Errors>({})
  const set = <K extends keyof Principal>(k: K, v: Principal[K]) => setP((x) => ({ ...x, [k]: v }))
  const assetOpts = model.assets.filter((a) => a.type !== 'internet_gateway' && a.type !== 'firewall').map((a) => ({ value: a.id, label: a.id }))
  return (
    <form id={formId} noValidate className="grid grid-cols-1 gap-3 md:grid-cols-2" onSubmit={(e) => {
      e.preventDefault()
      const perms = p.permissions.map((x) => x.asset_id)
      const errs = clean({
        id: idErr(p.id, model.principals.map((x) => x.id), isNew), name: req(p.name),
        permissions: perms.some((x) => !x) ? t('ui.form.required') : new Set(perms).size !== perms.length ? t('ui.form.permDup') : undefined,
      })
      setErrors(errs)
      if (!Object.keys(errs).length) onSubmit(p)
    }}>
      <TextInput label={t('ui.form.id')} value={p.id} onChange={(v) => set('id', v)} disabled={!isNew} error={errors.id} mono hint={t('ui.form.idHint')} maxLength={64} testId="f-id" />
      <TextInput label={t('ui.form.name')} value={p.name} onChange={(v) => set('name', v)} error={errors.name} maxLength={80} testId="f-name" />
      <SelectInput label={t('ui.principal.kind')} value={p.kind} onChange={(v) => set('kind', v)} options={[{ value: 'user', label: t('ui.principal.user') }, { value: 'service', label: t('ui.principal.service') }]} />
      <SelectInput label={t('ui.principal.privilege')} value={p.privilege} onChange={(v) => set('privilege', v)} options={(['user', 'admin', 'domain_admin'] as const).map((x) => ({ value: x, label: t(`privilege.${x}`) }))} />
      <SelectInput label={t('ui.principal.strength')} value={p.credential_strength} onChange={(v) => set('credential_strength', v)} options={STRENGTHS.map((s) => ({ value: s, label: t(`strength.${s}`) }))} testId="f-strength" />
      <div className="flex flex-col justify-end gap-2 pb-1">
        <Checkbox label={t('ui.asset.mfa')} checked={p.mfa} onChange={(v) => set('mfa', v)} />
        <Checkbox label={t('ui.principal.kerberoastable')} checked={p.kerberoastable} onChange={(v) => set('kerberoastable', v)} />
      </div>
      <div className="md:col-span-2"><MultiSelect label={t('ui.principal.loggedOn')} options={assetOpts} value={p.logged_on_assets} onChange={(v) => set('logged_on_assets', v)} /></div>
      <div className="md:col-span-2">
        <ListEditor<Permission> label={t('ui.principal.permissions')} items={p.permissions} onChange={(v) => set('permissions', v)} empty={t('ui.form.noPermissions')}
          addLabel={t('ui.form.addPermission')} error={errors.permissions} newItem={() => ({ asset_id: assetOpts[0]?.value ?? '', level: 'user' })}
          render={(x, setX) => <>
            <SelectInput label={t('ui.form.asset')} value={x.asset_id} onChange={(v) => setX({ ...x, asset_id: v })} options={assetOpts} />
            <SelectInput label={t('ui.form.level')} value={x.level} onChange={(v) => setX({ ...x, level: v })} options={[{ value: 'user', label: t('level.user') }, { value: 'admin', label: t('level.admin') }]} />
          </>} />
      </div>
    </form>
  )
}

// ---- firewall rule --------------------------------------------------------------------------------
function EndpointInput({ label, value, onChange, model }: { label: string; value: string; onChange: (v: string) => void; model: TwinModel }) {
  const { t } = useTranslation()
  const options = [
    { value: 'any', label: t('ui.rule.any') },
    ...ZONES.map((z) => ({ value: `zone:${z}`, label: `${t('ui.asset.zone')}: ${t(`zone.${z}`)}` })),
    ...model.assets.map((a) => ({ value: `asset:${a.id}`, label: `${t('ui.form.asset')}: ${a.id}` })),
  ]
  return <SelectInput label={label} value={value} onChange={onChange} options={options} />
}

export function RuleForm({ initial, model, onSubmit, formId }: FormProps<FirewallRule>) {
  const { t, idErr } = useCommon()
  const isNew = initial === null
  const firewalls = model.assets.filter((a) => a.type === 'firewall')
  const [r, setR] = useState<FirewallRule>(initial ?? {
    id: '', firewall_id: firewalls[0]?.id ?? '', order: 100, action: 'deny', src: 'any', dst: 'any', port: null, proto: null, description: '',
  })
  const [errors, setErrors] = useState<Errors>({})
  const set = <K extends keyof FirewallRule>(k: K, v: FirewallRule[K]) => setR((x) => ({ ...x, [k]: v }))
  return (
    <form id={formId} noValidate className="grid grid-cols-1 gap-3 md:grid-cols-2" onSubmit={(e) => {
      e.preventDefault()
      const clash = model.firewall_rules.some((x) => x.id !== r.id && x.firewall_id === r.firewall_id && x.order === r.order)
      const errs = clean({
        id: idErr(r.id, model.firewall_rules.map((x) => x.id), isNew),
        firewall_id: r.firewall_id ? undefined : t('ui.rule.noFirewall'),
        order: r.order < 0 ? t('ui.form.range', { min: 0, max: 100000 }) : clash ? t('ui.rule.orderTaken') : undefined,
        port: r.port !== null && (r.port < 1 || r.port > 65535) ? t('ui.form.range', { min: 1, max: 65535 }) : undefined,
      })
      setErrors(errs)
      if (!Object.keys(errs).length) onSubmit(r)
    }}>
      <TextInput label={t('ui.form.id')} value={r.id} onChange={(v) => set('id', v)} disabled={!isNew} error={errors.id} mono maxLength={64} testId="f-id" />
      <SelectInput label={t('ui.rule.firewall')} value={r.firewall_id} onChange={(v) => set('firewall_id', v)} error={errors.firewall_id}
        options={firewalls.map((f) => ({ value: f.id, label: `${f.name} (${f.id})` }))} />
      <NumberInput label={t('ui.rule.order')} value={r.order} min={0} max={100000} onChange={(v) => set('order', v ?? 0)} error={errors.order} testId="f-order" />
      <SelectInput label={t('ui.rule.action')} value={r.action} onChange={(v) => set('action', v)} options={[{ value: 'allow', label: t('ui.rule.allow') }, { value: 'deny', label: t('ui.rule.deny') }]} />
      <EndpointInput label={t('ui.rule.src')} value={r.src} onChange={(v) => set('src', v)} model={model} />
      <EndpointInput label={t('ui.rule.dst')} value={r.dst} onChange={(v) => set('dst', v)} model={model} />
      <NumberInput label={t('ui.form.port')} value={r.port} allowEmpty min={1} max={65535} onChange={(v) => set('port', v)} error={errors.port} />
      <SelectInput label={t('ui.form.proto')} value={r.proto ?? ''} onChange={(v) => set('proto', v === '' ? null : v)}
        options={[{ value: '', label: t('ui.rule.any') }, { value: 'tcp', label: 'TCP' }, { value: 'udp', label: 'UDP' }]} />
      <div className="md:col-span-2"><TextInput label={t('ui.rule.description')} value={r.description} onChange={(v) => set('description', v)} maxLength={120} /></div>
    </form>
  )
}

// ---- connection -----------------------------------------------------------------------------------
export function ConnectionForm({ initial, model, onSubmit, formId }: FormProps<Connection>) {
  const { t, idErr } = useCommon()
  const isNew = initial === null
  const first = model.assets[0]?.id ?? ''
  const [c, setC] = useState<Connection>(initial ?? { id: '', source: first, target: model.assets[1]?.id ?? first, kind: 'network', label: '' })
  const [errors, setErrors] = useState<Errors>({})
  const set = <K extends keyof Connection>(k: K, v: Connection[K]) => setC((x) => ({ ...x, [k]: v }))
  const opts = model.assets.map((a) => ({ value: a.id, label: `${a.name} (${a.id})` }))
  return (
    <form id={formId} noValidate className="grid grid-cols-1 gap-3 md:grid-cols-2" onSubmit={(e) => {
      e.preventDefault()
      const errs = clean({ id: idErr(c.id, model.connections.map((x) => x.id), isNew), target: c.source === c.target ? t('ui.form.selfLoop') : undefined })
      setErrors(errs)
      if (!Object.keys(errs).length) onSubmit({ id: c.id, source: c.source, target: c.target, kind: c.kind, label: c.label })
    }}>
      <TextInput label={t('ui.form.id')} value={c.id} onChange={(v) => set('id', v)} disabled={!isNew} error={errors.id} mono maxLength={64} testId="f-id" />
      <SelectInput label={t('ui.map.kind')} value={c.kind as 'network' | 'trust'} onChange={(v) => set('kind', v)} options={[{ value: 'network', label: t('ui.map.flow') }, { value: 'trust', label: t('ui.map.trust') }]} />
      <SelectInput label={t('ui.conn.source')} value={c.source} onChange={(v) => set('source', v)} options={opts} />
      <SelectInput label={t('ui.conn.target')} value={c.target} onChange={(v) => set('target', v)} options={opts} error={errors.target} />
      <div className="md:col-span-2"><TextInput label={t('ui.map.label')} value={c.label} onChange={(v) => set('label', v)} maxLength={80} /></div>
    </form>
  )
}

// ---- vulnerability --------------------------------------------------------------------------------
interface CatalogEntry {
  cve: string; title: string; cvss: number; exploit_maturity: Vulnerability['exploit_maturity']; kind: Vulnerability['kind']
  service: string | null; grants: 'user' | 'admin'; attack_ids: string[]; fixed_by: { software: string; version: string }
}

export function VulnForm({ initial, model, onSubmit, formId }: FormProps<Vulnerability>) {
  const { t, req, idErr } = useCommon()
  const isNew = initial === null
  const catalog = useQuery({ queryKey: ['catalog'], queryFn: () => api.get<CatalogEntry[]>('/vulns/catalog') })
  const hosts = model.assets.filter((a) => a.type !== 'internet_gateway' && a.type !== 'firewall')
  const [v, setV] = useState<Vulnerability>(initial ?? {
    id: '', cve: '', title: '', cvss: 7.5, exploit_maturity: 'poc', kind: 'remote_exploit', asset_id: hosts[0]?.id ?? '', port: null,
    grants: 'user', attack_ids: [], fixed_by: { action: 'apply_patch', software: '', version: '' }, illustrative: true,
  })
  const [errors, setErrors] = useState<Errors>({})
  const set = <K extends keyof Vulnerability>(k: K, val: Vulnerability[K]) => setV((x) => ({ ...x, [k]: val }))
  const asset = model.assets.find((a) => a.id === v.asset_id)
  const applyTemplate = (cve: string) => {
    const c = catalog.data?.find((x) => x.cve === cve)
    if (!c) return
    const port = c.service ? asset?.open_ports.find((p) => p.service === c.service)?.port ?? asset?.open_ports[0]?.port ?? null : null
    setV((x) => ({ ...x, cve: c.cve, title: c.title, cvss: c.cvss, exploit_maturity: c.exploit_maturity, kind: c.kind, grants: c.kind === 'local_privesc' ? 'admin' : c.grants,
      attack_ids: c.attack_ids, port: c.kind === 'remote_exploit' ? port : null, fixed_by: { action: 'apply_patch', ...c.fixed_by },
      id: x.id || `v-${c.cve.toLowerCase()}-${x.asset_id}`.replace(/[^a-z0-9._-]/g, '-').slice(0, 64) }))
  }
  return (
    <form id={formId} noValidate className="grid grid-cols-1 gap-3 md:grid-cols-2" onSubmit={(e) => {
      e.preventDefault()
      const errs = clean({
        id: idErr(v.id, model.vulnerabilities.map((x) => x.id), isNew),
        cve: /^CVE-\d{4}-\d{4,7}$/.test(v.cve) ? undefined : t('ui.vuln.cveFormat'),
        title: req(v.title),
        cvss: v.cvss < 0 || v.cvss > 10 ? t('ui.form.range', { min: 0, max: 10 }) : undefined,
        port: v.kind === 'remote_exploit' && v.port === null ? t('ui.vuln.portNeeded') : undefined,
      })
      setErrors(errs)
      if (!Object.keys(errs).length) onSubmit({ ...v, grants: v.kind === 'local_privesc' ? 'admin' : v.grants, port: v.kind === 'local_privesc' ? null : v.port })
    }}>
      {isNew && (
        <div className="md:col-span-2">
          <SelectInput label={t('ui.vuln.template')} value="" onChange={applyTemplate} testId="f-template"
            options={[{ value: '', label: t('ui.vuln.templatePick') }, ...(catalog.data ?? []).map((c) => ({ value: c.cve, label: `${c.cve} · ${c.title}` }))]} />
        </div>
      )}
      <SelectInput label={t('ui.form.asset')} value={v.asset_id} onChange={(x) => set('asset_id', x)} options={hosts.map((a) => ({ value: a.id, label: `${a.name} (${a.id})` }))} testId="f-asset" />
      <TextInput label={t('ui.form.id')} value={v.id} onChange={(x) => set('id', x)} disabled={!isNew} error={errors.id} mono maxLength={64} testId="f-id" />
      <TextInput label="CVE" value={v.cve} onChange={(x) => set('cve', x.trim().toUpperCase())} error={errors.cve} mono testId="f-cve" />
      <TextInput label={t('ui.vuln.title')} value={v.title} onChange={(x) => set('title', x)} error={errors.title} maxLength={120} testId="f-title" />
      <NumberInput label="CVSS" value={v.cvss} min={0} max={10} step={0.1} onChange={(x) => set('cvss', x ?? 0)} error={errors.cvss} testId="f-cvss" />
      <SelectInput label={t('ui.vuln.maturity')} value={v.exploit_maturity} onChange={(x) => set('exploit_maturity', x)}
        options={(['unproven', 'poc', 'functional', 'high'] as const).map((m) => ({ value: m, label: t(`ui.vuln.mat.${m}`) }))} />
      <SelectInput label={t('ui.vuln.kind')} value={v.kind} onChange={(x) => set('kind', x)}
        options={[{ value: 'remote_exploit', label: t('technique.remote_exploit') }, { value: 'local_privesc', label: t('technique.local_privesc') }]} />
      {v.kind === 'remote_exploit' ? (
        <SelectInput label={t('ui.form.port')} value={String(v.port ?? '')} onChange={(x) => set('port', x === '' ? null : Number(x))} error={errors.port}
          options={[{ value: '', label: t('ui.vuln.pickPort') }, ...(asset?.open_ports ?? []).map((p) => ({ value: String(p.port), label: `${p.port}/${p.proto} ${p.service}` }))]} />
      ) : <div />}
      {v.kind === 'remote_exploit' && (
        <SelectInput label={t('ui.vuln.grants')} value={v.grants} onChange={(x) => set('grants', x)} options={[{ value: 'user', label: t('level.user') }, { value: 'admin', label: t('level.admin') }]} />
      )}
      <TextInput label={t('ui.vuln.attackIds')} value={v.attack_ids.join(', ')} onChange={(x) => set('attack_ids', x.split(',').map((s) => s.trim()).filter(Boolean))} mono hint={t('ui.vuln.attackHint')} />
      <TextInput label={t('ui.vuln.fixSoftware')} value={v.fixed_by.software} onChange={(x) => set('fixed_by', { ...v.fixed_by, software: x })} maxLength={64} />
      <TextInput label={t('ui.vuln.fixVersion')} value={v.fixed_by.version} onChange={(x) => set('fixed_by', { ...v.fixed_by, version: x })} maxLength={64} />
      <div className="flex items-end pb-1"><Checkbox label={t('ui.vuln.illustrative')} checked={v.illustrative} onChange={(x) => set('illustrative', x)} /></div>
    </form>
  )
}
