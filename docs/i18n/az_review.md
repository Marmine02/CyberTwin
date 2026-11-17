# Azerbaijani strings for review

Every Azerbaijani (az, Latin script) string next to its English source, grouped by where it appears.
Translated from English, not from Turkish. ⚠️ marks the strings I am least sure about; the reasons are listed
first. Placeholders such as `{{asset}}` are filled at run time (asset names, numbers). Plural forms: Azerbaijani
keeps the noun singular after a number, so `_one` and `_other` hold the same sentence.

Regenerate: `node` dump of the frontend resources to `logs/ui-strings.json`, then
`cd backend && .venv/Scripts/python scripts/az_review.py ../logs/ui-strings.json ../docs/i18n/az_review.md`.

## Least sure (please check first)

| Key | Azerbaijani | Why |
|---|---|---|
| `assetType.firewall` | Brandmauer | “Brandmauer” (common in AZ IT, from Russian). Alternatives: “şəbəkə ekranı”, or keep “firewall”. |
| `assets.tabRules` | Brandmauer qaydaları | Follows the “Brandmauer” choice. |
| `nav.vulnerabilities` | Zəifliklər | “Zəifliklər” for vulnerabilities/findings; “boşluqlar” is also used. |
| `nav.assistant` | Sİ köməkçisi | Abbreviation “Sİ” (süni intellekt). Spelled-out “Süni intellekt köməkçisi” is long for the nav. |
| `top.revision` | Versiya | “Versiya” for a model revision (TR uses “revizyon”, which would be a calque). |
| `top.readOnly` | yalnız baxış | “yalnız baxış” (view only) rather than a literal “yalnız oxumaq üçün”. |
| `state.warning` | Zəiflik var | “Zəiflik var” (has a weakness) for “Has findings”. |
| `scenario.lateral_movement` | Şəbəkə daxilində yayılma | “Şəbəkə daxilində yayılma”; a literal “yanal hərəkət” would be a Turkish calque. |
| `scenario.privilege_escalation` | İmtiyazların yüksəldilməsi | “İmtiyazların yüksəldilməsi”; “səlahiyyətlərin artırılması” is also seen. |
| `scenario.credential_compromise` | Giriş məlumatlarının ələ keçirilməsi | “Giriş məlumatları” for credentials throughout; “etimadnamələr” is rarer. |
| `phase.pivot` | Keçid | “Keçid” (transition) for the pivot phase. |
| `technique.credential_use` | Etibarlı hesabdan istifadə | “Etibarlı hesabdan istifadə” for ATT&CK “Valid Accounts”; “qanuni hesab” is possible. |
| `remType.apply_patch` | Yamaq | “Yamaq” for patch; some teams say “yeniləmə” or “patç”. |
| `remed.toggle` | Növbə ilə | “Növbə ilə” (one at a time) for the before/after toggle view. |
| `residual.title` | Qalıq risk | “Qalıq risk” for residual exposure. |
| `overview.blast` | Təsir radiusu | “Təsir radiusu” for blast radius. |
| `overview.hardening` | Aktivlərin möhkəmləndirilməsi | “Aktivlərin möhkəmləndirilməsi” for hardening. |
| `ux.narr.sidePath` | Yan qol | “Yan qol” (side branch) for events not on the main path. |
| `tour.wait3` | Tətbiq et gözlənilir… | Refers to the Apply button, whose label is “{{count}} düzəlişi tətbiq et”. |
| `common.errorTitle` | Alınmadı | “Alınmadı” (it did not work), short and neutral. |
| `ai.check.unplaced` | Hərfi yazılmış rəqəmlər (məlumatla üst-üstə düşür, mənası yoxlanıla bilmir) | Long technical sentence; please check that it reads naturally. |
| `story.edge.kerberoast` | Domendəki istənilən hesab {{asset}} üzərindən '{{principal}}' üçün servis bileti istəyə bilər. Sonra {{strength}} parol oflayn sındırılır və şəbəkədə heç bir xəbərdarlıq yaranmır. | Technical narration: “servis bileti”, “oflayn sındırılır”. |
| `story.edge.trust_abuse` | {{target}} {{source}} sisteminə etibar edir, buna görə hücumçu {{target}} sisteminə keçir{{as}}. | Word order with two asset names: “{{target}} {{source}} sisteminə etibar edir”. |
| `edge.reach.via` | {{origin}} {{via}} vasitəsilə {{dst}} tcp/{{port}} ({{service}}) ünvanına çata bilir | Engine sentence used in tables and reports; word order “{{origin}} {{via}} vasitəsilə …”. |
| `vuln.weak_password` | {{principal}}: zəif parol, MFA yoxdur, Kerberoasting-ə həssasdır | “Kerberoasting-ə həssasdır”: the hyphenated case ending on an English term. |
| `err.not_a_firewall` | '{{id}}' aktivi brandmauer deyil, {{type}} növündədir | “{{type}} növündədir” with an engine label such as “veb-server”. |

# User interface (frontend)

## Navigation

| Key | English | Azerbaijani |
|---|---|---|
| `nav.label` | Main navigation | Əsas naviqasiya |
| `nav.overview` | Overview | İcmal |
| `nav.map` | Network Map | Şəbəkə xəritəsi |
| `nav.assets` | Assets | Aktivlər |
| `nav.simulate` | Attack Simulation | Hücum simulyasiyası |
| `nav.vulnerabilities` ⚠️ | Vulnerabilities | Zəifliklər |
| `nav.assistant` ⚠️ | AI Assistant | Sİ köməkçisi |
| `nav.remediation` | Remediation | Düzəlişlər |
| `nav.reports` | Reports | Hesabatlar |

## Top bar

| Key | English | Azerbaijani |
|---|---|---|
| `top.subtitle` | Digital twin security lab | Rəqəmsal əkiz təhlükəsizlik laboratoriyası |
| `top.simBadge` | Simulation only: virtual model | Yalnız simulyasiya: virtual model |
| `top.simBadgeHint` | Every result is computed on a stored virtual model. Nothing is scanned or monitored. | Bütün nəticələr saxlanmış virtual model üzərində hesablanır. Heç nə skan edilmir və izlənmir. |
| `top.revision` ⚠️ | Revision | Versiya |
| `top.head` | latest | ən son |
| `top.readOnly` ⚠️ | read-only | yalnız baxış |
| `top.notifications_one` | Notifications, {{count}} unread | Bildirişlər, {{count}} oxunmamış |
| `top.notifications_other` | Notifications, {{count}} unread | Bildirişlər, {{count}} oxunmamış |
| `top.notificationsTitle` | Notifications | Bildirişlər |
| `top.noNotifications` | No simulation or remediation events yet. | Hələ simulyasiya və ya düzəliş hadisəsi yoxdur. |
| `top.resetDemo` | Reset demo | Demonu sıfırla |
| `top.resetTitle` | Reset the Northwind demo? | Northwind demosu sıfırlansın? |
| `top.resetBody` | All revisions, simulations and applied fixes of the Northwind Logistics twin are deleted and the original model is restored. | Northwind Logistics əkizinin bütün versiyaları, simulyasiyaları və tətbiq edilmiş düzəlişləri silinir, ilkin model bərpa olunur. |
| `top.resetConfirm` | Reset demo | Demonu sıfırla |
| `top.resetDone` | Demo restored to its original state | Demo ilkin vəziyyətinə qaytarıldı |
| `top.resetDoneBody` | Back at r1 with no runs. Start with a simulation. | Heç bir icra olmadan yenidən r1-dəsiniz. Simulyasiya ilə başlayın. |
| `top.resetNext` | Go to Attack Simulation | Hücum simulyasiyasına keç |
| `top.language` | Language | Dil |

## Top bar: help menu

| Key | English | Azerbaijani |
|---|---|---|
| `help.menu` | Help | Kömək |
| `help.tour` | Guided demo | Bələdçili demo |
| `help.tourHint` | Five short steps: the twin, a simulation, the replay, fixes, before and after. | Beş qısa addım: əkiz, simulyasiya, təkrar, düzəlişlər, əvvəl və sonra. |

## Guided demo

| Key | English | Azerbaijani |
|---|---|---|
| `tour.progress` | Guided demo · {{n}} of {{total}} | Bələdçili demo · {{n}} / {{total}} |
| `tour.skip` | Skip the tour | Turu keç |
| `tour.next` | Next | Növbəti |
| `tour.finish` | Finish | Bitir |
| `tour.wait1` | waiting for the run… | icra gözlənilir… |
| `tour.wait2` | waiting for the replay… | təkrar gözlənilir… |
| `tour.wait3` ⚠️ | waiting for Apply… | Tətbiq et gözlənilir… |
| `tour.s0.title` | This is the digital twin | Bu, rəqəmsal əkizdir |
| `tour.s0.body` | A virtual copy of Northwind Logistics: 9 assets, their network links, accounts and known flaws. Everything you do here runs on this model, never on real systems. | Northwind Logistics-in virtual surəti: 9 aktiv, onların şəbəkə bağlantıları, hesabları və məlum zəiflikləri. Burada etdiyiniz hər şey real sistemlərdə deyil, bu model üzərində icra olunur. |
| `tour.s1.title` | Run an attack scenario | Hücum ssenarisini işə salın |
| `tour.s1.body` | Choose Sensitive Data Exposure and press Run simulation. The engine finds every way an attacker on the internet can reach the customer data. | Həssas məlumatların ifşası ssenarisini seçin və Simulyasiyanı işə sal düyməsini basın. Mühərrik internetdəki hücumçunun müştəri məlumatlarına çata biləcəyi bütün yolları tapır. |
| `tour.s2.title` | Watch the replay | Təkrarı izləyin |
| `tour.s2.body` | Each step lights up on the map, and this card explains who moves where and why the model allows it. Click a line in the event log to jump to that step. | Hər addım xəritədə işıqlanır, bu kart isə kimin haraya keçdiyini və modelin buna niyə imkan verdiyini izah edir. Həmin addıma keçmək üçün hadisələr jurnalında sətrə klikləyin. |
| `tour.s3.title` | Apply the recommended fixes | Tövsiyə olunan düzəlişləri tətbiq edin |
| `tour.s3.body` | Select top 3 picks the fixes that raise the score most. Apply them: CyberTwin saves a new revision and runs the scenario again. | İlk 3-ü seç balı ən çox artıran düzəlişləri seçir. Onları tətbiq edin: CyberTwin yeni versiya yadda saxlayır və ssenarini yenidən işə salır. |
| `tour.s4.title` | Compare before and after | Əvvəl və sonranı müqayisə edin |
| `tour.s4.body` | Score, blocked paths and risk per asset, side by side. Revert undoes the fixes; Reset demo in the top bar starts over. You can replay this tour from the help menu. | Bal, bağlanmış yollar və aktivlər üzrə risk yan-yana. Geri qaytar düzəlişləri ləğv edir; yuxarı paneldəki Demonu sıfırla hər şeyi yenidən başladır. Bu turu kömək menyusundan yenidən aça bilərsiniz. |

## Shared (buttons, errors)

| Key | English | Azerbaijani |
|---|---|---|
| `common.loading` | Loading… | Yüklənir… |
| `common.errNetwork` | Cannot reach the CyberTwin API ({{detail}}) | CyberTwin API-yə qoşulmaq mümkün olmadı ({{detail}}) |
| `common.errTimeout` | {{request}} did not answer within {{seconds}}s | {{request}} {{seconds}} saniyə ərzində cavab vermədi |
| `common.errHttp` | {{request}} returned HTTP {{status}} | {{request}} HTTP {{status}} qaytardı |
| `common.errorTitle` ⚠️ | That didn't work | Alınmadı |
| `common.retry` | Retry | Yenidən cəhd et |
| `common.close` | Close | Bağla |
| `common.cancel` | Cancel | Ləğv et |
| `common.save` | Save | Yadda saxla |
| `common.delete` | Delete | Sil |
| `common.remove` | Remove | Çıxar |
| `common.yes` | Yes | Bəli |
| `common.no` | No | Xeyr |
| `common.none` | none | yoxdur |
| `common.actions` | Actions | Əməliyyatlar |
| `common.editItem` | Edit {{name}} | {{name}}: redaktə et |
| `common.deleteItem` | Delete {{name}} | {{name}}: sil |
| `common.newRevision` | Saved as revision r{{n}}. | r{{n}} versiyası kimi yadda saxlanıldı. |
| `common.skipToContent` | Skip to content | Məzmuna keç |

## Forms: validation

