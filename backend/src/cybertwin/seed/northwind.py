"""Northwind Logistics: the demo twin. Fully virtual; every CVE reference is illustrative.

Topology (network links; only firewalls route traffic between hosts):

    inet -- fw-edge -- web-01 -- fw-int -- {idp-01, app-01, customer-db, ws-01, adm-ws}
                \\___________________/

Story the engine should find:
- fw-edge allows 22/tcp from anywhere to web-01, which runs an outdated OpenSSH.
- svc-web: weak password, no MFA, cached on web-01, trusted by idp-01, Kerberoastable,
  admin on customer-db (data_sensitivity 3).
- Side path: employee workstation ws-01 has a local privesc; IT admin credentials are cached there.
"""

from __future__ import annotations

from cybertwin.domain.model import (
    AccessLevel,
    Asset,
    AssetType,
    Connection,
    ConnectionKind,
    ExploitMaturity,
    FirewallRule,
    FixRef,
    OpenPort,
    Permission,
    Principal,
    PrincipalKind,
    Privilege,
    RuleAction,
    SecurityConfig,
    Software,
    Strength,
    TwinContent,
    Vulnerability,
    VulnKind,
    Zone,
)

SLUG = "northwind"
NAME = "Northwind Logistics"
DESCRIPTION = "northwind.description"  # i18n key; the UI renders it in the active language

P = OpenPort
S = Software


def _assets() -> list[Asset]:
    return [
        Asset(
            id="inet",
            name="Internet",
            ip="203.0.113.1",
            type=AssetType.INTERNET_GATEWAY,
            zone=Zone.INTERNET,
            criticality=1,
            data_sensitivity=0,
        ),
        Asset(
            id="fw-edge",
            name="Edge Firewall",
            ip="10.0.0.1",
            type=AssetType.FIREWALL,
            os="FortiOS 7.0",
            zone=Zone.DMZ,
            criticality=4,
            data_sensitivity=0,
            security_config=SecurityConfig(mfa=True, password_policy=Strength.STRONG),
        ),
        Asset(
            id="fw-int",
            name="Internal Firewall",
            ip="10.0.0.2",
            type=AssetType.FIREWALL,
            os="pfSense 2.7",
            zone=Zone.INTERNAL,
            criticality=4,
            data_sensitivity=0,
            security_config=SecurityConfig(mfa=True, password_policy=Strength.STRONG),
        ),
        Asset(
            id="web-01",
            name="Public Web Server",
            ip="10.0.1.10",
            type=AssetType.WEB_SERVER,
            os="Ubuntu 20.04 LTS",
            zone=Zone.DMZ,
            criticality=3,
            data_sensitivity=1,
            open_ports=(
                P(port=22, service="ssh", version="OpenSSH 8.2p1"),
                P(port=443, service="https", version="nginx 1.18.0"),
            ),
            software=(
                S(name="OpenSSH", version="8.2p1", eol=True),
                S(name="nginx", version="1.18.0", eol=True),
            ),
            security_config=SecurityConfig(password_policy=Strength.WEAK, local_admins=("svc-web",)),
        ),
        Asset(
            id="idp-01",
            name="Identity Server",
            ip="10.0.2.10",
            type=AssetType.IDENTITY_SERVER,
            os="Windows Server 2019",
            zone=Zone.INTERNAL,
            criticality=5,
            data_sensitivity=1,
            open_ports=(
                P(port=88, service="kerberos"),
                P(port=389, service="ldap"),
                P(port=445, service="smb"),
                P(port=3389, service="rdp"),
            ),
            software=(S(name="Active Directory DS", version="2019"),),
            security_config=SecurityConfig(
                edr=True, password_policy=Strength.MEDIUM, local_admins=("adm-lchen",)
            ),
        ),
        Asset(
            id="app-01",
            name="App Server",
            ip="10.0.2.20",
            type=AssetType.APP_SERVER,
            os="Windows Server 2019",
            zone=Zone.INTERNAL,
            criticality=4,
            data_sensitivity=2,
            open_ports=(
                P(port=8080, service="http", version="Apache Tomcat 9.0.30"),
                P(port=445, service="smb"),
            ),
            software=(S(name="Apache Tomcat", version="9.0.30", eol=False),),
            security_config=SecurityConfig(edr=True, local_admins=("adm-lchen",)),
        ),
        Asset(
            id="customer-db",
            name="Customer Database",
            ip="10.0.3.10",
            type=AssetType.DB_SERVER,
            os="Windows Server 2016",
            zone=Zone.DATA,
            criticality=5,
            data_sensitivity=3,
            open_ports=(P(port=1433, service="mssql", version="SQL Server 2016"), P(port=445, service="smb")),
            software=(S(name="SQL Server", version="2016 SP2", eol=False),),
            security_config=SecurityConfig(edr=False, local_admins=("svc-web",)),
        ),
        Asset(
            id="ws-01",
            name="Employee Workstation",
            ip="10.0.4.21",
            type=AssetType.EMPLOYEE_WS,
            os="Windows 10 22H2",
            zone=Zone.INTERNAL,
            criticality=2,
            data_sensitivity=1,
            open_ports=(P(port=445, service="smb"),),
            software=(S(name="Print Spooler", version="10.0.19041"),),
            security_config=SecurityConfig(edr=True, password_policy=Strength.MEDIUM),
        ),
        Asset(
            id="adm-ws",
            name="Admin Workstation",
            ip="10.0.5.10",
            type=AssetType.ADMIN_WS,
            os="Windows 11 23H2",
            zone=Zone.MGMT,
            criticality=4,
            data_sensitivity=1,
            open_ports=(P(port=3389, service="rdp"),),
            security_config=SecurityConfig(
                mfa=True, edr=True, password_policy=Strength.STRONG, local_admins=("adm-lchen",)
            ),
        ),
    ]


