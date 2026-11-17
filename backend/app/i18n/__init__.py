"""Engine message catalog (EN + TR + AZ) and a server-side renderer.

The frontend loads this catalog (GET /api/v1/i18n/engine) into its i18next "engine" namespace and translates
messages itself; the server uses the same catalog for printable reports and the deterministic AI fallback.
Placeholders use the i18next syntax ``{{name}}``. A parameter can itself be a message (rendered recursively)
or a list (rendered and joined with ", ").
"""

from __future__ import annotations

import re
from typing import TYPE_CHECKING, Any

from app.i18n.az import AZ
from app.i18n.story import STORY
from app.schemas.i18n import Message, MsgParam, msg

if TYPE_CHECKING:
    from app.schemas.twin import Vulnerability

CATALOG: dict[str, dict[str, str]] = {
    "en": {
        # attack graph edges (step reasons / replay labels)
        "edge.reach.via": "{{origin}} can reach {{dst}} tcp/{{port}} ({{service}}) via {{via}}",
        "edge.reach.direct": "{{origin}} can reach {{dst}} tcp/{{port}} ({{service}}) over a direct link",
        "edge.remote_exploit": "Exploit {{vuln}} on {{asset}}:{{port}} to get {{privilege}} access{{edr}}",
        "edge.brute_force": "Guess the {{strength}} password of '{{principal}}' on {{asset}} {{service}}/{{port}}{{mfa}}",
        "edge.local_privesc": "Escalate to admin on {{asset}} via {{vuln}}{{edr}}",
        "edge.credential_theft": "Dump cached credentials of '{{principal}}' from {{asset}}{{edr}}",
        "edge.credential_use": "Log on to {{asset}} as '{{principal}}' ({{level}}){{mfa}}",
        "edge.data_access.cred": "Read data on {{asset}} with the {{level}} rights of '{{principal}}'{{mfa}}",
        "edge.data_access.admin": "Admin on {{asset}} reads its data (sensitivity {{sensitivity}})",
        "edge.domain_takeover.principal": "'{{principal}}' is a domain admin{{mfa}}",
        "edge.domain_takeover.idp": "Admin on identity server {{asset}} controls the domain",
        "edge.kerberoast": "Request a service ticket for '{{principal}}' from {{asset}} and crack its {{strength}} password offline",
        "edge.trust_abuse": "Abuse the trust {{source}} → {{target}}{{as}}",
        "edge.permission_abuse": "Abuse the stored credential on {{source}} to reach {{target}}",
        "note.edr": " (EDR present)",
        "note.no_mfa": " (no MFA)",
        "note.mfa_enabled": " (MFA enabled)",
        "note.mfa_challenge": ", MFA challenge",
        "note.as_principal": " as '{{principal}}'",
        "word.internet": "internet",
        "priv.user": "user",
        "priv.admin": "admin",
        "level.read": "read",
        "level.write": "write",
        "level.admin": "admin",
        "level.none": "no access",
        "strength.weak": "weak",
        "strength.medium": "medium",
        "strength.strong": "strong",
        "zone.internet": "Internet",
        "zone.dmz": "DMZ",
        "zone.internal": "Internal",
        "zone.data": "Data",
        "zone.mgmt": "Mgmt",
        # goals
        "goal.data": "Sensitive data on {{asset}}",
        "goal.cred": "Credentials of {{principal}}",
        "goal.domain_admin": "Domain admin",
        "goal.idp_admin": "Admin on {{asset}}",
        "goal.pwn": "Code execution on {{asset}}",
        # scenarios
        "scenario.credential_compromise": "Credential Compromise",
        "scenario.lateral_movement": "Lateral Movement",
        "scenario.privilege_escalation": "Privilege Escalation",
        "scenario.sensitive_data_exposure": "Sensitive Data Exposure",
        "scenario.outdated_service_exploitation": "Outdated Service Exploitation",
        # finding titles (seed + catalog templates); custom findings keep the user's own title
        "vuln.custom": "{{title}}",
        "vuln.ssh_rce": "Outdated OpenSSH {{version}}: pre-auth remote code execution",
        "vuln.ssh_exposed": "SSH ({{port}}/tcp) on {{asset}} reachable from the internet",
        "vuln.weak_password": "{{principal}}: weak password, no MFA, Kerberoastable",
        "vuln.excessive_admin": "{{principal}} holds admin rights on {{asset}}",
        "vuln.print_spooler": "Print spooler local privilege escalation",
        "vuln.cached_admin": "{{principal}} admin credentials cached on an employee workstation",
        "vuln.tpl.outdated_ssh": "Outdated OpenSSH: pre-auth remote code execution",
        "vuln.tpl.rce_web": "Web application remote code execution",
        "vuln.tpl.rdp_exposed": "RDP exposed beyond the management zone",
        "vuln.tpl.local_privesc": "Kernel local privilege escalation",
        "vuln.tpl.weak_password": "Weak password without MFA",
        "vuln.tpl.excessive_perm": "Excessive permission on a sensitive asset",
        # change log of remediation actions
        "change.port_restricted": "{{asset}}:{{port}}/{{proto}} now only accepts traffic from {{zones}}",
        "change.port_closed_all": "{{asset}}:{{port}}/{{proto}} no longer accepts traffic from any zone",
        "change.rule_removed": "Removed firewall rule '{{rule}}' on {{firewall}}",
        "change.finding_resolved": "Resolved finding '{{vuln}}'",
        "change.mfa": "MFA enforced for '{{principal}}'",
        "change.password": "Password policy of '{{principal}}' set to {{policy}}",
        "change.software": "{{asset}}: {{software}} {{old}} → {{new}}",
        "change.patched": "Patched '{{vuln}}' ({{title}})",
        "change.permission": "Permission of '{{principal}}' on '{{asset}}' reduced to {{level}}",
        "change.segmented": "Zones {{a}} ↔ {{b}} segmented: only asset-specific allow rules may cross",
        # recommendations
        "action.restrict_port": "Restrict {{asset}} port {{port}} to {{zones}}",
        "action.enforce_mfa": "Enforce MFA for {{principal}}",
        "action.set_password_policy": "Require a {{policy}} password for {{principal}}",
        "action.apply_patch": "Patch {{vuln}}",
        "action.reduce_permission": "Reduce {{principal}} on {{asset}} to {{level}}",
        "action.segment_zones": "Segment {{a}} from {{b}}",
        "rec.addresses": "Addresses {{ids}}; what-if score {{before}} → {{after}}",
        "rec.boundary": "Attack paths cross this zone boundary; what-if score {{before}} → {{after}}",
        # notifications
        "event.simulation": "{{scenario}} finished on r{{rev}}: score {{score}}",
        "event.remediation": "{{count}} fixes applied → r{{rev}}: score {{before}} → {{after}}",
        "event.revert": "r{{reverted}} reverted → r{{rev}}",
        "event.demo_reset": "Demo environment restored",
        "rev.created": "Created",
        "rev.cloned": "Created from {{source}}",
        "rev.seed_demo": "Seed: Northwind Logistics demo",
        "rev.asset_added": "Added asset {{id}}",
        "rev.asset_edited": "Edited asset {{id}}",
        "rev.asset_deleted": "Deleted asset {{id}}",
        "rev.asset_deleted_deps": "Deleted asset {{id}} (+{{count}} dependent items)",
        "rev.connection_added": "Connected {{source}} → {{target}} ({{kind}})",
        "rev.connection_edited": "Edited connection {{id}}",
        "rev.connection_deleted": "Deleted connection {{id}}",
        "rev.principal_added": "Added identity {{id}}",
        "rev.principal_edited": "Edited identity {{id}}",
        "rev.principal_deleted": "Deleted identity {{id}}",
        "rev.rule_added": "Added firewall rule {{id}} on {{firewall}}",
        "rev.rule_edited": "Edited firewall rule {{id}}",
        "rev.rule_deleted": "Deleted firewall rule {{id}}",
        "rev.vuln_added": "Added finding {{id}}",
        "rev.vuln_edited": "Edited finding {{id}}",
        "rev.vuln_deleted": "Deleted finding {{id}}",
        "rev.remediation": "Remediation: {{actions}}",
        "rev.revert": "Revert r{{rev}} (restore r{{parent}})",
        "connkind.network": "network",
        "connkind.trust": "trust",
        "connkind.permission": "permission",
        # API errors (DomainError), labels used in them, plural forms
        "entity.asset": "Asset",
        "entity.connection": "Connection",
        "entity.principal": "Principal",
        "entity.rule": "Firewall rule",
        "entity.vuln": "Vulnerability",
        "entity.twin": "Twin",
        "entity.remediation": "Remediation",
        "entity.simulation": "Simulation",
        "entity.firewall": "Firewall",
        "assettype.internet_gateway": "internet gateway",
        "assettype.firewall": "firewall",
        "assettype.web_server": "web server",
        "assettype.app_server": "application server",
        "assettype.db_server": "database server",
        "assettype.identity_server": "identity server",
        "assettype.employee_ws": "employee workstation",
        "assettype.admin_ws": "admin workstation",
        "vulnkind.remote_service": "remote service",
        "vulnkind.weak_credential": "weak credential",
        "vulnkind.local_privesc": "local privilege escalation",
        "vulnkind.misconfig": "misconfiguration",
        "vulnkind.excessive_permission": "excessive permission",
        "vulnkind.outdated_software": "outdated software",
        "err.not_found": "{{kind}} '{{id}}' does not exist",
        "err.duplicate": "{{kind}} '{{id}}' already exists",
        "err.layout_unknown_one": "Unknown asset id in layout: {{ids}}",
        "err.layout_unknown_other": "Unknown asset ids in layout: {{ids}}",
        "err.vuln_needs_asset": "Create the asset first, then add vulnerabilities to it",
        "err.id_mismatch": "Body id '{{body}}' does not match path id '{{path}}'",
        "err.port_in_use": "Port {{port}} on '{{asset}}' is referenced by vulnerability '{{vuln}}'; delete or edit that vulnerability first",
        "err.connection_exists": "A {{kind}} connection between '{{source}}' and '{{target}}' already exists ('{{existing}}')",
        "err.connection_port_closed": "Neither '{{source}}' nor '{{target}}' has port {{port}} open; cannot create connection",
        "err.not_a_firewall": "Asset '{{id}}' is a {{type}}, not a firewall",
        "err.rule_port_closed": "Asset '{{asset}}' has no port {{port}} open; cannot create rule",
        "err.vuln_port_closed": "Asset '{{asset}}' has no port {{port}} open; cannot attach vulnerability",
        "err.port_requires_asset": "affected_port requires affected_asset",
        "err.scenario_params_one": "Scenario '{{scenario}}' does not accept parameter: {{names}}",
        "err.scenario_params_other": "Scenario '{{scenario}}' does not accept parameters: {{names}}",
        "err.no_foothold": "The twin has no asset that can serve as a foothold",
        "err.foothold_missing": "Foothold asset '{{id}}' does not exist in this revision",
        "err.foothold_internet": "The internet gateway cannot be used as a foothold",
        "err.foothold_privilege": "foothold_privilege must be 'user' or 'admin', got '{{value}}'",
        "err.mfa_already": "Principal '{{id}}' already has MFA enforced",
        "err.password_already": "Principal '{{id}}' already uses a {{policy}} password",
        "err.not_patchable": "Vulnerability '{{id}}' is a {{kind}} finding; it cannot be fixed by a patch",
        "err.no_permission": "Principal '{{id}}' has no permission on asset '{{asset}}' to reduce",
        "err.not_reduction": "'{{id}}' has {{current}} on '{{asset}}'; {{level}} is not a reduction",
        "err.segment_self": "Cannot segment a zone from itself",
        "err.already_segmented": "Zones {{a}} and {{b}} are already segmented",
        "err.duplicate_action": "Action '{{key}}' was given twice",
        "err.revision_missing": "Twin '{{twin}}' has no revision {{number}}",
        "err.stale_revision": "Twin '{{twin}}' is at revision {{head}}, not {{expected}}; reload and retry",
        "err.revision_id_missing": "Revision id {{id}} does not exist",
        "err.no_parent": "Revision r{{rev}} is the first revision; nothing to revert to",
        "event.remediation_one": "{{count}} fix applied → r{{rev}}: score {{before}} → {{after}}",
        "event.remediation_other": "{{count}} fixes applied → r{{rev}}: score {{before}} → {{after}}",
        "rev.asset_deleted_deps_one": "Deleted asset {{id}} (+{{count}} dependent item)",
        "rev.asset_deleted_deps_other": "Deleted asset {{id}} (+{{count}} dependent items)",
    },
    "tr": {
        "edge.reach.via": "{{origin}}, {{dst}} tcp/{{port}} ({{service}}) hedefine {{via}} üzerinden erişebiliyor",
        "edge.reach.direct": "{{origin}}, {{dst}} tcp/{{port}} ({{service}}) hedefine doğrudan bağlantıyla erişebiliyor",
        "edge.remote_exploit": "{{asset}}:{{port}} üzerinde {{vuln}} istismar edilerek {{privilege}} erişimi elde edilir{{edr}}",
        "edge.brute_force": "'{{principal}}' hesabının {{strength}} parolası {{asset}} {{service}}/{{port}} üzerinde tahmin edilir{{mfa}}",
        "edge.local_privesc": "{{asset}} üzerinde {{vuln}} ile yöneticiye yükselme{{edr}}",
        "edge.credential_theft": "{{asset}} üzerinden önbellekteki '{{principal}}' kimlik bilgileri dökülür{{edr}}",
        "edge.credential_use": "{{asset}} sistemine '{{principal}}' olarak oturum açılır ({{level}}){{mfa}}",
        "edge.data_access.cred": "{{asset}} üzerindeki veri, '{{principal}}' hesabının {{level}} yetkisiyle okunur{{mfa}}",
        "edge.data_access.admin": "{{asset}} üzerindeki yönetici verisini okur (hassasiyet {{sensitivity}})",
        "edge.domain_takeover.principal": "'{{principal}}' bir etki alanı yöneticisi{{mfa}}",
        "edge.domain_takeover.idp": "{{asset}} kimlik sunucusunda yönetici olmak etki alanını ele geçirmektir",
        "edge.kerberoast": "{{asset}} üzerinden '{{principal}}' için servis bileti istenir ve {{strength}} parolası çevrimdışı kırılır",
        "edge.trust_abuse": "{{source}} → {{target}} güven ilişkisi istismar edilir{{as}}",
        "edge.permission_abuse": "{{source}} üzerindeki kayıtlı kimlik bilgisiyle {{target}} hedefine ulaşılır",
        "note.edr": " (EDR mevcut)",
        "note.no_mfa": " (MFA yok)",
        "note.mfa_enabled": " (MFA etkin)",
        "note.mfa_challenge": ", MFA doğrulaması",
        "note.as_principal": " ('{{principal}}' olarak)",
        "word.internet": "internet",
        "priv.user": "kullanıcı",
        "priv.admin": "yönetici",
        "level.read": "okuma",
        "level.write": "yazma",
        "level.admin": "yönetici",
        "level.none": "erişim yok",
        "strength.weak": "zayıf",
        "strength.medium": "orta",
        "strength.strong": "güçlü",
        "zone.internet": "İnternet",
        "zone.dmz": "DMZ",
        "zone.internal": "İç ağ",
        "zone.data": "Veri",
        "zone.mgmt": "Yönetim",
        "goal.data": "{{asset}} üzerindeki hassas veri",
        "goal.cred": "{{principal}} kimlik bilgileri",
        "goal.domain_admin": "Etki alanı yöneticisi",
        "goal.idp_admin": "{{asset}} üzerinde yönetici",
        "goal.pwn": "{{asset}} üzerinde kod çalıştırma",
        "scenario.credential_compromise": "Kimlik Bilgisi Ele Geçirme",
        "scenario.lateral_movement": "Yanal Hareket",
        "scenario.privilege_escalation": "Yetki Yükseltme",
        "scenario.sensitive_data_exposure": "Hassas Veri İfşası",
        "scenario.outdated_service_exploitation": "Eski Servis İstismarı",
        "vuln.custom": "{{title}}",
        "vuln.ssh_rce": "Eski OpenSSH {{version}}: kimlik doğrulama öncesi uzaktan kod çalıştırma",
        "vuln.ssh_exposed": "{{asset}} üzerindeki SSH ({{port}}/tcp) internetten erişilebilir",
        "vuln.weak_password": "{{principal}}: zayıf parola, MFA yok, Kerberoasting'e açık",
        "vuln.excessive_admin": "{{principal}}, {{asset}} üzerinde yönetici yetkisine sahip",
        "vuln.print_spooler": "Yazdırma biriktiricisi yerel yetki yükseltme",
        "vuln.cached_admin": "{{principal}} yönetici kimlik bilgileri bir çalışan bilgisayarında önbellekte",
        "vuln.tpl.outdated_ssh": "Eski OpenSSH: kimlik doğrulama öncesi uzaktan kod çalıştırma",
        "vuln.tpl.rce_web": "Web uygulamasında uzaktan kod çalıştırma",
        "vuln.tpl.rdp_exposed": "RDP yönetim bölgesi dışına açık",
        "vuln.tpl.local_privesc": "Çekirdek yerel yetki yükseltme",
        "vuln.tpl.weak_password": "MFA olmadan zayıf parola",
        "vuln.tpl.excessive_perm": "Hassas varlıkta aşırı yetki",
        "change.port_restricted": "{{asset}}:{{port}}/{{proto}} artık yalnızca {{zones}} bölgesinden trafik kabul ediyor",
        "change.port_closed_all": "{{asset}}:{{port}}/{{proto}} artık hiçbir bölgeden trafik kabul etmiyor",
        "change.rule_removed": "{{firewall}} üzerindeki '{{rule}}' kuralı kaldırıldı",
        "change.finding_resolved": "'{{vuln}}' bulgusu giderildi",
        "change.mfa": "'{{principal}}' için MFA zorunlu kılındı",
        "change.password": "'{{principal}}' parola politikası {{policy}} olarak ayarlandı",
        "change.software": "{{asset}}: {{software}} {{old}} → {{new}}",
        "change.patched": "'{{vuln}}' yamalandı ({{title}})",
        "change.permission": "'{{principal}}' hesabının '{{asset}}' üzerindeki yetkisi {{level}} düzeyine indirildi",
        "change.segmented": "{{a}} ↔ {{b}} bölgeleri ayrıldı: yalnızca varlığa özel izin kuralları geçebilir",
        "action.restrict_port": "{{asset}} {{port}} portunu {{zones}} ile sınırla",
        "action.enforce_mfa": "{{principal}} için MFA zorunlu kıl",
        "action.set_password_policy": "{{principal}} için {{policy}} parola zorunlu kıl",
        "action.apply_patch": "{{vuln}} yamasını uygula",
        "action.reduce_permission": "{{principal}} yetkisini {{asset}} üzerinde {{level}} düzeyine indir",
        "action.segment_zones": "{{a}} ile {{b}} bölgelerini ayır",
        "rec.addresses": "Giderdiği: {{ids}}; ya-olursa skor {{before}} → {{after}}",
        "rec.boundary": "Saldırı yolları bu bölge sınırını geçiyor; ya-olursa skor {{before}} → {{after}}",
        "event.simulation": "{{scenario}} r{{rev}} üzerinde tamamlandı: skor {{score}}",
        "event.remediation": "{{count}} düzeltme uygulandı → r{{rev}}: skor {{before}} → {{after}}",
        "event.revert": "r{{reverted}} geri alındı → r{{rev}}",
        "event.demo_reset": "Demo ortamı geri yüklendi",
        "rev.created": "Oluşturuldu",
        "rev.cloned": "{{source}} kopyalanarak oluşturuldu",
        "rev.seed_demo": "Başlangıç: Northwind Logistics demosu",
        "rev.asset_added": "{{id}} varlığı eklendi",
        "rev.asset_edited": "{{id}} varlığı düzenlendi",
        "rev.asset_deleted": "{{id}} varlığı silindi",
        "rev.asset_deleted_deps": "{{id}} varlığı silindi (+{{count}} bağlı öğe)",
        "rev.connection_added": "{{source}} → {{target}} bağlandı ({{kind}})",
        "rev.connection_edited": "{{id}} bağlantısı düzenlendi",
        "rev.connection_deleted": "{{id}} bağlantısı silindi",
        "rev.principal_added": "{{id}} kimliği eklendi",
        "rev.principal_edited": "{{id}} kimliği düzenlendi",
        "rev.principal_deleted": "{{id}} kimliği silindi",
        "rev.rule_added": "{{firewall}} üzerinde {{id}} kuralı eklendi",
        "rev.rule_edited": "{{id}} kuralı düzenlendi",
        "rev.rule_deleted": "{{id}} kuralı silindi",
        "rev.vuln_added": "{{id}} bulgusu eklendi",
        "rev.vuln_edited": "{{id}} bulgusu düzenlendi",
        "rev.vuln_deleted": "{{id}} bulgusu silindi",
        "rev.remediation": "İyileştirme: {{actions}}",
        "rev.revert": "r{{rev}} geri alındı (r{{parent}} geri yüklendi)",
        "connkind.network": "ağ",
        "connkind.trust": "güven",
        "connkind.permission": "yetki",
        # API errors (DomainError), labels used in them, plural forms
        "entity.asset": "Varlık",
        "entity.connection": "Bağlantı",
        "entity.principal": "Kimlik",
        "entity.rule": "Güvenlik duvarı kuralı",
        "entity.vuln": "Bulgu",
        "entity.twin": "İkiz",
        "entity.remediation": "İyileştirme",
        "entity.simulation": "Simülasyon",
        "entity.firewall": "Güvenlik duvarı",
        "assettype.internet_gateway": "internet geçidi",
        "assettype.firewall": "güvenlik duvarı",
        "assettype.web_server": "web sunucusu",
        "assettype.app_server": "uygulama sunucusu",
        "assettype.db_server": "veritabanı sunucusu",
        "assettype.identity_server": "kimlik sunucusu",
        "assettype.employee_ws": "çalışan bilgisayarı",
        "assettype.admin_ws": "yönetici bilgisayarı",
        "vulnkind.remote_service": "uzak servis",
        "vulnkind.weak_credential": "zayıf kimlik bilgisi",
        "vulnkind.local_privesc": "yerel yetki yükseltme",
        "vulnkind.misconfig": "yanlış yapılandırma",
        "vulnkind.excessive_permission": "aşırı yetki",
        "vulnkind.outdated_software": "eski yazılım",
        "err.not_found": "{{kind}} '{{id}}' bulunamadı",
        "err.duplicate": "{{kind}} '{{id}}' zaten var",
        "err.layout_unknown": "Yerleşimde bilinmeyen varlık kimliği: {{ids}}",
        "err.vuln_needs_asset": "Önce varlığı oluşturun, ardından ona bulgu ekleyin",
        "err.id_mismatch": "Gövdedeki kimlik '{{body}}', yoldaki kimlik '{{path}}' ile eşleşmiyor",
        "err.port_in_use": "'{{asset}}' üzerindeki {{port}} portu '{{vuln}}' bulgusunda kullanılıyor; önce o bulguyu silin veya düzenleyin",
        "err.connection_exists": "'{{source}}' ile '{{target}}' arasında {{kind}} bağlantısı zaten var ('{{existing}}')",
        "err.connection_port_closed": "Ne '{{source}}' ne de '{{target}}' üzerinde {{port}} portu açık; bağlantı oluşturulamaz",
        "err.not_a_firewall": "'{{id}}' varlığı bir {{type}}, güvenlik duvarı değil",
        "err.rule_port_closed": "'{{asset}}' varlığında {{port}} portu açık değil; kural oluşturulamaz",
        "err.vuln_port_closed": "'{{asset}}' varlığında {{port}} portu açık değil; bulgu eklenemez",
        "err.port_requires_asset": "affected_port için affected_asset gerekir",
        "err.scenario_params": "'{{scenario}}' senaryosu şu parametreleri kabul etmiyor: {{names}}",
        "err.no_foothold": "İkizde başlangıç noktası olabilecek bir varlık yok",
        "err.foothold_missing": "Başlangıç varlığı '{{id}}' bu revizyonda yok",
        "err.foothold_internet": "İnternet geçidi başlangıç noktası olarak kullanılamaz",
        "err.foothold_privilege": "foothold_privilege 'user' veya 'admin' olmalı, gelen değer: '{{value}}'",
        "err.mfa_already": "'{{id}}' kimliği için MFA zaten zorunlu",
        "err.password_already": "'{{id}}' kimliği zaten {{policy}} parola kullanıyor",
        "err.not_patchable": "'{{id}}' bir {{kind}} bulgusu; yama ile giderilemez",
        "err.no_permission": "'{{id}}' kimliğinin '{{asset}}' varlığında azaltılacak bir yetkisi yok",
        "err.not_reduction": "'{{id}}', '{{asset}}' üzerinde {{current}} yetkisine sahip; {{level}} bir azaltma değil",
        "err.segment_self": "Bir bölge kendisinden ayrılamaz",
        "err.already_segmented": "{{a}} ve {{b}} bölgeleri zaten ayrılmış",
        "err.duplicate_action": "'{{key}}' eylemi iki kez verildi",
        "err.revision_missing": "'{{twin}}' ikizinde {{number}} numaralı revizyon yok",
        "err.stale_revision": "'{{twin}}' ikizi {{expected}} değil {{head}} revizyonunda; sayfayı yenileyip tekrar deneyin",
        "err.revision_id_missing": "{{id}} kimlikli revizyon yok",
        "err.no_parent": "r{{rev}} ilk revizyon; geri dönülecek bir revizyon yok",
    },
}