| Key | English | Azerbaijani |
|---|---|---|
| `validation.required` | Required. | Mütləqdir. |
| `validation.id` | Use 1–63 lowercase letters, digits, dots, dashes or underscores, starting with a letter or digit. | Hərf və ya rəqəmlə başlayan, 1–63 kiçik hərf, rəqəm, nöqtə, defis və ya alt xəttdən istifadə edin. |
| `validation.idTaken` | This id is already used in this twin. | Bu identifikator bu əkizdə artıq istifadə olunur. |
| `validation.ip` | Enter an IPv4 address such as 10.0.2.15. | 10.0.2.15 kimi IPv4 ünvanı daxil edin. |
| `validation.port` | Port must be a whole number between 1 and 65535. | Port 1 ilə 65535 arasında tam ədəd olmalıdır. |
| `validation.portDup` | This port and protocol are already listed. | Bu port və protokol artıq siyahıdadır. |
| `validation.version` | Use letters, digits and . _ + : ~ - only (e.g. 1.18.0). | Yalnız hərf, rəqəm və . _ + : ~ - işarələrindən istifadə edin (məs. 1.18.0). |
| `validation.cidr` | Enter a CIDR such as 10.0.0.0/24 or 0.0.0.0/0. | 10.0.0.0/24 və ya 0.0.0.0/0 kimi CIDR daxil edin. |

## Overview

| Key | English | Azerbaijani |
|---|---|---|
| `overview.topology` | Digital twin | Rəqəmsal əkiz |
| `overview.findings` | Critical findings | Kritik zəifliklər |
| `overview.posture` | Security posture | Təhlükəsizlik vəziyyəti |
| `overview.blast` ⚠️ | Blast radius | Təsir radiusu |
| `overview.bySeverity` | Findings by severity | Ciddiliyə görə zəifliklər |
| `overview.coverage` | Scenario coverage | Ssenari əhatəsi |
| `overview.hardening` ⚠️ | Asset hardening | Aktivlərin möhkəmləndirilməsi |
| `overview.aiBrief` | AI brief | Sİ xülasəsi |
| `overview.startTitle` | Start here | Buradan başlayın |
| `overview.startBody` | This is a virtual copy of the Northwind Logistics network. Nothing has been simulated on it yet. | Bu, Northwind Logistics şəbəkəsinin virtual surətidir. Onun üzərində hələ heç bir simulyasiya aparılmayıb. |
| `overview.start1` | Run an attack scenario: the engine finds every path from the internet to the sensitive data. | Hücum ssenarisini işə salın: mühərrik internetdən həssas məlumatlara gedən bütün yolları tapır. |
| `overview.start2` | Watch the replay step by step and see which flaws make each step possible. | Təkrarı addım-addım izləyin və hər addımı hansı zəifliklərin mümkün etdiyini görün. |
| `overview.start3` | Apply the recommended fixes and compare the score before and after. | Tövsiyə olunan düzəlişləri tətbiq edin və balı əvvəl və sonra müqayisə edin. |
| `overview.noSim` | No simulations yet. Run your first scenario. | Hələ simulyasiya yoxdur. İlk ssenarinizi işə salın. |
| `overview.runFirst` | Run Sensitive Data Exposure | Həssas məlumatların ifşasını işə sal |
| `overview.noFindings` | No findings lie on an attack path in this run. | Bu icrada heç bir zəiflik hücum yolunda deyil. |
| `overview.simAt` | simulated {{time}} | simulyasiya: {{time}} |
| `overview.postureChart` | Score across simulation runs | Simulyasiya icraları üzrə bal |
| `overview.postureOne` | One run so far. Apply a fix or edit the model, then run again to see the trend. | Hələlik bir icra var. Düzəliş tətbiq edin və ya modeli dəyişin, sonra dinamikanı görmək üçün yenidən işə salın. |
| `overview.postureCaption_one` | {{scenario}} score across {{count}} run and revisions | {{scenario}}: {{count}} icra və versiyalar üzrə bal |
| `overview.postureCaption_other` | {{scenario}} score across {{count}} runs and revisions | {{scenario}}: {{count}} icra və versiyalar üzrə bal |
| `overview.blastLabel` | assets can be compromised | aktiv ələ keçirilə bilər |
| `overview.reachableLabel_one` | {{count}} asset is network-reachable by the attacker | {{count}} aktiv hücumçu üçün şəbəkədən əlçatandır |
| `overview.reachableLabel_other` | {{count}} assets are network-reachable by the attacker | {{count}} aktiv hücumçu üçün şəbəkədən əlçatandır |
| `overview.notRun` | not run | icra olunmayıb |
| `overview.runScenario` | Run {{scenario}} | {{scenario}}: işə sal |
| `overview.hardeningTip` | {{passed}} of {{total}} checks pass (MFA, EDR, disk encryption, supported software, no internet exposure) | {{total}} yoxlamadan {{passed}} keçir (MFA, EDR, disk şifrələnməsi, dəstəklənən proqram təminatı, internetə açıq olmamaq) |
| `overview.openAssistant` | Open assistant | Köməkçini aç |

## Network map

| Key | English | Azerbaijani |
|---|---|---|
| `map.ariaLabel` | Digital twin topology | Rəqəmsal əkizin topologiyası |
| `map.title` | Network map | Şəbəkə xəritəsi |
| `map.zoneFilter` | Filter by zone | Zonaya görə süzgəc |
| `map.allZones` | All | Hamısı |
| `map.overlay` | Show latest simulation | Son simulyasiyanı göstər |
| `map.readOnly` | Viewing an older revision: editing is off | Köhnə versiyaya baxırsınız: redaktə bağlıdır |
| `map.hint` | Drag nodes to arrange them. Drag from a node's lower handle to another node to connect them. Click a link to edit or delete it. | Düyünləri yerləşdirmək üçün sürüşdürün. Birləşdirmək üçün düyünün aşağı tutacağından digər düyünə çəkin. Redaktə etmək və ya silmək üçün bağlantıya klikləyin. |
| `map.hintReadOnly` | Switch to the latest revision to edit the map. | Xəritəni redaktə etmək üçün ən son versiyaya keçin. |
| `map.layoutFailed` | Layout not saved | Yerləşmə yadda saxlanılmadı |
| `map.attackPath` | Attack path | Hücum yolu |
| `map.editAsset` | Edit this asset in Asset Management | Bu aktivi Aktivlər bölməsində redaktə et |
| `map.connectTitle` | Create connection | Bağlantı yarat |
| `map.connectBody` | Connect {{source}} to {{target}}. The engine re-evaluates reachability on the next run. | {{source}} ilə {{target}} birləşdirilsin. Mühərrik növbəti icrada əlçatanlığı yenidən hesablayır. |
| `map.kind` | Kind | Növ |
| `map.ports` | Allowed ports | İcazə verilən portlar |
| `map.portsHint` | Leave all unchecked to allow any port over this link. | Bu bağlantı üzərindən istənilən porta icazə vermək üçün heç birini seçməyin. |
| `map.noPorts` | Neither asset has open ports. | Aktivlərin heç birində açıq port yoxdur. |
| `map.description` | Description | Təsvir |
| `map.createConnection` | Create connection | Bağlantı yarat |
| `map.connected` | Connected {{source}} → {{target}} | {{source}} → {{target}} birləşdirildi |
| `map.duplicate` | This connection already exists as {{id}}. | Bu bağlantı artıq {{id}} kimi mövcuddur. |

## Assets

| Key | English | Azerbaijani |
|---|---|---|
| `assets.title` | Assets | Aktivlər |
| `assets.tabAssets` | Assets | Aktivlər |
| `assets.tabConnections` | Connections | Bağlantılar |
| `assets.tabPrincipals` | Identities | Hesablar |
| `assets.tabRules` ⚠️ | Firewall rules | Brandmauer qaydaları |
| `assets.readOnly` | You are viewing an older revision. Switch to the latest revision to make changes. | Köhnə versiyaya baxırsınız. Dəyişiklik etmək üçün ən son versiyaya keçin. |
| `assets.search` | Search name, id, IP or OS | Ad, identifikator, IP və ya ƏS üzrə axtar |
| `assets.filterType` | Filter by type | Növə görə süzgəc |
| `assets.allTypes` | All types | Bütün növlər |
| `assets.new` | New asset | Yeni aktiv |
| `assets.editTitle` | Edit {{name}} | {{name}}: redaktə |
| `assets.created` | {{name}} created | {{name}} yaradıldı |
| `assets.updated` | {{name}} updated | {{name}} yeniləndi |
| `assets.deleted` | {{name}} deleted | {{name}} silindi |
| `assets.noMatch` | No assets match | Uyğun aktiv yoxdur |
| `assets.noMatchBody` | Clear the search or pick another type. | Axtarışı təmizləyin və ya başqa növ seçin. |
| `assets.id` | ID | ID |
| `assets.idHint` | Permanent; used in paths and reports. | Dəyişməzdir; yollarda və hesabatlarda istifadə olunur. |
| `assets.name` | Name | Ad |
| `assets.type` | Type | Növ |
| `assets.zone` | Zone | Zona |
| `assets.ip` | IP address | IP ünvanı |
| `assets.os` | Operating system | Əməliyyat sistemi |
| `assets.criticality` | Criticality | Kritiklik |
| `assets.sensitivity` | Data sensitivity | Məlumatın həssaslığı |
| `assets.risk` | Risk | Risk |
| `assets.riskNotComputed` | run a simulation | simulyasiyanı işə salın |
| `assets.ports` | Open ports | Açıq portlar |
| `assets.port` | Port | Port |
| `assets.proto` | Protocol | Protokol |
| `assets.service` | Service | Servis |
| `assets.version` | Version | Versiya |
| `assets.exposedTo` | Reachable from zones | Hansı zonalardan əlçatandır |
| `assets.exposedToPh` | zones, e.g. mgmt,internal (empty = any) | zonalar, məs. mgmt,internal (boş = istənilən) |
| `assets.addPort` | Add port | Port əlavə et |
| `assets.noPorts` | No open ports. | Açıq port yoxdur. |
| `assets.anyZone` | any zone | istənilən zona |
| `assets.software` | Software | Proqram təminatı |
| `assets.swName` | Name | Ad |
| `assets.addSoftware` | Add software | Proqram əlavə et |
| `assets.eol` | End of life | Dəstəyi bitib |
| `assets.security` | Security configuration | Təhlükəsizlik konfiqurasiyası |
| `assets.mfa` | MFA | MFA |
| `assets.edr` | EDR | EDR |
| `assets.diskEnc` | Disk encryption | Disk şifrələnməsi |
| `assets.pwPolicy` | Password policy | Parol siyasəti |
| `assets.sc.mfa_enabled` | MFA enabled | MFA aktivdir |
| `assets.sc.edr` | EDR installed | EDR quraşdırılıb |
| `assets.sc.disk_encryption` | Disk encryption | Disk şifrələnməsi |
| `assets.vulns` | Findings | Zəifliklər |
| `assets.noVulns` | No findings recorded. | Qeydə alınmış zəiflik yoxdur. |
| `assets.connections` | Connections | Bağlantılar |
| `assets.identities` | Identities | Hesablar |
| `assets.cachedHere` | credentials cached here | giriş məlumatları burada keşdədir |
| `assets.deleteTitle` | Delete {{name}}? | {{name}} silinsin? |
| `assets.deleteBody` | This creates a new revision without the asset. These dependent items are removed with it: | Bu, aktiv olmadan yeni versiya yaradır. Ondan asılı aşağıdakı elementlər də silinir: |
| `assets.deleteConfirm` | Delete asset | Aktivi sil |
| `assets.impact.connections` | Connections | Bağlantılar |
| `assets.impact.firewall_rules` | Firewall rules | Brandmauer qaydaları |
| `assets.impact.vulnerabilities` | Findings | Zəifliklər |
| `assets.impact.principals` | Identity permissions | Hesab icazələri |

## Assets: connections

| Key | English | Azerbaijani |
|---|---|---|
| `conn.none` | No connections | Bağlantı yoxdur |
| `conn.noneBody` | Connect two assets on the Network Map by dragging between them. | Şəbəkə xəritəsində iki aktivi aralarında sürüşdürərək birləşdirin. |
| `conn.explain` | Network links carry traffic (optionally restricted to ports); trust and permission links model tokens and stored credentials. | Şəbəkə bağlantıları trafik daşıyır (istəyə görə portlarla məhdudlaşdırılır); etibar və icazə bağlantıları tokenləri və saxlanmış giriş məlumatlarını modelləşdirir. |
| `conn.endpoints` | Endpoints | Uc nöqtələr |
| `conn.editTitle` | Edit connection {{id}} | {{id}} bağlantısını redaktə et |
| `conn.saved` | Connection {{id}} saved | {{id}} bağlantısı yadda saxlanıldı |
| `conn.deleted` | Connection {{id}} deleted | {{id}} bağlantısı silindi |
| `conn.delete` | Delete connection | Bağlantını sil |
| `conn.deleteTitle` | Delete connection {{id}}? | {{id}} bağlantısı silinsin? |
| `conn.deleteBody` | {{source}} and {{target}} will no longer be linked in a new revision. Routes that used this link disappear on the next run. | Yeni versiyada {{source}} və {{target}} artıq bağlı olmayacaq. Bu bağlantıdan keçən marşrutlar növbəti icrada yox olur. |
| `conn.principal` | Token / keytab of | Kimin tokeni / keytab-ı |