def _connections() -> list[Connection]:
    net = ConnectionKind.NETWORK
    links = [
        ("inet", "fw-edge"),
        ("fw-edge", "web-01"),
        ("fw-edge", "fw-int"),
        ("web-01", "fw-int"),
        ("fw-int", "idp-01"),
        ("fw-int", "app-01"),
        ("fw-int", "customer-db"),
        ("fw-int", "ws-01"),
        ("fw-int", "adm-ws"),
    ]
    out = [Connection(id=f"n-{a}--{b}", source=a, target=b, kind=net) for a, b in links]
    out.append(
        Connection(
            id="t-web-01--idp-01",
            source="web-01",
            target="idp-01",
            kind=ConnectionKind.TRUST,
            label="svc-web delegation",
        )
    )
    return out


def _principals() -> list[Principal]:
    return [
        Principal(
            id="svc-web",
            name="svc-web",
            kind=PrincipalKind.SERVICE,
            privilege=Privilege.ADMIN,
            credential_strength=Strength.WEAK,
            mfa=False,
            kerberoastable=True,
            logged_on_assets=("web-01",),
            permissions=(
                Permission(asset_id="web-01", level=AccessLevel.USER),
                Permission(asset_id="customer-db", level=AccessLevel.ADMIN),
            ),
        ),
        Principal(
            id="svc-app",
            name="svc-app",
            kind=PrincipalKind.SERVICE,
            privilege=Privilege.USER,
            credential_strength=Strength.STRONG,
            mfa=False,
            kerberoastable=True,
            logged_on_assets=("app-01",),
            permissions=(
                Permission(asset_id="app-01", level=AccessLevel.USER),
                Permission(asset_id="customer-db", level=AccessLevel.USER),
            ),
        ),
        Principal(
            id="jdoe",
            name="Jordan Doe",
            kind=PrincipalKind.USER,
            privilege=Privilege.USER,
            credential_strength=Strength.MEDIUM,
            mfa=False,
            logged_on_assets=("ws-01",),
            permissions=(
                Permission(asset_id="ws-01", level=AccessLevel.USER),
                Permission(asset_id="app-01", level=AccessLevel.USER),
            ),
        ),
        Principal(
            id="adm-lchen",
            name="Lena Chen (IT admin)",
            kind=PrincipalKind.USER,
            privilege=Privilege.DOMAIN_ADMIN,
            credential_strength=Strength.MEDIUM,
            mfa=False,
            logged_on_assets=("ws-01", "adm-ws"),
            permissions=(
                Permission(asset_id="idp-01", level=AccessLevel.ADMIN),
                Permission(asset_id="adm-ws", level=AccessLevel.ADMIN),
                Permission(asset_id="app-01", level=AccessLevel.ADMIN),
                Permission(asset_id="ws-01", level=AccessLevel.ADMIN),
            ),
        ),
    ]