for _lang, _table in STORY.items():
    CATALOG[_lang].update(_table)
CATALOG["az"] = dict(AZ)  # engine catalog + narration in one table (app/i18n/az.py)

_PH = re.compile(r"\{\{\s*([A-Za-z0-9_]+)\s*\}\}")


def _param(value: MsgParam, lang: str) -> str:
    if isinstance(value, Message):
        return render(value, lang)
    if isinstance(value, list):
        return ", ".join(_param(v, lang) for v in value)
    if isinstance(value, float):
        return f"{value:g}"
    return str(value)


def plural_lookup(table: dict[str, str], code: str, count: object) -> str | None:
    """Same resolution as i18next: with a numeric ``count`` try ``code_one``/``code_other`` before ``code``.

    Also used by the AI fallback template, whose sentences live in their own table.
    """
    if isinstance(count, int | float) and not isinstance(count, bool):
        form = table.get(f"{code}_{'one' if count == 1 else 'other'}")
        if form is not None:
            return form
    return table.get(code)


def _lookup(table: dict[str, str], m: Message) -> str | None:
    return plural_lookup(table, m.code, m.params.get("count"))


def render(m: Message | None, lang: str = "en") -> str:
    """Render a message in ``lang`` (falls back to EN, then to the code itself)."""
    if m is None:
        return ""
    table = CATALOG.get(lang, CATALOG["en"])
    template = _lookup(table, m) or _lookup(CATALOG["en"], m) or m.code
    return _PH.sub(lambda g: _param(m.params[g.group(1)], lang) if g.group(1) in m.params else "", template)


def vuln_title(v: Vulnerability) -> Message:
    """Translatable title: the seed/catalog code when present, else the user's own title verbatim."""
    return v.title_i18n if v.title_i18n is not None else msg("vuln.custom", title=v.title)


def is_message(obj: object) -> bool:
    return isinstance(obj, dict) and set(obj) == {"code", "params"} and isinstance(obj.get("code"), str)


def localize(obj: Any, lang: str = "en") -> Any:
    """Replace every serialized {code, params} message in a JSON tree by its rendered text."""
    if is_message(obj):
        return render(Message.model_validate(obj), lang)
    if isinstance(obj, dict):
        return {k: localize(v, lang) for k, v in obj.items()}
    if isinstance(obj, list):
        return [localize(v, lang) for v in obj]
    return obj