## Assets: identities

| Key | English | Azerbaijani |
|---|---|---|
| `principals.new` | New identity | Yeni hesab |
| `principals.name` | Name | Ad |
| `principals.kindLabel` | Kind | Növ |
| `principals.kind.user` | user | istifadəçi |
| `principals.kind.service` | service account | servis hesabı |
| `principals.privilege` | Privilege | İmtiyaz |
| `principals.credential` | Password | Parol |
| `principals.mfa` | MFA | MFA |
| `principals.loggedOn` | Credentials cached on | Giriş məlumatlarının keşdə olduğu yer |
| `principals.permissions` | Permissions | İcazələr |
| `principals.access` | Access per asset | Aktivlər üzrə giriş |
| `principals.permOn` | Permission on {{asset}} | {{asset}} üzərində icazə |
| `principals.cached` | cached | keşdə |
| `principals.saved` | Identity saved | Hesab yadda saxlanıldı |
| `principals.deleted` | Identity deleted | Hesab silindi |
| `principals.deleteTitle` | Delete {{name}}? | {{name}} silinsin? |
| `principals.deleteBody` | Findings tied to this identity are deleted too. This creates a new revision. | Bu hesaba bağlı zəifliklər də silinir. Bu, yeni versiya yaradır. |

## Assets: firewall rules

| Key | English | Azerbaijani |
|---|---|---|
| `rules.explain` | Rules are evaluated top to bottom per firewall; the first match wins. No match means deny. | Hər brandmauerdə qaydalar yuxarıdan aşağıya yoxlanılır; ilk uyğun gələn qayda tətbiq olunur. Uyğunluq yoxdursa, trafik bloklanır. |
| `rules.new` | New rule | Yeni qayda |
| `rules.firewall` | Firewall | Brandmauer |
| `rules.order` | Order | Sıra |
| `rules.source` | Source | Mənbə |
| `rules.sourceKind` | Source kind | Mənbənin növü |
| `rules.destination` | Destination | Təyinat |
| `rules.destKind` | Destination kind | Təyinatın növü |
| `rules.port` | Port | Port |
| `rules.portHint` | Leave empty for any port. | İstənilən port üçün boş saxlayın. |
| `rules.action` | Action | Əməl |
| `rules.description` | Description | Təsvir |
| `rules.allow` | allow | icazə ver |
| `rules.deny` | deny | blokla |
| `rules.any` | any | istənilən |
| `rules.zone` | Zone | Zona |
| `rules.asset` | Asset | Aktiv |
| `rules.saved` | Rule saved | Qayda yadda saxlanıldı |
| `rules.deleted` | Rule deleted | Qayda silindi |
| `rules.deleteTitle` | Delete rule {{id}}? | {{id}} qaydası silinsin? |
| `rules.deleteBody` | Traffic this rule allowed or blocked falls through to the next rule. This creates a new revision. | Bu qaydanın icazə verdiyi və ya blokladığı trafik növbəti qaydaya keçir. Bu, yeni versiya yaradır. |
| `rules.noFirewalls` | No firewalls in this twin | Bu əkizdə brandmauer yoxdur |
| `rules.noFirewallsBody` | Add an asset of type Firewall first. | Əvvəlcə Brandmauer növündə aktiv əlavə edin. |

## Attack simulation

| Key | English | Azerbaijani |
|---|---|---|
| `sim.chooseScenario` | Choose a scenario | Ssenari seçin |
| `sim.compromised` | Compromised assets | Ələ keçirilmiş aktivlər |
| `sim.score` | Security score | Təhlükəsizlik balı |
| `sim.noResult` | No result yet | Hələ nəticə yoxdur |
| `sim.map` | Attack replay | Hücumun təkrarı |
| `sim.stale` | These results are from r{{rev}}; the twin is now at r{{head}}. Run again to update. | Bu nəticələr r{{rev}} versiyasına aiddir; əkiz artıq r{{head}} versiyasındadır. Yeniləmək üçün yenidən işə salın. |
| `sim.emptyTitle` | No simulations yet | Hələ simulyasiya yoxdur |
| `sim.emptyBody` | Pick a scenario above and select Run simulation. | Yuxarıda ssenari seçin və Simulyasiyanı işə sal düyməsini basın. |
| `sim.actions` | Actions | Əməliyyatlar |
| `sim.runOn` | Run on revision | Hansı versiyada işə salınsın |
| `sim.runOnHint` | Results are stored per revision; older revisions stay read-only. | Nəticələr hər versiya üçün ayrıca saxlanılır; köhnə versiyalar yalnız baxış üçündür. |
| `sim.latestRevision` | Latest (r{{n}}) | Ən son (r{{n}}) |
| `sim.foothold` | Foothold | Dayaq nöqtəsi |
| `sim.footholdHint` | The asset the attacker already controls (user level). | Hücumçunun artıq nəzarət etdiyi aktiv (istifadəçi səviyyəsində). |
| `sim.footholdDefault` | Default: first employee workstation | Standart: ilk işçi kompüteri |
| `sim.run` | Run simulation | Simulyasiyanı işə sal |
| `sim.analyze` | Analyze with AI | Sİ ilə təhlil et |
| `sim.openRemediation` | Open remediation | Düzəlişləri aç |
| `sim.ranAt` | Ran {{time}} | İcra vaxtı: {{time}} |
| `sim.filter` | Filter by asset type | Aktiv növünə görə süzgəc |
| `sim.showAll` | Show all | Hamısını göstər |
| `sim.replay` | Replay timeline | Təkrarın zaman şkalası |
| `sim.play` | Play | Oynat |
| `sim.pause` | Pause | Fasilə |
| `sim.stepBack` | Step back | Bir addım geri |
| `sim.stepForward` | Step forward | Bir addım irəli |
| `sim.speed` | Playback speed | Oynatma sürəti |
| `sim.scrubber` | Timeline position | Zaman şkalasında mövqe |
| `sim.eventLog` | Event log | Hadisələr jurnalı |
| `sim.paths` | Attack paths ({{n}}) | Hücum yolları ({{n}}) |
| `sim.noPaths` | No attack path reaches a goal | Heç bir hücum yolu hədəfə çatmır |
| `sim.noPathsBody` | In this revision of the model the scenario's goals are unreachable. | Modelin bu versiyasında ssenarinin hədəfləri əlçatan deyil. |
| `sim.likelihood` | likelihood | ehtimal |
| `sim.risk` | risk | risk |
| `sim.step` | Step | Addım |
| `sim.fromTo` | From → to | Haradan → haraya |
| `sim.technique` | Technique | Texnika |
| `sim.reason` | Why this step is possible | Bu addım niyə mümkündür |
| `sim.finishedTitle` | Simulation finished | Simulyasiya başa çatdı |
| `sim.finishedBody_one` | {{scenario}}: score {{score}}, {{count}} path. | {{scenario}}: bal {{score}}, {{count}} yol. |
| `sim.finishedBody_other` | {{scenario}}: score {{score}}, {{count}} paths. | {{scenario}}: bal {{score}}, {{count}} yol. |
| `sim.inspect` | Inspect results | Nəticələrə bax |
| `sim.failed` | Simulation failed | Simulyasiya alınmadı |

## Attack simulation: replay, narration, toasts

| Key | English | Azerbaijani |
|---|---|---|
| `ux.isLatest` | latest | ən son |
| `ux.latestIs` | latest is {{head}} | ən son versiya: {{head}} |
| `ux.runOnHead` | Run on r{{head}} | r{{head}} üzərində işə sal |
| `ux.running` | Running… | İcra olunur… |
| `ux.replayAgain` | Replay | Yenidən oynat |
| `ux.revKind.seed` | original model | ilkin model |
| `ux.revKind.edit` | edited model | redaktə edilmiş model |
| `ux.revKind.remediation` | after fixes | düzəlişlərdən sonra |
| `ux.revKind.revert` | reverted | geri qaytarılmış |
| `ux.defaultedNote` | Showing the latest run that found attack paths (r{{rev}}). The newest run, on r{{newRev}}, found none. | Hücum yolu tapan son icra göstərilir (r{{rev}}). Ən yeni icra (r{{newRev}}) heç bir yol tapmadı. |
| `ux.showNewest` | Show the newest run | Ən yeni icranı göstər |
| `ux.noPath.title` | No attack path reaches the goal | Heç bir hücum yolu hədəfə çatmır |
| `ux.noPath.fixed` | This revision blocks every path to the goal. The fixes were applied in r{{rev}}. | Bu versiya hədəfə gedən bütün yolları bağlayır. Düzəlişlər r{{rev}} versiyasında tətbiq edilib. |
| `ux.noPath.generic` | On r{{rev}} the attacker cannot reach the goal of this scenario. | r{{rev}} versiyasında hücumçu bu ssenarinin hədəfinə çata bilmir. |
| `ux.noPath.runBefore` | Run on r{{rev}} (before fixes) | r{{rev}} üzərində işə sal (düzəlişlərdən əvvəl) |
| `ux.noPath.runOn` | Run on r{{rev}} | r{{rev}} üzərində işə sal |
| `ux.noPath.compare` | Compare r{{a}} vs r{{b}} | r{{a}} ilə r{{b}} müqayisə et |
| `ux.noPath.reset` | Reset demo | Demonu sıfırla |
| `ux.compare.paths_one` | {{count}} attack path | {{count}} hücum yolu |
| `ux.compare.paths_other` | {{count}} attack paths | {{count}} hücum yolu |
| `ux.compare.compromised` | {{n}} of {{total}} assets compromised | {{total}} aktivdən {{n}} ələ keçirilib |
| `ux.compare.close` | Close the comparison | Müqayisəni bağla |
| `ux.narr.idle` | Press Play to watch the attack step by step | Hücumu addım-addım izləmək üçün Oynat düyməsini basın |
| `ux.narr.idleBody` | Each step shows who moves where, through which port or flaw, and why the model allows it. | Hər addım kimin haraya, hansı port və ya zəiflik vasitəsilə keçdiyini və modelin buna niyə imkan verdiyini göstərir. |
| `ux.narr.step` | Step {{n}} of {{total}} | Addım {{n}} / {{total}} |
| `ux.narr.finished` | Replay finished after {{count}} steps. Play it again, or click an event to inspect one step. | Təkrar {{count}} addımdan sonra bitdi. Yenidən oynadın və ya bir addıma baxmaq üçün hadisəyə klikləyin. |
| `ux.narr.onPath` | Main path | Əsas yol |
| `ux.narr.sidePath` ⚠️ | Side branch | Yan qol |
| `ux.narr.who` | Who | Kim |
| `ux.narr.how` | How | Necə |
| `ux.narr.odds` | Odds | Ehtimal |
| `ux.narr.port` | port {{port}} | {{port}} portu |
| `ux.narr.p` | this step {{p}} | bu addım {{p}} |
| `ux.narr.cumulative` | path so far {{p}} | yolun indiyədək olan hissəsi {{p}} |
| `ux.narr.headline.reach` | {{to}} is reachable | {{to}} əlçatandır |
| `ux.narr.headline.remote_exploit` | {{to}} is exploited | {{to}} istismar olunur |
| `ux.narr.headline.brute_force` | A password is guessed on {{to}} | {{to}} üzərində parol təxmin edilir |
| `ux.narr.headline.kerberoast` | A service password is cracked | Servis parolu sındırılır |
| `ux.narr.headline.credential_theft` | Credentials are dumped on {{to}} | {{to}} üzərində giriş məlumatları çıxarılır |
| `ux.narr.headline.credential_use` | Stolen credentials open {{to}} | Oğurlanmış giriş məlumatları {{to}} sisteminə yol açır |
| `ux.narr.headline.local_privesc` | Admin rights on {{to}} | {{to}} üzərində admin hüquqları |
| `ux.narr.headline.trust_abuse` | A trust link leads to {{to}} | Etibar əlaqəsi {{to}} sisteminə aparır |
| `ux.narr.headline.permission_abuse` | A stored credential leads to {{to}} | Saxlanmış giriş məlumatı {{to}} sisteminə aparır |
| `ux.narr.headline.data_access` | Data on {{to}} is read | {{to}} üzərindəki məlumatlar oxunur |
| `ux.narr.headline.domain_takeover` | The domain is taken over | Domen ələ keçirilir |
| `ux.node.internet` | Internet | İnternet |
| `ux.node.domain` | Domain admin | Domen admini |
| `ux.node.network` | {{asset}}, port {{port}} | {{asset}}, {{port}} portu |
| `ux.node.user` | {{asset}} (user) | {{asset}} (istifadəçi) |
| `ux.node.admin` | {{asset}} (admin) | {{asset}} (admin) |
| `ux.node.cred` | credentials of {{principal}} | {{principal}} hesabının giriş məlumatları |
| `ux.node.data` | data on {{asset}} | {{asset}} üzərindəki məlumatlar |
| `ux.summary.title` | Result | Nəticə |
| `ux.summary.pBreach` | breach probability {{p}} | pozulma ehtimalı {{p}} |
| `ux.summary.path` | Path {{id}} | Yol {{id}} |
| `ux.summary.likelihood` | likelihood {{p}} | ehtimal {{p}} |
| `ux.summary.topFix` | Biggest single fix | Ən təsirli tək düzəliş |
| `ux.summary.topFixBody` | Fixing “{{title}}” raises the score by {{delta}}, to {{after}}. | “{{title}}” zəifliyinin düzəldilməsi balı {{delta}} artırır və {{after}} edir. |
| `ux.summary.topFixOpen` | Select it in Remediation | Düzəlişlər bölməsində seç |
| `ux.log.empty` | Run a scenario to see its events here. | Hadisələri burada görmək üçün ssenarini işə salın. |
| `ux.filter.title` | Asset types | Aktiv növləri |
| `ux.remed.residualOnly` | No attack path is left in this scenario on r{{rev}}. The fixes below only remove residual exposure; they do not change the score. | r{{rev}} versiyasında bu ssenaridə hücum yolu qalmayıb. Aşağıdakı düzəlişlər yalnız qalıq riski aradan qaldırır; balı dəyişmir. |
| `ux.toast.runTitle` | {{scenario}} on r{{rev}} finished | {{scenario}}: r{{rev}} üzərində icra başa çatdı |
| `ux.toast.runDelta_one` | Score {{before}} → {{after}} since the last run (r{{rev}}); attack paths {{pathsBefore}} → {{count}}. | Əvvəlki icra ilə müqayisədə (r{{rev}}) bal {{before}} → {{after}}; hücum yolları {{pathsBefore}} → {{count}}. |
| `ux.toast.runDelta_other` | Score {{before}} → {{after}} since the last run (r{{rev}}); attack paths {{pathsBefore}} → {{count}}. | Əvvəlki icra ilə müqayisədə (r{{rev}}) bal {{before}} → {{after}}; hücum yolları {{pathsBefore}} → {{count}}. |
| `ux.toast.runFirst_one` | Score {{score}}: {{count}} attack path, {{comp}} of {{total}} assets compromised. | Bal {{score}}: {{count}} hücum yolu, {{total}} aktivdən {{comp}} ələ keçirilib. |
| `ux.toast.runFirst_other` | Score {{score}}: {{count}} attack paths, {{comp}} of {{total}} assets compromised. | Bal {{score}}: {{count}} hücum yolu, {{total}} aktivdən {{comp}} ələ keçirilib. |
| `ux.toast.open` | Open the result | Nəticəni aç |