def _rules() -> list[FirewallRule]:
    allow, deny = RuleAction.ALLOW, RuleAction.DENY
    return [
        FirewallRule(
            id="edge-10",
            firewall_id="fw-edge",
            order=10,
            action=allow,
            src="any",
            dst="asset:web-01",
            port=443,
            description="Public HTTPS",
        ),
        FirewallRule(
            id="edge-20",
            firewall_id="fw-edge",
            order=20,
            action=allow,
            src="any",
            dst="asset:web-01",
            port=22,
            description="Legacy vendor SSH",
        ),
        FirewallRule(
            id="int-10",
            firewall_id="fw-int",
            order=10,
            action=allow,
            src="asset:web-01",
            dst="asset:idp-01",
            port=88,
            description="Web SSO (Kerberos)",
        ),
        FirewallRule(
            id="int-20",
            firewall_id="fw-int",
            order=20,
            action=allow,
            src="asset:web-01",
            dst="asset:idp-01",
            port=389,
            description="Web SSO (LDAP)",
        ),
        FirewallRule(
            id="int-30",
            firewall_id="fw-int",
            order=30,
            action=allow,
            src="asset:web-01",
            dst="asset:app-01",
            port=8080,
            description="Web to app API",
        ),
        FirewallRule(
            id="int-40",
            firewall_id="fw-int",
            order=40,
            action=allow,
            src="asset:web-01",
            dst="asset:customer-db",
            port=1433,
            description="Web reporting queries",
        ),
        FirewallRule(
            id="int-50",
            firewall_id="fw-int",
            order=50,
            action=allow,
            src="zone:internal",
            dst="zone:internal",
            description="Flat internal LAN",
        ),
        FirewallRule(
            id="int-60",
            firewall_id="fw-int",
            order=60,
            action=allow,
            src="zone:internal",
            dst="asset:customer-db",
            port=1433,
            description="Apps to database",
        ),
        FirewallRule(
            id="int-70",
            firewall_id="fw-int",
            order=70,
            action=allow,
            src="zone:mgmt",
            dst="any",
            description="Admin access",
        ),
        FirewallRule(
            id="int-90",
            firewall_id="fw-int",
            order=90,
            action=deny,
            src="zone:dmz",
            dst="any",
            description="Block other DMZ traffic",
        ),
    ]


def _vulns() -> list[Vulnerability]:
    return [
        Vulnerability(
            id="v-openssh-web01",
            cve="CVE-2023-38408",
            title="OpenSSH remote code execution",
            cvss=9.8,
            exploit_maturity=ExploitMaturity.FUNCTIONAL,
            kind=VulnKind.REMOTE_EXPLOIT,
            asset_id="web-01",
            port=22,
            grants=AccessLevel.USER,
            attack_ids=("T1190", "T1210"),
            fixed_by=FixRef(software="OpenSSH", version="9.8p1"),
        ),
        Vulnerability(
            id="v-nginx-web01",
            cve="CVE-2021-23017",
            title="nginx resolver off-by-one",
            cvss=7.7,
            exploit_maturity=ExploitMaturity.POC,
            kind=VulnKind.REMOTE_EXPLOIT,
            asset_id="web-01",
            port=443,
            grants=AccessLevel.USER,
            attack_ids=("T1190",),
            fixed_by=FixRef(software="nginx", version="1.26.2"),
        ),
        Vulnerability(
            id="v-tomcat-app01",
            cve="CVE-2020-1938",
            title="Tomcat AJP file inclusion",
            cvss=7.5,
            exploit_maturity=ExploitMaturity.FUNCTIONAL,
            kind=VulnKind.REMOTE_EXPLOIT,
            asset_id="app-01",
            port=8080,
            grants=AccessLevel.USER,
            attack_ids=("T1190",),
            fixed_by=FixRef(software="Apache Tomcat", version="9.0.98"),
        ),
        Vulnerability(
            id="v-spooler-ws01",
            cve="CVE-2021-34527",
            title="Print Spooler privilege escalation",
            cvss=8.8,
            exploit_maturity=ExploitMaturity.HIGH,
            kind=VulnKind.LOCAL_PRIVESC,
            asset_id="ws-01",
            grants=AccessLevel.ADMIN,
            attack_ids=("T1068",),
            fixed_by=FixRef(software="Print Spooler", version="10.0.19041.1083"),
        ),
    ]


def northwind_content() -> TwinContent:
    return TwinContent(
        assets=tuple(_assets()),
        connections=tuple(_connections()),
        principals=tuple(_principals()),
        firewall_rules=tuple(_rules()),
        vulnerabilities=tuple(_vulns()),
    ).normalized()


# Default map layout (x, y) so the first render is readable; stored in node_positions.
# Compact enough that the whole graph fits a 1280px-wide screen at the minimum readable zoom.
POSITIONS: dict[str, tuple[float, float]] = {
    "inet": (0.0, 230.0),
    "fw-edge": (150.0, 230.0),
    "web-01": (300.0, 95.0),
    "fw-int": (450.0, 230.0),
    "idp-01": (600.0, 20.0),
    "app-01": (600.0, 160.0),
    "customer-db": (750.0, 95.0),
    "ws-01": (600.0, 300.0),
    "adm-ws": (750.0, 370.0),
}
