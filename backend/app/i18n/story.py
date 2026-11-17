"""Plain-language narration of attack-graph steps (replay narration card and event log).

Each ``story.<code>`` is the readable counterpart of an engine message ``<code>`` with the same parameters; the UI
renders ``story.<code>`` when it exists and falls back to ``<code>``. Nested messages follow the same rule (e.g.
``story.note.no_mfa``). The engine's own wording (step reasons, reports, AI fallback) is unchanged.
"""

from __future__ import annotations

STORY: dict[str, dict[str, str]] = {
    "en": {
        "story.edge.reach.via": "The attacker can connect from {{origin}} to {{dst}} on port {{port}} ({{service}}). "
        "The rules on {{via}} allow this traffic.",
        "story.edge.reach.direct": "The attacker can connect from {{origin}} to {{dst}} on port {{port}} ({{service}}) "
        "over a direct link, with no firewall in between.",
        "story.edge.remote_exploit": "The service on port {{port}} of {{asset}} has the flaw “{{vuln}}”. Exploiting it "
        "gives the attacker {{privilege}} access to {{asset}}{{edr}}.",
        "story.edge.brute_force": "'{{principal}}' has a {{strength}} password. The attacker guesses it through "
        "{{service}} on {{asset}} (port {{port}}){{mfa}}.",
        "story.edge.local_privesc": "With a foothold on {{asset}}, the attacker uses “{{vuln}}” to become admin there{{edr}}.",
        "story.edge.credential_theft": "As admin on {{asset}}, the attacker dumps the cached credentials of "
        "'{{principal}}'{{edr}}.",
        "story.edge.credential_use": "With the credentials of '{{principal}}', the attacker logs on to {{asset}} with "
        "{{level}} rights{{mfa}}.",
        "story.edge.data_access.cred": "'{{principal}}' has {{level}} rights on {{asset}}, so the attacker can read its "
        "data{{mfa}}.",
        "story.edge.data_access.admin": "As admin on {{asset}}, the attacker can read the data stored there "
        "(sensitivity {{sensitivity}} of 3).",
        "story.edge.domain_takeover.principal": "'{{principal}}' is a domain admin: whoever holds its credentials "
        "controls the whole domain{{mfa}}.",
        "story.edge.domain_takeover.idp": "Admin rights on the identity server {{asset}} mean control of the whole domain.",
        "story.edge.kerberoast": "Any domain account can request a service ticket for '{{principal}}' from {{asset}}. "
        "Its {{strength}} password is then cracked offline, which raises no alert on the network.",
        "story.edge.trust_abuse": "{{target}} trusts {{source}}, so the attacker moves on to {{target}}{{as}}.",
        "story.edge.permission_abuse": "A credential stored on {{source}} grants access to {{target}}, so the attacker "
        "moves on to {{target}}.",
        "story.note.edr": " (EDR on the host makes detection more likely)",
        "story.note.no_mfa": " (no MFA stands in the way)",
        "story.note.mfa_enabled": " (MFA is on, which lowers the odds)",
        "story.note.mfa_challenge": " (an MFA prompt lowers the odds)",
        "story.word.internet": "the internet",
    },
    "tr": {
        "story.edge.reach.via": "Saldırgan {{origin}} üzerinden {{dst}} sistemine {{port}} numaralı porttan "
        "({{service}}) bağlanabiliyor. {{via}} üzerindeki kurallar bu trafiğe izin veriyor.",
        "story.edge.reach.direct": "Saldırgan {{origin}} üzerinden {{dst}} sistemine {{port}} numaralı porttan "
        "({{service}}) doğrudan bağlanabiliyor; arada güvenlik duvarı yok.",
        "story.edge.remote_exploit": "{{asset}} üzerinde {{port}} numaralı porttaki serviste “{{vuln}}” açığı var. "
        "Saldırgan bu açığı istismar ederek {{asset}} üzerinde {{privilege}} erişimi kazanıyor{{edr}}.",
        "story.edge.brute_force": "'{{principal}}' hesabının parolası {{strength}}. Saldırgan bu parolayı {{asset}} "
        "üzerindeki {{service}} servisinden ({{port}} numaralı port) tahmin ediyor{{mfa}}.",
        "story.edge.local_privesc": "{{asset}} üzerinde dayanak noktası olan saldırgan, “{{vuln}}” açığıyla orada "
        "yönetici oluyor{{edr}}.",
        "story.edge.credential_theft": "{{asset}} üzerinde yönetici olan saldırgan, önbellekteki '{{principal}}' kimlik "
        "bilgilerini döküyor{{edr}}.",
        "story.edge.credential_use": "Saldırgan '{{principal}}' kimlik bilgileriyle {{asset}} sistemine {{level}} "
        "yetkisiyle oturum açıyor{{mfa}}.",
        "story.edge.data_access.cred": "'{{principal}}' hesabının {{asset}} üzerinde {{level}} yetkisi var; saldırgan "
        "bu yetkiyle verileri okuyabiliyor{{mfa}}.",
        "story.edge.data_access.admin": "{{asset}} üzerinde yönetici olan saldırgan, orada saklanan verileri "
        "okuyabiliyor (hassasiyet 3 üzerinden {{sensitivity}}).",
        "story.edge.domain_takeover.principal": "'{{principal}}' bir etki alanı yöneticisi: kimlik bilgilerini ele "
        "geçiren, etki alanının tamamını kontrol eder{{mfa}}.",
        "story.edge.domain_takeover.idp": "{{asset}} kimlik sunucusunda yönetici olmak, etki alanının tamamını kontrol "
        "etmek demektir.",
        "story.edge.kerberoast": "Etki alanındaki her hesap, {{asset}} üzerinden '{{principal}}' için servis bileti "
        "isteyebilir. Ardından {{strength}} parola çevrimdışı kırılır; ağda alarm oluşmaz.",
        "story.edge.trust_abuse": "{{target}}, {{source}} sistemine güveniyor; saldırgan bu güvenle {{target}} "
        "sistemine geçiyor{{as}}.",
        "story.edge.permission_abuse": "{{source}} üzerinde saklanan bir kimlik bilgisi {{target}} erişimi veriyor; "
        "saldırgan bununla {{target}} sistemine geçiyor.",
        "story.note.edr": " (sistemdeki EDR tespit olasılığını artırıyor)",
        "story.note.no_mfa": " (önünde MFA engeli yok)",
        "story.note.mfa_enabled": " (MFA açık; bu, olasılığı düşürüyor)",
        "story.note.mfa_challenge": " (MFA doğrulaması olasılığı düşürüyor)",
        "story.word.internet": "internet",
    },
}