## Vulnerabilities

| Key | English | Azerbaijani |
|---|---|---|
| `vulns.title` | Findings | Zəifliklər |
| `vulns.noSimNote` | Path counts and Δscore come from a simulation on the current revision. Run one to fill them in. | Yolların sayı və Δbal cari versiyadakı simulyasiyadan gəlir. Onları doldurmaq üçün simulyasiyanı işə salın. |
| `vulns.none` | No findings in this revision | Bu versiyada zəiflik yoxdur |
| `vulns.noneBody` | Add one from the catalog to see how it changes attack paths. | Hücum yollarını necə dəyişdiyini görmək üçün kataloqdan birini əlavə edin. |
| `vulns.finding` | Finding | Zəiflik |
| `vulns.affected` | Affects | Təsir edir |
| `vulns.paths` | Paths using it | Onu istifadə edən yollar |
| `vulns.delta` | Δscore if fixed | Düzəldilsə Δbal |
| `vulns.detail` | Finding detail | Zəifliyin təfərrüatı |
| `vulns.pick` | Select a finding to see its detail. | Təfərrüata baxmaq üçün zəiflik seçin. |
| `vulns.illustrative` | illustrative | nümunəvi |
| `vulns.maturity` | Exploit maturity | İstismarın yetkinliyi |
| `vulns.grants` | Grants | Verdiyi imtiyaz |
| `vulns.fixedBy` | Fixed by | Düzəltmə üsulları |
| `vulns.fix` | Fix | Düzəlt |
| `vulns.remove` | Delete finding | Zəifliyi sil |
| `vulns.removeHint` | Deleting a finding only edits the model. Use Fix to simulate a real remediation. | Zəifliyi silmək yalnız modeli redaktə edir. Real düzəlişi simulyasiya etmək üçün Düzəlt düyməsindən istifadə edin. |
| `vulns.removeTitle` | Delete {{id}}? | {{id}} silinsin? |
| `vulns.removeBody` | The finding is removed from a new revision of the model. | Zəiflik modelin yeni versiyasından çıxarılır. |
| `vulns.removed` | Finding deleted | Zəiflik silindi |
| `vulns.add` | Add finding | Zəiflik əlavə et |
| `vulns.addConfirm` | Add finding | Zəiflik əlavə et |
| `vulns.added` | Finding added | Zəiflik əlavə edildi |
| `vulns.template` | Template | Şablon |
| `vulns.asset` | Asset | Aktiv |
| `vulns.principal` | Identity | Hesab |
| `vulns.pickTemplate` | Choose a template. | Şablon seçin. |
| `vulns.pickAsset` | Choose the affected asset. | Təsirə məruz qalan aktivi seçin. |
| `vulns.pickPort` | Choose the affected port. | Təsirə məruz qalan portu seçin. |
| `vulns.pickPrincipal` | Choose the affected identity. | Təsirə məruz qalan hesabı seçin. |
| `vulns.cveNote` | {{cve}} is an illustrative identifier, not a real advisory. | {{cve}} nümunəvi identifikatordur, real təhlükəsizlik bülleteni deyil. |

## Vulnerabilities: edit form

| Key | English | Azerbaijani |
|---|---|---|
| `vulnForm.edit` | Edit | Redaktə et |
| `vulnForm.editTitle` | Edit finding {{id}} | {{id}} zəifliyini redaktə et |
| `vulnForm.updated` | Finding updated | Zəiflik yeniləndi |
| `vulnForm.blank` | Blank finding | Boş zəiflik |
| `vulnForm.templateHint` | Prefills the fields; everything stays editable. | Sahələri əvvəlcədən doldurur; hamısı redaktə edilə bilir. |
| `vulnForm.title` | Title | Başlıq |
| `vulnForm.kind` | Kind | Növ |
| `vulnForm.cvssHint` | 0–10 (illustrative scoring for the model) | 0–10 (model üçün nümunəvi qiymətləndirmə) |
| `vulnForm.maturityHint` | 0–1: how readily it can be exploited | 0–1: nə qədər asan istismar oluna bilər |
| `vulnForm.cveHint` | Optional; shown as illustrative. | İstəyə bağlı; nümunəvi kimi göstərilir. |
| `vulnForm.mitre` | ATT&CK techniques | ATT&CK texnikaları |
| `vulnForm.mitreHint` | Comma separated, e.g. T1190, T1558.003 | Vergüllə ayırın, məs. T1190, T1558.003 |
| `vulnForm.fixedVersion` | Fixed version | Düzəldilmiş versiya |
| `vulnForm.fixedVersionHint` | Set on the software by Patch. | Yamaq tətbiq edildikdə proqram təminatına yazılır. |
| `vulnForm.description` | Description | Təsvir |
| `vulnForm.err.cvss` | CVSS must be between 0 and 10. | CVSS 0 ilə 10 arasında olmalıdır. |
| `vulnForm.err.maturity` | Exploit maturity must be between 0 and 1. | İstismarın yetkinliyi 0 ilə 1 arasında olmalıdır. |
| `vulnForm.err.cve` | Use the form CVE-2099-0001. | CVE-2099-0001 formatından istifadə edin. |
| `vulnForm.err.mitre` | Use ATT&CK ids such as T1190 or T1558.003. | T1190 və ya T1558.003 kimi ATT&CK identifikatorlarından istifadə edin. |
| `vulnForm.err.target` | Choose an affected asset or identity. | Təsirə məruz qalan aktivi və ya hesabı seçin. |
| `vulnForm.err.portNeedsAsset` | Choose the asset first. | Əvvəlcə aktivi seçin. |
| `vulnForm.err.portClosed` | That port is not open on the asset. | Bu port aktivdə açıq deyil. |

## AI assistant

| Key | English | Azerbaijani |
|---|---|---|
| `ai.errIdle` | No data from the assistant for {{seconds}}s | Köməkçidən {{seconds}} saniyədir məlumat gəlmir |
| `ai.explanation` | Security analyst explanation | Təhlükəsizlik analitikinin izahı |
| `ai.regenerate` | Regenerate | Yenidən yarat |
| `ai.simulation` | Simulation | Simulyasiya |
| `ai.compareWith` | Compare with | Müqayisə et |
| `ai.noComparison` | no comparison | müqayisəsiz |
| `ai.modeLlm` | LLM · {{provider}} {{model}} | LLM · {{provider}} {{model}} |
| `ai.modeFallback` | Template (no LLM) | Şablon (LLM yoxdur) |
| `ai.cached` | cached | keşdən |
| `ai.fallbackReason` | Reason: {{reason}} | Səbəb: {{reason}} |
| `ai.unverifiedBanner` | These identifiers do not appear in the simulation data and are unverified: | Bu identifikatorlar simulyasiya məlumatlarında yoxdur və təsdiqlənməyib: |
| `ai.missingSections` | The model skipped required sections: {{sections}}. Regenerate, or rely on the engine data shown in Attack Simulation. | Model tələb olunan bölmələri buraxdı: {{sections}}. Yenidən yaradın və ya Hücum simulyasiyasında göstərilən mühərrik məlumatlarına əsaslanın. |
| `ai.writingProgress` | The model is writing structured output ({{chars}} characters)… | Model strukturlaşdırılmış cavab yazır ({{chars}} simvol)… |
| `ai.check.passed` | Integrity checks passed | Bütövlük yoxlamaları keçdi |
| `ai.check.failed_one` | {{count}} integrity problem found | {{count}} bütövlük problemi tapıldı |
| `ai.check.failed_other` | {{count}} integrity problems found | {{count}} bütövlük problemi tapıldı |
| `ai.check.numeric` | Numbers not found in the simulation data | Simulyasiya məlumatlarında olmayan rəqəmlər |
| `ai.check.citations` | Step ids cited under the wrong path | Yanlış yol altında göstərilən addım identifikatorları |
| `ai.check.citedUnder` | {{step}} under {{path}} | {{path}} altında {{step}} |
| `ai.check.placeholders` | Unknown placeholders | Naməlum yer tutucular |
| `ai.check.order` | Fixes out of the engine's Δscore order | Mühərrikin Δbal sırasına uyğun olmayan düzəlişlər |
| `ai.check.techniques` | Wording contradicts the engine technique | İfadə mühərrikin texnikası ilə ziddiyyət təşkil edir |
| `ai.check.duplicates` | Fixes listed twice | İki dəfə sadalanan düzəlişlər |
| `ai.check.unplaced` ⚠️ | Numbers written literally (match the data, meaning not verifiable) | Hərfi yazılmış rəqəmlər (məlumatla üst-üstə düşür, mənası yoxlanıla bilmir) |
| `ai.check.note` | The model writes placeholders that the server fills from the engine result; attack steps are always rendered from the engine. | Model yer tutucular yazır, server onları mühərrikin nəticəsi ilə doldurur; hücum addımları həmişə mühərrikdən göstərilir. |
| `ai.unverifiedHint` | Unverified: not present in the simulation input | Təsdiqlənməyib: simulyasiya girişində yoxdur |
| `ai.noSim` | No simulation to explain | İzah ediləcək simulyasiya yoxdur |
| `ai.noSimBody` | Run a scenario first; the analyst only explains engine results. | Əvvəlcə ssenarini işə salın; analitik yalnız mühərrikin nəticələrini izah edir. |
| `ai.writing` | Writing the explanation… | İzah yazılır… |
| `ai.thinking` | Thinking… | Düşünür… |
| `ai.disclaimer` | Explanations describe simulated results on a virtual model. Paths and numbers come only from the engine. | İzahlar virtual model üzərindəki simulyasiya nəticələrini təsvir edir. Yollar və rəqəmlər yalnız mühərrikdən gəlir. |
| `ai.chat` | Ask the analyst | Analitikdən soruşun |
| `ai.chatIntro` | Ask about the current model and latest simulation. Answers use only that data. | Cari model və son simulyasiya haqqında soruşun. Cavablar yalnız bu məlumatlara əsaslanır. |
| `ai.q1` | What should I fix first? | İlk növbədə nəyi düzəltməliyəm? |
| `ai.q2` | How does the attacker reach the customer database? | Hücumçu müştəri verilənlər bazasına necə çatır? |
| `ai.q3` | What is the security score and why? | Təhlükəsizlik balı nədir və niyə belədir? |
| `ai.ask` | Ask a question about this twin | Bu əkiz haqqında sual verin |
| `ai.send` | Send | Göndər |

## Remediation

| Key | English | Azerbaijani |
|---|---|---|
| `remed.recommended` | Recommended fixes | Tövsiyə olunan düzəlişlər |
| `remed.scenario` | Scenario | Ssenari |
| `remed.readOnly` | Switch to the latest revision to apply fixes. | Düzəlişləri tətbiq etmək üçün ən son versiyaya keçin. |
| `remed.computing` | Computing what-if scores… | “Bəs əgər” balları hesablanır… |
| `remed.baseline` | Current score {{score}} on r{{rev}}. Each fix shows the score change the engine computed for it alone. | r{{rev}} üzrə cari bal {{score}}. Hər düzəliş üçün mühərrikin yalnız onun özü üçün hesabladığı bal dəyişikliyi göstərilir. |
| `remed.none` | Nothing to fix for this scenario | Bu ssenari üçün düzəldiləcək heç nə yoxdur |
| `remed.noneBody` | No finding lies on an attack path toward this scenario's goals. | Bu ssenarinin hədəflərinə gedən hücum yollarında heç bir zəiflik yoxdur. |
| `remed.addresses` | Addresses {{ids}} | Aradan qaldırır: {{ids}} |
| `remed.boundary` | Attack paths cross this zone boundary. | Hücum yolları bu zona sərhədini keçir. |
| `remed.selectTop3` | Select top 3 | İlk 3-ü seç |
| `remed.apply_one` | Apply {{count}} fix | {{count}} düzəlişi tətbiq et |
| `remed.apply_other` | Apply {{count}} fixes | {{count}} düzəlişi tətbiq et |
| `remed.confirmTitle` | Apply these fixes? | Bu düzəlişlər tətbiq edilsin? |
| `remed.confirmBody` | This creates a new revision from r{{rev}} and re-runs the scenario. | Bu, r{{rev}} versiyasından yeni versiya yaradır və ssenarini yenidən işə salır. |
| `remed.confirmApply` | Apply fixes | Düzəlişləri tətbiq et |
| `remed.confirmNote` | Combined effect can differ from the sum of individual Δscores. You can revert afterwards. | Birgə təsir ayrı-ayrı Δballarının cəmindən fərqlənə bilər. Sonradan geri qaytara bilərsiniz. |
| `remed.applied` | Fixes applied as r{{n}} | Düzəlişlər r{{n}} kimi tətbiq edildi |
| `remed.appliedBody_one` | Score {{before}} → {{after}}; {{count}} path blocked. | Bal {{before}} → {{after}}; {{count}} yol bağlandı. |
| `remed.appliedBody_other` | Score {{before}} → {{after}}; {{count}} paths blocked. | Bal {{before}} → {{after}}; {{count}} yol bağlandı. |
| `remed.beforeAfter` | Before / after | Əvvəl / sonra |
| `remed.noComparison` | No fixes applied on the latest revision | Ən son versiyada düzəliş tətbiq edilməyib |
| `remed.noComparisonBody` | Select fixes on the left and apply them to compare before and after. | Əvvəl və sonranı müqayisə etmək üçün soldan düzəlişləri seçib tətbiq edin. |
| `remed.view` | Comparison view | Müqayisə görünüşü |
| `remed.sideBySide` | Side by side | Yan-yana |
| `remed.toggle` ⚠️ | Toggle | Növbə ilə |
| `remed.before` | Before | Əvvəl |
| `remed.after` | After | Sonra |
| `remed.scoreChange` | Score change | Bal dəyişikliyi |
| `remed.blocked` | Blocked | Bağlanıb |
| `remed.reduced` | Reduced | Azalıb |
| `remed.new` | New | Yeni |
| `remed.pathChanges` | Path changes | Yol dəyişiklikləri |
| `remed.noPathChange` | No path changed. | Heç bir yol dəyişməyib. |
| `remed.perAsset` | Risk per asset | Aktivlər üzrə risk |
| `remed.changes` | Model changes ({{n}}) | Model dəyişiklikləri ({{n}}) |
| `remed.revert` | Revert | Geri qaytar |
| `remed.revertTitle` | Revert r{{rev}}? | r{{rev}} geri qaytarılsın? |
| `remed.revertBody` | A new revision restores the model as it was in r{{rev}}, then the scenario runs again. | Yeni versiya modeli r{{rev}} versiyasındakı vəziyyətinə qaytarır, sonra ssenari yenidən işə düşür. |
| `remed.reverted` | Reverted as r{{n}} | r{{n}} kimi geri qaytarıldı |
| `remed.revertedBody` | Score restored to {{score}}. | Bal {{score}} olaraq bərpa edildi. |
| `remed.history` | Applied fixes | Tətbiq edilmiş düzəlişlər |

## Reports

| Key | English | Azerbaijani |
|---|---|---|
| `reports.history` | Simulation history | Simulyasiya tarixçəsi |
| `reports.goRun` | Go to Attack Simulation | Hücum simulyasiyasına keç |
| `reports.when` | When | Vaxt |
| `reports.scenario` | Scenario | Ssenari |
| `reports.revision` | Revision | Versiya |
| `reports.paths` | Paths | Yollar |
| `reports.open` | Open in Attack Simulation | Hücum simulyasiyasında aç |
| `reports.printable` | Report | Hesabat |
| `reports.json` | Download JSON | JSON yüklə |
| `reports.diff` | Revision diff | Versiyalar arasında fərq |
| `reports.base` | From | Haradan |
| `reports.target` | To | Haraya |
| `reports.noDiff` | These revisions are identical. | Bu versiyalar eynidir. |
| `reports.segmented` | Segmented | Ayrılıb |
| `reports.printHint` | Open a run's Report and use Print to save it as PDF. | İcranın hesabatını açın və PDF kimi saxlamaq üçün Çap funksiyasından istifadə edin. |
| `reports.col.assets` | Assets | Aktivlər |
| `reports.col.connections` | Connections | Bağlantılar |
| `reports.col.principals` | Identities | Hesablar |
| `reports.col.firewall_rules` | Firewall rules | Brandmauer qaydaları |
| `reports.col.vulnerabilities` | Findings | Zəifliklər |

## Overview / Remediation: residual exposure

| Key | English | Azerbaijani |
|---|---|---|
| `residual.title` ⚠️ | Residual exposure | Qalıq risk |
| `residual.none` | Nothing left: every finding in the model is either fixed or used by a reachable attack path. | Heç nə qalmayıb: modeldəki hər zəiflik ya düzəldilib, ya da əlçatan hücum yolunda istifadə olunur. |
| `residual.explain` | Still present in the model, but no reachable attack path uses them in this scenario. They do not lower the score, yet one change elsewhere can make them exploitable again. | Modeldə hələ də var, lakin bu ssenaridə heç bir əlçatan hücum yolu onlardan istifadə etmir. Bal düşmür, amma başqa yerdəki bir dəyişiklik onları yenidən istismar edilə bilən edə bilər. |
| `residual.reason.unreachable` | attacker cannot reach it | hücumçu çata bilmir |
| `residual.reason.not_in_scenario` | not used by this scenario | bu ssenaridə istifadə olunmur |

## Labels used on several screens (severity, states, zones, types, techniques)

| Key | English | Azerbaijani |
|---|---|---|
| `severity.critical` | Critical | Kritik |
| `severity.high` | High | Yüksək |
| `severity.medium` | Medium | Orta |
| `severity.low` | Low | Aşağı |
| `state.compromised` | Compromised | Ələ keçirilib |
| `state.reachable` | Reachable | Əlçatandır |
| `state.unreached` | Unreached | Çatılmayıb |
| `state.secure` | Secure | Təhlükəsizdir |
| `state.warning` ⚠️ | Has findings | Zəiflik var |
| `zone.internet` | Internet | İnternet |
| `zone.dmz` | DMZ | DMZ |
| `zone.internal` | Internal | Daxili şəbəkə |
| `zone.data` | Data | Məlumat |
| `zone.mgmt` | Mgmt | İdarəetmə |
| `assetType.internet_gateway` | Internet gateway | İnternet şlüzü |
| `assetType.firewall` ⚠️ | Firewall | Brandmauer |
| `assetType.web_server` | Web server | Veb-server |
| `assetType.app_server` | App server | Tətbiq serveri |
| `assetType.db_server` | Database server | Verilənlər bazası serveri |
| `assetType.identity_server` | Identity server | İdentifikasiya serveri |
| `assetType.employee_ws` | Employee workstation | İşçi kompüteri |
| `assetType.admin_ws` | Admin workstation | Administrator kompüteri |
| `connKind.network` | Network link | Şəbəkə bağlantısı |
| `connKind.trust` | Trust | Etibar |
| `connKind.permission` | Permission | İcazə |
| `strength.weak` | Weak | Zəif |
| `strength.medium` | Medium | Orta |
| `strength.strong` | Strong | Güclü |
| `level.read` | read | oxuma |
| `level.write` | write | yazma |
| `level.admin` | admin | admin |
| `privilege.user` | User | İstifadəçi |
| `privilege.admin` | Admin | Admin |
| `privilege.domain_admin` | Domain admin | Domen admini |
| `revKind.seed` | seed | ilkin |
| `revKind.edit` | edit | redaktə |
| `revKind.remediation` | remediation | düzəliş |
| `revKind.revert` | revert | geri qaytarma |
| `eventKind.simulation_complete` | Simulation finished | Simulyasiya başa çatdı |
| `eventKind.remediation_applied` | Remediation applied | Düzəliş tətbiq edildi |
| `eventKind.revision_reverted` | Revision reverted | Versiya geri qaytarıldı |
| `eventKind.demo_reset` | Demo restored | Demo bərpa edildi |
| `scenario.sensitive_data_exposure` | Sensitive Data Exposure | Həssas məlumatların ifşası |
| `scenario.credential_compromise` ⚠️ | Credential Compromise | Giriş məlumatlarının ələ keçirilməsi |
| `scenario.lateral_movement` ⚠️ | Lateral Movement | Şəbəkə daxilində yayılma |
| `scenario.privilege_escalation` ⚠️ | Privilege Escalation | İmtiyazların yüksəldilməsi |
| `scenario.outdated_service_exploitation` | Outdated Services | Köhnəlmiş servislər |
| `scenarioDesc.sensitive_data_exposure` | From the internet to data on assets with sensitivity 2 or higher. | İnternetdən həssaslıq dərəcəsi 2 və ya daha yüksək olan aktivlərdəki məlumatlara. |
| `scenarioDesc.credential_compromise` | From the internet to usable credentials of any identity. | İnternetdən istənilən hesabın işlək giriş məlumatlarına. |
| `scenarioDesc.lateral_movement` | From one compromised host, how far can an attacker spread? | Ələ keçirilmiş bir hostdan hücumçu nə qədər uzağa yayıla bilər? |
| `scenarioDesc.privilege_escalation` | From a foothold to domain admin or the identity server. | Dayaq nöqtəsindən domen admininə və ya identifikasiya serverinə. |
| `scenarioDesc.outdated_service_exploitation` | From the internet, using only end-of-life software. | İnternetdən, yalnız dəstəyi bitmiş proqram təminatı ilə. |
| `phase.recon` | Recon | Kəşfiyyat |
| `phase.exploit` | Exploit | İstismar |
| `phase.credential` | Credentials | Giriş məlumatları |
| `phase.escalate` | Escalate | Yüksəltmə |
| `phase.pivot` ⚠️ | Pivot | Keçid |
| `phase.exfil` | Data access | Məlumata giriş |
| `technique.reach` | Network reach | Şəbəkə əlçatanlığı |
| `technique.remote_exploit` | Remote exploit | Uzaqdan istismar |
| `technique.brute_force` | Password guessing | Parolun təxmin edilməsi |
| `technique.kerberoast` | Kerberoasting | Kerberoasting |
| `technique.credential_theft` | Credential dumping | Giriş məlumatlarının çıxarılması |
| `technique.credential_use` ⚠️ | Valid account use | Etibarlı hesabdan istifadə |
| `technique.local_privesc` | Local privilege escalation | Lokal imtiyaz yüksəltmə |
| `technique.trust_abuse` | Trust abuse | Etibardan sui-istifadə |
| `technique.permission_abuse` | Stored credential abuse | Saxlanmış giriş məlumatından sui-istifadə |
| `technique.data_access` | Data access | Məlumata giriş |
| `technique.domain_takeover` | Domain takeover | Domenin ələ keçirilməsi |
| `vulnKind.remote_service` | Remote service | Uzaq servis |
| `vulnKind.weak_credential` | Weak credential | Zəif giriş məlumatı |
| `vulnKind.local_privesc` | Local privilege escalation | Lokal imtiyaz yüksəltmə |
| `vulnKind.misconfig` | Misconfiguration | Yanlış konfiqurasiya |
| `vulnKind.excessive_permission` | Excessive permission | Artıq icazə |
| `vulnKind.outdated_software` | Outdated software | Köhnəlmiş proqram təminatı |
| `remType.restrict_port` | Restrict port | Portu məhdudlaşdır |
| `remType.enforce_mfa` | Enforce MFA | MFA-nı məcburi et |
| `remType.set_password_policy` | Password policy | Parol siyasəti |
| `remType.apply_patch` ⚠️ | Patch | Yamaq |
| `remType.reduce_permission` | Reduce permission | İcazəni azalt |
| `remType.segment_zones` | Segment zones | Zonaları ayır |
| `remAction.restrict_port` | Restrict {{asset}} port {{port}} to {{zones}} | {{asset}} üzərində {{port}} portunu {{zones}} ilə məhdudlaşdır |
| `remAction.enforce_mfa` | Enforce MFA for {{principal}} | {{principal}} üçün MFA-nı məcburi et |
| `remAction.set_password_policy` | Require a {{policy}} password for {{principal}} | {{principal}} üçün {{policy}} parol tələb et |
| `remAction.apply_patch` | Patch {{vuln}} | {{vuln}} üçün yamaq tətbiq et |
| `remAction.reduce_permission` | Reduce {{principal}} on {{asset}} to {{level}} | {{principal}} hesabının {{asset}} üzərindəki icazəsini {{level}} səviyyəsinə endir |
| `remAction.segment_zones` | Segment {{a}} from {{b}} | {{a}} zonasını {{b}} zonasından ayır |
| `hardening.servers` | Servers | Serverlər |
| `hardening.endpoints` | Endpoints | İş stansiyaları |
| `hardening.network` | Network | Şəbəkə |

# Engine messages (backend catalog)

## Replay narration and event log (plain-language sentences)

| Key | English | Azerbaijani |
|---|---|---|
| `story.edge.brute_force` | '{{principal}}' has a {{strength}} password. The attacker guesses it through {{service}} on {{asset}} (port {{port}}){{mfa}}. | '{{principal}}' hesabı {{strength}} paroldan istifadə edir. Hücumçu bu parolu {{asset}} üzərindəki {{service}} servisi ({{port}} portu) vasitəsilə təxmin edir{{mfa}}. |
| `story.edge.credential_theft` | As admin on {{asset}}, the attacker dumps the cached credentials of '{{principal}}'{{edr}}. | {{asset}} üzərində admin olan hücumçu keşdəki '{{principal}}' giriş məlumatlarını çıxarır{{edr}}. |
| `story.edge.credential_use` | With the credentials of '{{principal}}', the attacker logs on to {{asset}} with {{level}} rights{{mfa}}. | Hücumçu '{{principal}}' hesabının giriş məlumatları ilə {{asset}} sisteminə {{level}} hüququ ilə daxil olur{{mfa}}. |
| `story.edge.data_access.admin` | As admin on {{asset}}, the attacker can read the data stored there (sensitivity {{sensitivity}} of 3). | {{asset}} üzərində admin olan hücumçu orada saxlanan məlumatları oxuya bilir (həssaslıq 3 üzərindən {{sensitivity}}). |
| `story.edge.data_access.cred` | '{{principal}}' has {{level}} rights on {{asset}}, so the attacker can read its data{{mfa}}. | '{{principal}}' hesabının {{asset}} üzərində {{level}} hüququ var, buna görə hücumçu onun məlumatlarını oxuya bilir{{mfa}}. |
| `story.edge.domain_takeover.idp` | Admin rights on the identity server {{asset}} mean control of the whole domain. | {{asset}} identifikasiya serverində admin hüquqları bütün domenə nəzarət deməkdir. |
| `story.edge.domain_takeover.principal` | '{{principal}}' is a domain admin: whoever holds its credentials controls the whole domain{{mfa}}. | '{{principal}}' domen adminidir: onun giriş məlumatlarına sahib olan bütün domenə nəzarət edir{{mfa}}. |
| `story.edge.kerberoast` ⚠️ | Any domain account can request a service ticket for '{{principal}}' from {{asset}}. Its {{strength}} password is then cracked offline, which raises no alert on the network. | Domendəki istənilən hesab {{asset}} üzərindən '{{principal}}' üçün servis bileti istəyə bilər. Sonra {{strength}} parol oflayn sındırılır və şəbəkədə heç bir xəbərdarlıq yaranmır. |
| `story.edge.local_privesc` | With a foothold on {{asset}}, the attacker uses “{{vuln}}” to become admin there{{edr}}. | {{asset}} üzərində dayaq nöqtəsi olan hücumçu “{{vuln}}” zəifliyi ilə orada admin olur{{edr}}. |
| `story.edge.permission_abuse` | A credential stored on {{source}} grants access to {{target}}, so the attacker moves on to {{target}}. | {{source}} üzərində saxlanmış giriş məlumatı {{target}} sisteminə giriş verir, buna görə hücumçu {{target}} sisteminə keçir. |
| `story.edge.reach.direct` | The attacker can connect from {{origin}} to {{dst}} on port {{port}} ({{service}}) over a direct link, with no firewall in between. | Hücumçu {{origin}} üzərindən {{dst}} sisteminə {{port}} portu ({{service}}) ilə birbaşa qoşula bilir; arada brandmauer yoxdur. |
| `story.edge.reach.via` | The attacker can connect from {{origin}} to {{dst}} on port {{port}} ({{service}}). The rules on {{via}} allow this traffic. | Hücumçu {{origin}} üzərindən {{dst}} sisteminə {{port}} portu ({{service}}) ilə qoşula bilir. {{via}} üzərindəki qaydalar bu trafikə icazə verir. |
| `story.edge.remote_exploit` | The service on port {{port}} of {{asset}} has the flaw “{{vuln}}”. Exploiting it gives the attacker {{privilege}} access to {{asset}}{{edr}}. | {{asset}} üzərində {{port}} portundakı servisdə “{{vuln}}” zəifliyi var. Hücumçu onu istismar edərək {{asset}} üzərində {{privilege}} girişi əldə edir{{edr}}. |
| `story.edge.trust_abuse` ⚠️ | {{target}} trusts {{source}}, so the attacker moves on to {{target}}{{as}}. | {{target}} {{source}} sisteminə etibar edir, buna görə hücumçu {{target}} sisteminə keçir{{as}}. |
| `story.note.edr` |  (EDR on the host makes detection more likely) |  (sistemdəki EDR aşkarlanma ehtimalını artırır) |
| `story.note.mfa_challenge` |  (an MFA prompt lowers the odds) |  (MFA yoxlaması ehtimalı azaldır) |
| `story.note.mfa_enabled` |  (MFA is on, which lowers the odds) |  (MFA aktivdir, bu da ehtimalı azaldır) |
| `story.note.no_mfa` |  (no MFA stands in the way) |  (qarşısında MFA maneəsi yoxdur) |
| `story.word.internet` | the internet | internet |

## Attack-path step reasons (path table, AI narrative, reports)

| Key | English | Azerbaijani |
|---|---|---|
| `edge.brute_force` | Guess the {{strength}} password of '{{principal}}' on {{asset}} {{service}}/{{port}}{{mfa}} | '{{principal}}' hesabının {{strength}} parolu {{asset}} {{service}}/{{port}} üzərində təxmin edilir{{mfa}} |
| `edge.credential_theft` | Dump cached credentials of '{{principal}}' from {{asset}}{{edr}} | {{asset}} üzərindən '{{principal}}' hesabının keşdəki giriş məlumatları çıxarılır{{edr}} |
| `edge.credential_use` | Log on to {{asset}} as '{{principal}}' ({{level}}){{mfa}} | {{asset}} sisteminə '{{principal}}' kimi daxil olunur ({{level}}){{mfa}} |
| `edge.data_access.admin` | Admin on {{asset}} reads its data (sensitivity {{sensitivity}}) | {{asset}} üzərində admin onun məlumatlarını oxuyur (həssaslıq {{sensitivity}}) |
| `edge.data_access.cred` | Read data on {{asset}} with the {{level}} rights of '{{principal}}'{{mfa}} | {{asset}} üzərindəki məlumatlar '{{principal}}' hesabının {{level}} hüququ ilə oxunur{{mfa}} |
| `edge.domain_takeover.idp` | Admin on identity server {{asset}} controls the domain | {{asset}} identifikasiya serverində admin olmaq domenə nəzarət deməkdir |
| `edge.domain_takeover.principal` | '{{principal}}' is a domain admin{{mfa}} | '{{principal}}' domen adminidir{{mfa}} |
| `edge.kerberoast` | Request a service ticket for '{{principal}}' from {{asset}} and crack its {{strength}} password offline | {{asset}} üzərindən '{{principal}}' üçün servis bileti istənilir və onun {{strength}} parolu oflayn sındırılır |
| `edge.local_privesc` | Escalate to admin on {{asset}} via {{vuln}}{{edr}} | {{asset}} üzərində {{vuln}} vasitəsilə admin səviyyəsinə yüksəlmə{{edr}} |
| `edge.permission_abuse` | Abuse the stored credential on {{source}} to reach {{target}} | {{source}} üzərində saxlanmış giriş məlumatı ilə {{target}} sisteminə çatılır |
| `edge.reach.direct` | {{origin}} can reach {{dst}} tcp/{{port}} ({{service}}) over a direct link | {{origin}} birbaşa bağlantı ilə {{dst}} tcp/{{port}} ({{service}}) ünvanına çata bilir |
| `edge.reach.via` ⚠️ | {{origin}} can reach {{dst}} tcp/{{port}} ({{service}}) via {{via}} | {{origin}} {{via}} vasitəsilə {{dst}} tcp/{{port}} ({{service}}) ünvanına çata bilir |
| `edge.remote_exploit` | Exploit {{vuln}} on {{asset}}:{{port}} to get {{privilege}} access{{edr}} | {{asset}}:{{port}} üzərində {{vuln}} istismar edilərək {{privilege}} girişi əldə edilir{{edr}} |
| `edge.trust_abuse` | Abuse the trust {{source}} → {{target}}{{as}} | {{source}} → {{target}} etibar əlaqəsindən sui-istifadə edilir{{as}} |

## Attack-path step reasons: notes

| Key | English | Azerbaijani |
|---|---|---|
| `note.as_principal` |  as '{{principal}}' |  ('{{principal}}' kimi) |
| `note.edr` |  (EDR present) |  (EDR var) |
| `note.mfa_challenge` | , MFA challenge | , MFA yoxlaması |
| `note.mfa_enabled` |  (MFA enabled) |  (MFA aktivdir) |
| `note.no_mfa` |  (no MFA) |  (MFA yoxdur) |

## Attack goals

| Key | English | Azerbaijani |
|---|---|---|
| `goal.cred` | Credentials of {{principal}} | {{principal}} hesabının giriş məlumatları |
| `goal.data` | Sensitive data on {{asset}} | {{asset}} üzərindəki həssas məlumatlar |
| `goal.domain_admin` | Domain admin | Domen admini |
| `goal.idp_admin` | Admin on {{asset}} | {{asset}} üzərində admin |
| `goal.pwn` | Code execution on {{asset}} | {{asset}} üzərində kodun icrası |

## Scenario names (engine)

| Key | English | Azerbaijani |
|---|---|---|
| `scenario.credential_compromise` ⚠️ | Credential Compromise | Giriş məlumatlarının ələ keçirilməsi |
| `scenario.lateral_movement` ⚠️ | Lateral Movement | Şəbəkə daxilində yayılma |
| `scenario.outdated_service_exploitation` | Outdated Service Exploitation | Köhnəlmiş servislərin istismarı |
| `scenario.privilege_escalation` ⚠️ | Privilege Escalation | İmtiyazların yüksəldilməsi |
| `scenario.sensitive_data_exposure` | Sensitive Data Exposure | Həssas məlumatların ifşası |

## Finding titles

| Key | English | Azerbaijani |
|---|---|---|
| `vuln.cached_admin` | {{principal}} admin credentials cached on an employee workstation | {{principal}} admin giriş məlumatları işçi kompüterində keşdədir |
| `vuln.custom` | {{title}} | {{title}} |
| `vuln.excessive_admin` | {{principal}} holds admin rights on {{asset}} | {{principal}} {{asset}} üzərində admin hüquqlarına malikdir |
| `vuln.print_spooler` | Print spooler local privilege escalation | Print Spooler vasitəsilə lokal imtiyaz yüksəltmə |
| `vuln.ssh_exposed` | SSH ({{port}}/tcp) on {{asset}} reachable from the internet | {{asset}} üzərindəki SSH ({{port}}/tcp) internetdən əlçatandır |
| `vuln.ssh_rce` | Outdated OpenSSH {{version}}: pre-auth remote code execution | Köhnəlmiş OpenSSH {{version}}: autentifikasiyadan əvvəl uzaqdan kod icrası |
| `vuln.tpl.excessive_perm` | Excessive permission on a sensitive asset | Həssas aktiv üzərində artıq icazə |
| `vuln.tpl.local_privesc` | Kernel local privilege escalation | Nüvədə lokal imtiyaz yüksəltmə |
| `vuln.tpl.outdated_ssh` | Outdated OpenSSH: pre-auth remote code execution | Köhnəlmiş OpenSSH: autentifikasiyadan əvvəl uzaqdan kod icrası |
| `vuln.tpl.rce_web` | Web application remote code execution | Veb tətbiqdə uzaqdan kod icrası |
| `vuln.tpl.rdp_exposed` | RDP exposed beyond the management zone | RDP idarəetmə zonasından kənarda açıqdır |
| `vuln.tpl.weak_password` | Weak password without MFA | MFA-sız zəif parol |
| `vuln.weak_password` ⚠️ | {{principal}}: weak password, no MFA, Kerberoastable | {{principal}}: zəif parol, MFA yoxdur, Kerberoasting-ə həssasdır |

## Remediation: model change log

| Key | English | Azerbaijani |
|---|---|---|
| `change.finding_resolved` | Resolved finding '{{vuln}}' | '{{vuln}}' zəifliyi aradan qaldırıldı |
| `change.mfa` | MFA enforced for '{{principal}}' | '{{principal}}' üçün MFA məcburi edildi |
| `change.password` | Password policy of '{{principal}}' set to {{policy}} | '{{principal}}' hesabının parol siyasəti {{policy}} olaraq təyin edildi |
| `change.patched` | Patched '{{vuln}}' ({{title}}) | '{{vuln}}' üçün yamaq tətbiq edildi ({{title}}) |
| `change.permission` | Permission of '{{principal}}' on '{{asset}}' reduced to {{level}} | '{{principal}}' hesabının '{{asset}}' üzərindəki icazəsi {{level}} səviyyəsinə endirildi |
| `change.port_closed_all` | {{asset}}:{{port}}/{{proto}} no longer accepts traffic from any zone | {{asset}}:{{port}}/{{proto}} artıq heç bir zonadan trafik qəbul etmir |
| `change.port_restricted` | {{asset}}:{{port}}/{{proto}} now only accepts traffic from {{zones}} | {{asset}}:{{port}}/{{proto}} artıq yalnız {{zones}} zonasından trafik qəbul edir |
| `change.rule_removed` | Removed firewall rule '{{rule}}' on {{firewall}} | {{firewall}} üzərində '{{rule}}' brandmauer qaydası silindi |
| `change.segmented` | Zones {{a}} ↔ {{b}} segmented: only asset-specific allow rules may cross | {{a}} ↔ {{b}} zonaları ayrıldı: sərhədi yalnız konkret aktiv üçün icazə qaydaları keçə bilər |
| `change.software` | {{asset}}: {{software}} {{old}} → {{new}} | {{asset}}: {{software}} {{old}} → {{new}} |

## Remediation: fix titles

| Key | English | Azerbaijani |
|---|---|---|
| `action.apply_patch` | Patch {{vuln}} | {{vuln}} üçün yamaq tətbiq et |
| `action.enforce_mfa` | Enforce MFA for {{principal}} | {{principal}} üçün MFA-nı məcburi et |
| `action.reduce_permission` | Reduce {{principal}} on {{asset}} to {{level}} | {{principal}} hesabının {{asset}} üzərindəki icazəsini {{level}} səviyyəsinə endir |
| `action.restrict_port` | Restrict {{asset}} port {{port}} to {{zones}} | {{asset}} üzərində {{port}} portunu {{zones}} ilə məhdudlaşdır |
| `action.segment_zones` | Segment {{a}} from {{b}} | {{a}} zonasını {{b}} zonasından ayır |
| `action.set_password_policy` | Require a {{policy}} password for {{principal}} | {{principal}} üçün {{policy}} parol tələb et |

## Remediation: fix rationale

| Key | English | Azerbaijani |
|---|---|---|
| `rec.addresses` | Addresses {{ids}}; what-if score {{before}} → {{after}} | Aradan qaldırır: {{ids}}; ehtimal olunan bal {{before}} → {{after}} |
| `rec.boundary` | Attack paths cross this zone boundary; what-if score {{before}} → {{after}} | Hücum yolları bu zona sərhədini keçir; ehtimal olunan bal {{before}} → {{after}} |

## Notifications

| Key | English | Azerbaijani |
|---|---|---|
| `event.demo_reset` | Demo environment restored | Demo mühiti bərpa edildi |
| `event.remediation` | {{count}} fixes applied → r{{rev}}: score {{before}} → {{after}} | {{count}} düzəliş tətbiq edildi → r{{rev}}: bal {{before}} → {{after}} |
| `event.revert` | r{{reverted}} reverted → r{{rev}} | r{{reverted}} geri qaytarıldı → r{{rev}} |
| `event.simulation` | {{scenario}} finished on r{{rev}}: score {{score}} | {{scenario}} r{{rev}} üzərində başa çatdı: bal {{score}} |

## Revision notes

| Key | English | Azerbaijani |
|---|---|---|
| `rev.asset_added` | Added asset {{id}} | {{id}} aktivi əlavə edildi |
| `rev.asset_deleted` | Deleted asset {{id}} | {{id}} aktivi silindi |
| `rev.asset_deleted_deps` | Deleted asset {{id}} (+{{count}} dependent items) | {{id}} aktivi silindi (+{{count}} asılı element) |
| `rev.asset_edited` | Edited asset {{id}} | {{id}} aktivi redaktə edildi |
| `rev.cloned` | Created from {{source}} | {{source}} əsasında yaradıldı |
| `rev.connection_added` | Connected {{source}} → {{target}} ({{kind}}) | {{source}} → {{target}} birləşdirildi ({{kind}}) |
| `rev.connection_deleted` | Deleted connection {{id}} | {{id}} bağlantısı silindi |
| `rev.connection_edited` | Edited connection {{id}} | {{id}} bağlantısı redaktə edildi |
| `rev.created` | Created | Yaradıldı |
| `rev.principal_added` | Added identity {{id}} | {{id}} hesabı əlavə edildi |
| `rev.principal_deleted` | Deleted identity {{id}} | {{id}} hesabı silindi |
| `rev.principal_edited` | Edited identity {{id}} | {{id}} hesabı redaktə edildi |
| `rev.remediation` | Remediation: {{actions}} | Düzəliş: {{actions}} |
| `rev.revert` | Revert r{{rev}} (restore r{{parent}}) | r{{rev}} geri qaytarıldı (r{{parent}} bərpa edildi) |
| `rev.rule_added` | Added firewall rule {{id}} on {{firewall}} | {{firewall}} üzərində {{id}} brandmauer qaydası əlavə edildi |
| `rev.rule_deleted` | Deleted firewall rule {{id}} | {{id}} brandmauer qaydası silindi |
| `rev.rule_edited` | Edited firewall rule {{id}} | {{id}} brandmauer qaydası redaktə edildi |
| `rev.seed_demo` | Seed: Northwind Logistics demo | İlkin: Northwind Logistics demosu |
| `rev.vuln_added` | Added finding {{id}} | {{id}} zəifliyi əlavə edildi |
| `rev.vuln_deleted` | Deleted finding {{id}} | {{id}} zəifliyi silindi |
| `rev.vuln_edited` | Edited finding {{id}} | {{id}} zəifliyi redaktə edildi |

## API error messages

| Key | English | Azerbaijani |
|---|---|---|
| `err.already_segmented` | Zones {{a}} and {{b}} are already segmented | {{a}} və {{b}} zonaları artıq ayrılıb |
| `err.connection_exists` | A {{kind}} connection between '{{source}}' and '{{target}}' already exists ('{{existing}}') | '{{source}}' ilə '{{target}}' arasında {{kind}} bağlantısı artıq mövcuddur ('{{existing}}') |
| `err.connection_port_closed` | Neither '{{source}}' nor '{{target}}' has port {{port}} open; cannot create connection | Nə '{{source}}', nə də '{{target}}' üzərində {{port}} portu açıq deyil; bağlantı yaratmaq mümkün deyil |
| `err.duplicate` | {{kind}} '{{id}}' already exists | {{kind}} '{{id}}' artıq mövcuddur |
| `err.duplicate_action` | Action '{{key}}' was given twice | '{{key}}' əməliyyatı iki dəfə verilib |
| `err.foothold_internet` | The internet gateway cannot be used as a foothold | İnternet şlüzü dayaq nöqtəsi kimi istifadə edilə bilməz |
| `err.foothold_missing` | Foothold asset '{{id}}' does not exist in this revision | '{{id}}' dayaq aktivi bu versiyada mövcud deyil |
| `err.foothold_privilege` | foothold_privilege must be 'user' or 'admin', got '{{value}}' | foothold_privilege 'user' və ya 'admin' olmalıdır, gələn dəyər: '{{value}}' |
| `err.id_mismatch` | Body id '{{body}}' does not match path id '{{path}}' | Sorğu gövdəsindəki '{{body}}' identifikatoru yoldakı '{{path}}' identifikatoru ilə uyğun gəlmir |
| `err.layout_unknown` | Unknown asset ids in layout: {{ids}} | Yerləşmədə naməlum aktiv identifikatoru: {{ids}} |
| `err.mfa_already` | Principal '{{id}}' already has MFA enforced | '{{id}}' hesabı üçün MFA artıq məcburidir |
| `err.no_foothold` | The twin has no asset that can serve as a foothold | Əkizdə dayaq nöqtəsi ola biləcək aktiv yoxdur |
| `err.no_parent` | Revision r{{rev}} is the first revision; nothing to revert to | r{{rev}} ilk versiyadır; geri qaytarılacaq versiya yoxdur |
| `err.no_permission` | Principal '{{id}}' has no permission on asset '{{asset}}' to reduce | '{{id}}' hesabının '{{asset}}' aktivində azaldılacaq icazəsi yoxdur |
| `err.not_a_firewall` ⚠️ | Asset '{{id}}' is a {{type}}, not a firewall | '{{id}}' aktivi brandmauer deyil, {{type}} növündədir |
| `err.not_found` | {{kind}} '{{id}}' does not exist | {{kind}} '{{id}}' mövcud deyil |
| `err.not_patchable` | Vulnerability '{{id}}' is a {{kind}} finding; it cannot be fixed by a patch | '{{id}}' zəifliyi {{kind}} növündədir; yamaqla düzəldilə bilməz |
| `err.not_reduction` | '{{id}}' has {{current}} on '{{asset}}'; {{level}} is not a reduction | '{{id}}' hesabının '{{asset}}' üzərində {{current}} hüququ var; {{level}} azaltma deyil |
| `err.password_already` | Principal '{{id}}' already uses a {{policy}} password | '{{id}}' hesabı artıq {{policy}} parol istifadə edir |
| `err.port_in_use` | Port {{port}} on '{{asset}}' is referenced by vulnerability '{{vuln}}'; delete or edit that vulnerability first | '{{asset}}' üzərindəki {{port}} portuna '{{vuln}}' zəifliyi istinad edir; əvvəlcə həmin zəifliyi silin və ya redaktə edin |
| `err.port_requires_asset` | affected_port requires affected_asset | affected_port üçün affected_asset tələb olunur |
| `err.revision_id_missing` | Revision id {{id}} does not exist | {{id}} identifikatorlu versiya mövcud deyil |
| `err.revision_missing` | Twin '{{twin}}' has no revision {{number}} | '{{twin}}' əkizində {{number}} nömrəli versiya yoxdur |
| `err.rule_port_closed` | Asset '{{asset}}' has no port {{port}} open; cannot create rule | '{{asset}}' aktivində {{port}} portu açıq deyil; qayda yaratmaq mümkün deyil |
| `err.scenario_params` | Scenario '{{scenario}}' does not accept parameters: {{names}} | '{{scenario}}' ssenarisi bu parametrləri qəbul etmir: {{names}} |
| `err.segment_self` | Cannot segment a zone from itself | Zona özündən ayrıla bilməz |
| `err.stale_revision` | Twin '{{twin}}' is at revision {{head}}, not {{expected}}; reload and retry | '{{twin}}' əkizi {{expected}} deyil, {{head}} versiyasındadır; səhifəni yeniləyib yenidən cəhd edin |
| `err.vuln_needs_asset` | Create the asset first, then add vulnerabilities to it | Əvvəlcə aktivi yaradın, sonra ona zəiflik əlavə edin |
| `err.vuln_port_closed` | Asset '{{asset}}' has no port {{port}} open; cannot attach vulnerability | '{{asset}}' aktivində {{port}} portu açıq deyil; zəiflik əlavə etmək mümkün deyil |

## API error messages: object names

| Key | English | Azerbaijani |
|---|---|---|
| `entity.asset` | Asset | Aktiv |
| `entity.connection` | Connection | Bağlantı |
| `entity.firewall` | Firewall | Brandmauer |
| `entity.principal` | Principal | Hesab |
| `entity.remediation` | Remediation | Düzəliş |
| `entity.rule` | Firewall rule | Brandmauer qaydası |
| `entity.simulation` | Simulation | Simulyasiya |
| `entity.twin` | Twin | Əkiz |
| `entity.vuln` | Vulnerability | Zəiflik |

## Engine labels (zones, levels, kinds)

| Key | English | Azerbaijani |
|---|---|---|
| `assettype.admin_ws` | admin workstation | administrator kompüteri |
| `assettype.app_server` | application server | tətbiq serveri |
| `assettype.db_server` | database server | verilənlər bazası serveri |
| `assettype.employee_ws` | employee workstation | işçi kompüteri |
| `assettype.firewall` | firewall | brandmauer |
| `assettype.identity_server` | identity server | identifikasiya serveri |
| `assettype.internet_gateway` | internet gateway | internet şlüzü |
| `assettype.web_server` | web server | veb-server |
| `connkind.network` | network | şəbəkə |
| `connkind.permission` | permission | icazə |
| `connkind.trust` | trust | etibar |
| `level.admin` | admin | admin |
| `level.none` | no access | giriş yoxdur |
| `level.read` | read | oxuma |
| `level.write` | write | yazma |
| `priv.admin` | admin | admin |
| `priv.user` | user | istifadəçi |
| `strength.medium` | medium | orta |
| `strength.strong` | strong | güclü |
| `strength.weak` | weak | zəif |
| `vulnkind.excessive_permission` | excessive permission | artıq icazə |
| `vulnkind.local_privesc` | local privilege escalation | lokal imtiyaz yüksəltmə |
| `vulnkind.misconfig` | misconfiguration | yanlış konfiqurasiya |
| `vulnkind.outdated_software` | outdated software | köhnəlmiş proqram təminatı |
| `vulnkind.remote_service` | remote service | uzaq servis |
| `vulnkind.weak_credential` | weak credential | zəif giriş məlumatı |
| `word.internet` | internet | internet |
| `zone.data` | Data | Məlumat |
| `zone.dmz` | DMZ | DMZ |
| `zone.internal` | Internal | Daxili şəbəkə |
| `zone.internet` | Internet | İnternet |
| `zone.mgmt` | Mgmt | İdarəetmə |

# AI assistant without a model (deterministic template)

| Key | English | Azerbaijani |
|---|---|---|
| `exec` | Executive summary | Rəhbərlik üçün xülasə |
| `narr` | Attack narrative | Hücumun gedişatı |
| `impact` | Business impact | Biznesə təsir |
| `remed` | Prioritized remediation | Prioritetləşdirilmiş düzəlişlər |
| `best` | Best practices | Ən yaxşı təcrübələr |
| `cmp` | Before/after comparison | Əvvəl/sonra müqayisəsi |
| `exec_body` | Simulated scenario **{scenario}** on revision r{rev} of the virtual model. Security score **{score:.0f}/100** (estimated breach probability {pb:.0%}). The engine found {n} attack paths; {c} of {t} assets can be compromised in the model (blast radius {br:.0%}). | Virtual modelin r{rev} versiyasında **{scenario}** ssenarisi simulyasiya edildi. Təhlükəsizlik balı **{score:.0f}/100** (təxmini pozulma ehtimalı {pbp:.0f}%). Mühərrik {n} hücum yolu tapdı; modeldəki {t} aktivdən {c} ələ keçirilə bilər (təsir radiusu {brp:.0f}%). |
| `exec_none` | Simulated scenario **{scenario}** on revision r{rev}: the engine found no attack path to any goal. Security score **{score:.0f}/100**. | r{rev} versiyasında **{scenario}** ssenarisi simulyasiya edildi: heç bir hədəfə hücum yolu tapılmadı. Təhlükəsizlik balı **{score:.0f}/100**. |
| `narr_intro` | Most likely path **{pid}** (likelihood {lik:.1%}) towards `{goal}`: | Ən ehtimal olunan yol **{pid}** (ehtimal {likc}%), hədəf `{goal}`: |
| `narr_none` | No path reaches a goal in this scenario. | Bu ssenaridə heç bir yol hədəfə çatmır. |
| `step` | - **{sid}** `{frm}` → `{to}` — {technique}{vuln} (p={p:.2f}): {reason} | - **{sid}** `{frm}` → `{to}` — {technique}{vuln} (p={p:.2f}): {reason} |
| `impact_body` | The primary path ends at `{goal}` with impact factor {imp:.2f} (criticality × data sensitivity). Highest modelled asset risk: {top}. | Əsas yol `{goal}` hədəfində bitir; təsir əmsalı {imp:.2f} (kritiklik × məlumatın həssaslığı). Modeldə ən yüksək aktiv riski: {top}. |
| `impact_none` | No modelled business impact for this scenario at this revision. | Bu versiyada bu ssenari üçün modelləşdirilmiş biznes təsiri yoxdur. |
| `remed_item` | {i}. `{vuln}` — fix `{action}`: expected score +{d:.1f} (→ {after:.0f}) | {i}. `{vuln}` — düzəliş `{action}`: gözlənilən bal +{d:.1f} (→ {after:.0f}) |
| `remed_none` | No remediation changes the score for this scenario. | Bu ssenaridə balı dəyişən düzəliş yoxdur. |
| `best_items` | - Never expose administrative services (SSH/RDP) to the internet; restrict them to a management zone.<br>- Enforce MFA and strong, rotated passwords for service accounts; prefer managed service accounts.<br>- Apply least privilege: service accounts should not hold admin rights on data stores.<br>- Segment zones so that a DMZ host cannot initiate connections to identity and data tiers.<br>- Keep software within vendor support; patch end-of-life components. | - İnzibati servisləri (SSH/RDP) internetə açmayın; onları yalnız idarəetmə zonası ilə məhdudlaşdırın.<br>- Servis hesabları üçün MFA və mütəmadi dəyişdirilən güclü parollar tətbiq edin.<br>- Minimal imtiyaz prinsipi: servis hesabları məlumat anbarlarında admin hüquqlarına malik olmamalıdır.<br>- Zonaları ayırın: DMZ-dəki host identifikasiya və məlumat qatlarına bağlantı başlada bilməməlidir.<br>- Proqram təminatını istehsalçının dəstəyi müddətində saxlayın; dəstəyi bitmiş komponentləri yeniləyin. |
| `cmp_body` | Score r{b_rev} **{before:.0f}** → r{a_rev} **{after:.0f}** ({delta:+.1f}). Blocked paths: {blocked}, reduced: {reduced}, new: {new}. | Bal r{b_rev} **{before:.0f}** → r{a_rev} **{after:.0f}** ({delta:+.1f}). Bağlanmış yollar: {blocked}, azalmış: {reduced}, yeni: {new}. |
| `notice` | _Generated by the deterministic template renderer from simulation data on a virtual model._ | _Virtual model üzərindəki simulyasiya məlumatlarından deterministik şablonla yaradılıb._ |

## Chat answers without a model

| Key | English | Azerbaijani |
|---|---|---|
| `no_sim` | There is no simulation yet for this twin. | Bu əkiz üçün hələ simulyasiya yoxdur. |
| `score` | Score | Bal |
| `no_answer` | I can only answer from the model and simulation data. Ask about an asset or vulnerability id, the score, the attack path or what to fix first. | Yalnız model və simulyasiya məlumatlarına əsasən cavab verə bilərəm. Aktiv və ya zəiflik identifikatoru, bal, hücum yolu və ya ilk növbədə nəyin düzəldiləcəyi barədə soruşun. |

## AI section titles and technique names (structured output)

| Key | English | Azerbaijani |
|---|---|---|
| `section.executive_summary` | Executive summary | Rəhbərlik üçün xülasə |
| `section.attack_narrative` | Attack narrative | Hücumun gedişatı |
| `section.business_impact` | Business impact | Biznesə təsir |
| `section.prioritized_remediation` | Prioritized remediation | Prioritetləşdirilmiş düzəlişlər |
| `section.best_practices` | Best practices | Ən yaxşı təcrübələr |
| `section.before_after` | Before/after comparison | Əvvəl/sonra müqayisəsi |
| `technique.reach` | network reach | şəbəkə əlçatanlığı |
| `technique.remote_exploit` | remote exploit | uzaqdan istismar |
| `technique.brute_force` | password guessing | parolun təxmin edilməsi |
| `technique.kerberoast` | Kerberoasting | Kerberoasting |
| `technique.credential_theft` | credential dumping | giriş məlumatlarının çıxarılması |
| `technique.credential_use` ⚠️ | valid account use | etibarlı hesabdan istifadə |
| `technique.local_privesc` | local privilege escalation | lokal imtiyaz yüksəltmə |
| `technique.trust_abuse` | trust abuse | etibardan sui-istifadə |
| `technique.permission_abuse` | stored credential abuse | saxlanmış giriş məlumatından sui-istifadə |
| `technique.data_access` | data access | məlumata giriş |
| `technique.domain_takeover` | domain takeover | domenin ələ keçirilməsi |

## Instruction to the language model

| Key | English | Azerbaijani |
|---|---|---|
| `lang` | Write all text values in English. | Write all text values in Azerbaijani (Latin script), not Turkish: use ə and Azerbaijani words and grammar. Bütün mətn dəyərlərini Azərbaycan dilində yaz. İdentifikatorları və yer tutucuları ({{...}}) dəyişmə. |

# Printable report

| Key | English | Azerbaijani |
|---|---|---|
| `print` | Print / Save as PDF | Çap et / PDF kimi saxla |
| `title` | CyberTwin security report | CyberTwin təhlükəsizlik hesabatı |
| `revision` | Revision | Versiya |
| `simulation` | simulation | simulyasiya |
| `badge` | SIMULATION MODE · Virtual model only. | SİMULYASİYA REJİMİ · Yalnız virtual model. |
| `disclaimer` | Simulation on a virtual model. No real systems were scanned or tested. CVE identifiers are illustrative. | Virtual model üzərində simulyasiya. Heç bir real sistem skan edilməyib və ya sınaqdan keçirilməyib. CVE identifikatorları nümunəvidir. |
| `score` | Security score | Təhlükəsizlik balı |
| `blast` | Blast radius | Təsir radiusu |
| `paths` | Attack paths | Hücum yolları |
| `scenario` | Scenario | Ssenari |
| `entry` | entry | giriş nöqtəsi |
| `goal` | Goal | Hədəf |
| `likelihood` | Likelihood | Ehtimal |
| `risk` | Risk | Risk |
| `steps` | Steps | Addımlar |
| `no_paths` | No attack path reaches a goal. | Heç bir hücum yolu hədəfə çatmır. |
| `findings` | Findings | Zəifliklər |
| `severity` | Severity | Ciddilik |
| `finding_title` | Title | Başlıq |
| `delta` | Δscore if fixed | Düzəldilsə Δbal |
| `no_findings` | No findings on any path. | Heç bir yolda zəiflik yoxdur. |
| `illustrative` | illustrative | nümunəvi |
| `residual` | Residual exposure | Qalıq risk |
| `residual_none` | None: every finding is fixed or on a reachable path. | Yoxdur: hər zəiflik ya düzəldilib, ya da əlçatan yoldadır. |
| `residual_note` | Present in the model but not exploitable in this scenario; not counted in the score. | Modeldə var, lakin bu ssenaridə istismar edilə bilmir; bala daxil edilmir. |
| `applied` | Applied fixes | Tətbiq edilmiş düzəlişlər |
| `none` | None | Yoxdur |
| `summary` | Analyst summary | Analitik xülasəsi |
| `sev.critical` | critical | kritik |
| `sev.high` | high | yüksək |
| `sev.medium` | medium | orta |
| `sev.low` | low | aşağı |
| `months` | January February March April May June July August September October November December | yanvar fevral mart aprel may iyun iyul avqust sentyabr oktyabr noyabr dekabr |
