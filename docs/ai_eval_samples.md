### qwen2.5:7b · credential_compromise · en

## Executive summary
The scenario 'Credential Compromise' for the twin 'northwind' has a final score of 64.59, indicating a moderate risk.
The highest likelihood path (Path 1) involves an attacker compromising credentials through SSH exposure and Kerberos brute-forcing.
Key vulnerabilities include exposed SSH services on web-01 and weak passwords for service accounts like 'svc-deploy' and 'j-doe'.

## Attack narrative
**P1** The attacker starts by exploiting the exposed SSH service on web-01 to gain access as 'svc-deploy'. From there, they use Kerberos brute-forcing to obtain 'j-doe' credentials. This path has a likelihood of 29.79% and a risk of 9.86%. It is the most probable route for credential compromise.
- **P1.S1** _[network reach]_ internet can reach web-01 tcp/22 (ssh OpenSSH_7.2p2) via fw-edge
- **P1.S2** _[password guessing]_ Guess medium password of 'svc-deploy' on web-01 ssh/22 (no MFA)
**P2** The attacker gains access through SSH on web-01 as 'svc-deploy' and uses LDAPS brute-forcing to obtain 'j-doe' credentials. This path has a likelihood of 14.89% and a risk of 4.97%. It is the second most probable route.
- **P2.S1** _[network reach]_ internet can reach web-01 tcp/22 (ssh OpenSSH_7.2p2) via fw-edge
- **P2.S2** _[password guessing]_ Guess medium password of 'svc-deploy' on web-01 ssh/22 (no MFA)
- **P2.S3** _[valid account use]_ Log on to web-01 as 'svc-deploy' (write)
- **P2.S4** _[network reach]_ web-01 can reach idp-01 tcp/636 (ldaps) via fw-edge
- **P2.S5** _[password guessing]_ Guess medium password of 'j-doe' on idp-01 ldaps/636 (no MFA)
- **P2.S6** _[valid account use]_ Log on to idp-01 as 'j-doe' (read)
- **P2.S7** _[Kerberoasting]_ Request a service ticket for 'svc-web' from idp-01 and crack its weak password offline
**P3** The attacker gains access through SSH on web-01 as 'svc-deploy' and uses Kerberos brute-forcing to obtain 'j-doe' credentials. This path has a likelihood of 14.89% and a risk of 4.97%. It is the third most probable route.
- **P3.S1** _[network reach]_ internet can reach web-01 tcp/22 (ssh OpenSSH_7.2p2) via fw-edge
- **P3.S2** _[password guessing]_ Guess medium password of 'svc-deploy' on web-01 ssh/22 (no MFA)
- **P3.S3** _[valid account use]_ Log on to web-01 as 'svc-deploy' (write)
- **P3.S4** _[network reach]_ web-01 can reach idp-01 tcp/88 (kerberos) via fw-edge
- **P3.S5** _[password guessing]_ Guess medium password of 'j-doe' on idp-01 kerberos/88 (no MFA)
- **P3.S6** _[valid account use]_ Log on to idp-01 as 'j-doe' (read)
- **P3.S7** _[Kerberoasting]_ Request a service ticket for 'svc-web' from idp-01 and crack its weak password offline

## Business impact
Compromise of 'j-doe' credentials could lead to unauthorized access to sensitive data or systems, potentially resulting in data breaches.
Compromise of 'svc-deploy' credentials could allow an attacker to perform administrative actions on web-01, leading to further damage.

## Prioritized remediation
1. `vuln-ssh-exposed` → `restrict_port:web-01:22:mgmt`: Restrict SSH access on web-01 to management IPs only. This will prevent unauthorized access through the exposed SSH service.
2. `vuln-ssh-exposed` → `restrict_port:web-01:22:mgmt`: Implement strong password policies for all service accounts, especially 'svc-deploy' and 'j-doe'.

## Best practices
- Regularly update and patch systems to address known vulnerabilities.
- Use multi-factor authentication (MFA) for critical services and administrative access.



### qwen2.5:7b · lateral_movement · en

## Executive summary
The security assessment of the Northwind Twin scenario reveals a significant risk of lateral movement within the network, primarily due to outdated SSH services and weak credential management.
The most critical vulnerabilities are: an exposed SSH service on web-01 (vulnerability ID: vuln-ssh-exposed) with pre-auth remote code execution capabilities, and Kerberos keytab caching without proper password protection (vulnerability ID: vuln-svcweb-weakpw).
These vulnerabilities allow for a multi-step attack vector that can lead to unauthorized access to sensitive systems such as customer-db. The overall risk score is 6.63 out of 10, indicating a high level of potential impact.

## Attack narrative
**P1** An attacker starts from the workstation ws-emp-01 and gains administrative access to web-01 via local privilege escalation (vulnerability ID: vuln-ws-privesc). From there, they exploit an outdated SSH service on web-01 for remote code execution (vulnerability ID: vuln-ssh-rce) to gain admin access. They then use the compromised credentials to request a service ticket from idp-01 and crack the weak password of svc-web's keytab (vulnerability ID: vuln-svcweb-weakpw). Finally, they log into customer-db as svc-web with administrative privileges (vulnerability ID: vuln-svcweb-dbadmin).
- **P1.S1** _[network reach]_ ws-emp-01 can reach web-01 tcp/22 (ssh OpenSSH_7.2p2) via fw-edge
- **P1.S2** _[remote exploit]_ Exploit Outdated OpenSSH 7.2p2: pre-auth remote code execution on web-01:22 -> admin
- **P1.S3** _[trust abuse]_ Abuse trust web-01 -> idp-01 as 'svc-web': svc-web Kerberos keytab cached on web-01; trusted by the identity server
- **P1.S4** _[Kerberoasting]_ Request a service ticket for 'svc-web' from idp-01 and crack its weak password offline
- **P1.S5** _[valid account use]_ Log on to customer-db as 'svc-web' (admin)
**P2** An attacker starts from the workstation ws-emp-01 and gains administrative access to web-01 via local privilege escalation. They then exploit an outdated SSH service on web-01 for remote code execution, gaining admin access. From there, they use a compromised credential (adm-app) to gain admin access to app-01. Using the reach technique, they move from app-01 to web-01 and then to customer-db via the same SSH vulnerability.
- **P2.S1** _[local privilege escalation]_ Escalate to admin on ws-emp-01 via Print spooler local privilege escalation
- **P2.S2** _[credential dumping]_ Dump cached credentials of 'j-doe' from ws-emp-01
- **P2.S3** _[valid account use]_ Log on to idp-01 as 'j-doe' (read)
- **P2.S4** _[Kerberoasting]_ Request a service ticket for 'svc-web' from idp-01 and crack its weak password offline
- **P2.S5** _[valid account use]_ Log on to customer-db as 'svc-web' (admin)
**P3** An attacker starts from the workstation ws-emp-01 and gains administrative access to web-01 through local privilege escalation. They exploit an outdated SSH service on web-01 for remote code execution, gaining admin access. Using a compromised credential (svc-web) with Kerberos keytab caching, they request a service ticket from idp-01 and crack the weak password of svc-web's keytab to log into customer-db as svc-web.
- **P3.S1** _[local privilege escalation]_ Escalate to admin on ws-emp-01 via Print spooler local privilege escalation
- **P3.S2** _[network reach]_ ws-emp-01 can reach web-01 tcp/22 (ssh OpenSSH_7.2p2) via fw-edge
- **P3.S3** _[remote exploit]_ Exploit Outdated OpenSSH 7.2p2: pre-auth remote code execution on web-01:22 -> admin
- **P3.S4** _[trust abuse]_ Abuse trust web-01 -> idp-01 as 'svc-web': svc-web Kerberos keytab cached on web-01; trusted by the identity server
- **P3.S5** _[Kerberoasting]_ Request a service ticket for 'svc-web' from idp-01 and crack its weak password offline
- **P3.S6** _[valid account use]_ Log on to customer-db as 'svc-web' (admin)

## Business impact
Financial Loss: Potential data breaches could result in financial losses due to theft or misuse of sensitive information.
Reputational Damage: A security breach can severely damage the company’s reputation, leading to loss of customers and business partners.
Operational Disruption: Compromised systems may lead to operational disruptions, affecting service delivery and productivity.

## Prioritized remediation
1. `vuln-ssh-exposed` → `restrict_port:web-01:22:mgmt`: Restrict SSH access to the management network only for web-01.
2. `vuln-svcweb-weakpw` → `enforce_mfa:svc-web`: Enforce multi-factor authentication (MFA) for svc-web's Kerberos keytab.
3. `vuln-ws-privesc` → `apply_patch:vuln-ws-privesc`: Apply the latest security patches to ws-emp-01 to prevent local privilege escalation.

## Best practices
- Implement strict access controls and least privilege principles.
- Regularly update and patch all systems to address known vulnerabilities.
- Use strong, unique passwords or passphrases for all accounts.
- Enable multi-factor authentication (MFA) wherever possible.
- Conduct regular security audits and penetration testing.



### qwen2.5:7b · privilege_escalation · en

## Executive summary
The security assessment of the Northwind Twin scenario reveals a significant risk of privilege escalation, with a current score of 87.57 out of 100.
Key vulnerabilities include an unpatched SSH service on app-01 (vulnerable to brute force attacks) and misconfigured local admin access via print spooler services.
The most likely paths to achieve domain administrator privileges are through direct network reachability or exploiting cached credentials from compromised accounts.

## Attack narrative
**P1** An attacker with user-level access on ws-emp-01 can escalate privileges by leveraging the print spooler service to gain administrative rights, then use these credentials to take control of app-01 and eventually the domain controller idp-01.
- **P1.S1** _[local privilege escalation]_ Escalate to admin on ws-emp-01 via Print spooler local privilege escalation
- **P1.S2** _[credential dumping]_ Dump cached credentials of 'adm-app' from ws-emp-01
- **P1.S3** _[valid account use]_ Log on to app-01 as 'adm-app' (admin)
- **P1.S4** _[credential dumping]_ Dump cached credentials of 'it-admin' from app-01
- **P1.S5** _[domain takeover]_ 'it-admin' is a domain admin - MFA challenge
**P2** A more indirect approach involves an attacker guessing a medium-strength password for 'adm-app' on app-01 via brute force attacks. Once access is gained, they can escalate privileges to admin level and proceed with the same steps as P1.
- **P2.S1** _[local privilege escalation]_ Escalate to admin on ws-emp-01 via Print spooler local privilege escalation
- **P2.S2** _[credential dumping]_ Dump cached credentials of 'adm-app' from ws-emp-01
- **P2.S3** _[valid account use]_ Log on to app-01 as 'adm-app' (admin)
- **P2.S4** _[credential dumping]_ Dump cached credentials of 'it-admin' from app-01
- **P2.S5** _[valid account use]_ Log on to idp-01 as 'it-admin' (admin) - MFA challenge
- **P2.S6** _[domain takeover]_ Admin on identity server idp-01 controls the domain
**P3** This path focuses on exploiting cached credentials from a compromised account (adm-app) to gain administrative rights on app-01, then using those credentials to take control of idp-01 and ultimately the domain controller.
- **P3.S1** _[local privilege escalation]_ Escalate to admin on ws-emp-01 via Print spooler local privilege escalation
- **P3.S2** _[credential dumping]_ Dump cached credentials of 'adm-app' from ws-emp-01
- **P3.S3** _[valid account use]_ Log on to app-01 as 'adm-app' (admin)
- **P3.S4** _[credential dumping]_ Dump cached credentials of 'it-admin' from app-01
- **P3.S5** _[valid account use]_ Log on to idp-01 as 'it-admin' (admin) - MFA challenge

## Business impact
Loss of sensitive data
Unauthorized access to critical systems
Potential for lateral movement within the network

## Prioritized remediation
1. `vuln-ws-privesc` → `apply_patch:vuln-ws-privesc`: Apply security patches and updates to all systems, particularly those running unpatched services like SSH.
2. `vuln-ws-privesc` → `apply_patch:vuln-ws-privesc`: Implement strong password policies and multi-factor authentication (MFA) for administrative accounts to mitigate brute force attacks.
3. `vuln-ws-privesc` → `apply_patch:vuln-ws-privesc`: Restrict access to critical services such as the print spooler and ensure that only authorized personnel have administrative rights.

## Best practices
- Regularly update and patch all systems to address known vulnerabilities.
- Implement robust password policies, including complexity requirements and regular rotation.
- Enable multi-factor authentication (MFA) for all critical accounts and services.
- Limit administrative access to only those who absolutely need it.



### qwen2.5:7b · sensitive_data_exposure · en

## Executive summary
The scenario 'Sensitive Data Exposure' for the twin 'northwind' involves multiple potential attack paths that could lead to unauthorized access and exposure of sensitive data in the customer database.
The highest risk path (Path 1) has a likelihood score of 24.54, indicating a significant threat level.
Key vulnerabilities include an exposed SSH service on web-01 with outdated OpenSSH version (vulnerable to pre-auth remote code execution), weak passwords for LDAP and Kerberos services, and the use of a service account ('svc-web') with administrative rights in the customer database.

## Attack narrative
**P1** The attacker exploits an exposed SSH service on web-01 to gain admin access. This is followed by Kerberoasting to obtain 'svc-web' credentials, which are then used to read sensitive data from the customer database.
- **P1.S1** _[network reach]_ internet can reach web-01 tcp/22 (ssh OpenSSH_7.2p2) via fw-edge
- **P1.S2** _[remote exploit]_ Exploit Outdated OpenSSH 7.2p2: pre-auth remote code execution on web-01:22 -> admin
- **P1.S3** _[trust abuse]_ Abuse trust web-01 -> idp-01 as 'svc-web': svc-web Kerberos keytab cached on web-01; trusted by the identity server
- **P1.S4** _[Kerberoasting]_ Request a service ticket for 'svc-web' from idp-01 and crack its weak password offline
- **P1.S5** _[data access]_ Read data on customer-db with 'svc-web' admin rights
**P2** Similar to Path 1, but with a slightly lower likelihood score due to an additional step involving brute-forcing a medium-strength password on the LDAP service. The attacker uses these credentials to obtain 'svc-web' credentials and access sensitive data.
- **P2.S1** _[network reach]_ internet can reach web-01 tcp/22 (ssh OpenSSH_7.2p2) via fw-edge
- **P2.S2** _[remote exploit]_ Exploit Outdated OpenSSH 7.2p2: pre-auth remote code execution on web-01:22 -> admin
- **P2.S3** _[trust abuse]_ Abuse trust web-01 -> idp-01 as 'svc-web': svc-web Kerberos keytab cached on web-01; trusted by the identity server
- **P2.S4** _[Kerberoasting]_ Request a service ticket for 'svc-web' from idp-01 and crack its weak password offline
- **P2.S5** _[valid account use]_ Log on to customer-db as 'svc-web' (admin)
- **P2.S6** _[data access]_ Admin on customer-db reads its data (sensitivity 3)
**P3** The attacker gains admin access via SSH exploitation, Kerberoasts for 'svc-web' credentials, and then accesses the customer database using those credentials. This path has a slightly lower likelihood score compared to Path 1 due to an additional step involving brute-forcing a medium-strength password on the LDAP service.
- **P3.S1** _[network reach]_ internet can reach web-01 tcp/22 (ssh OpenSSH_7.2p2) via fw-edge
- **P3.S2** _[remote exploit]_ Exploit Outdated OpenSSH 7.2p2: pre-auth remote code execution on web-01:22 -> admin
- **P3.S3** _[network reach]_ web-01 can reach idp-01 tcp/636 (ldaps) via fw-edge
- **P3.S4** _[password guessing]_ Guess medium password of 'j-doe' on idp-01 ldaps/636 (no MFA)
- **P3.S5** _[valid account use]_ Log on to idp-01 as 'j-doe' (read)
- **P3.S6** _[Kerberoasting]_ Request a service ticket for 'svc-web' from idp-01 and crack its weak password offline
- **P3.S7** _[data access]_ Read data on customer-db with 'svc-web' admin rights

## Business impact
Financial Loss: Unauthorized access could lead to data breaches, resulting in financial losses from fines, legal fees, and loss of customer trust.
Reputational Damage: A data breach can severely damage the company's reputation, leading to a decline in customer loyalty and market share.
Operational Disruption: The incident may require significant resources for investigation, containment, and recovery, disrupting normal business operations.

## Prioritized remediation
1. `vuln-ssh-exposed` → `restrict_port:web-01:22:mgmt`: Restrict SSH access to web-01 on port 22 for management purposes only, and ensure it is not exposed publicly.
2. `vuln-ssh-exposed` → `restrict_port:web-01:22:mgmt`: Update the OpenSSH service on web-01 to a secure version, addressing known vulnerabilities.
3. `vuln-ssh-exposed` → `restrict_port:web-01:22:mgmt`: Implement strong password policies for all services, including LDAP and Kerberos, to mitigate brute-forcing attacks.
4. `vuln-ssh-exposed` → `restrict_port:web-01:22:mgmt`: Limit the privileges of service accounts like 'svc-web' to reduce the impact if compromised.

## Best practices
- Regularly update and patch all systems to address known vulnerabilities.
- Implement multi-factor authentication (MFA) for critical services and administrative access.
- Conduct regular security audits and penetration testing to identify and remediate potential weaknesses.
- Educate employees on secure password practices and the importance of strong, unique passwords.



### qwen2.5:7b · sensitive_data_exposure · tr

## Yönetici özeti
The scenario 'Sensitive Data Exposure' for the twin 'northwind' involves multiple potential attack paths that could lead to unauthorized access and exposure of sensitive data in the customer database.
The highest risk path (Path 1) has a likelihood score of 24.54, indicating a significant threat level.
Key vulnerabilities include an exposed SSH service on web-01 with outdated OpenSSH version (vulnerable to pre-auth remote code execution), weak passwords for LDAP and Kerberos services, and the use of a service account ('svc-web') with administrative rights in the customer database.

## Saldırı anlatımı
**P1** The attacker exploits an exposed SSH service on web-01 to gain admin access. This is followed by Kerberoasting to obtain 'svc-web' credentials, which are then used to read sensitive data from the customer database.
- **P1.S1** _[ağ erişimi]_ internet can reach web-01 tcp/22 (ssh OpenSSH_7.2p2) via fw-edge
- **P1.S2** _[uzaktan istismar]_ Exploit Outdated OpenSSH 7.2p2: pre-auth remote code execution on web-01:22 -> admin
- **P1.S3** _[güven ilişkisi istismarı]_ Abuse trust web-01 -> idp-01 as 'svc-web': svc-web Kerberos keytab cached on web-01; trusted by the identity server
- **P1.S4** _[Kerberoasting]_ Request a service ticket for 'svc-web' from idp-01 and crack its weak password offline
- **P1.S5** _[veri erişimi]_ Read data on customer-db with 'svc-web' admin rights
**P2** Similar to Path 1, but with a slightly lower likelihood score due to an additional step involving brute-forcing a medium-strength password on the LDAP service. The attacker uses these credentials to obtain 'svc-web' credentials and access sensitive data.
- **P2.S1** _[ağ erişimi]_ internet can reach web-01 tcp/22 (ssh OpenSSH_7.2p2) via fw-edge
- **P2.S2** _[uzaktan istismar]_ Exploit Outdated OpenSSH 7.2p2: pre-auth remote code execution on web-01:22 -> admin
- **P2.S3** _[güven ilişkisi istismarı]_ Abuse trust web-01 -> idp-01 as 'svc-web': svc-web Kerberos keytab cached on web-01; trusted by the identity server
- **P2.S4** _[Kerberoasting]_ Request a service ticket for 'svc-web' from idp-01 and crack its weak password offline
- **P2.S5** _[geçerli hesap kullanımı]_ Log on to customer-db as 'svc-web' (admin)
- **P2.S6** _[veri erişimi]_ Admin on customer-db reads its data (sensitivity 3)
**P3** The attacker gains admin access via SSH exploitation, Kerberoasts for 'svc-web' credentials, and then accesses the customer database using those credentials. This path has a slightly lower likelihood score compared to Path 1 due to an additional step involving brute-forcing a medium-strength password on the LDAP service.
- **P3.S1** _[ağ erişimi]_ internet can reach web-01 tcp/22 (ssh OpenSSH_7.2p2) via fw-edge
- **P3.S2** _[uzaktan istismar]_ Exploit Outdated OpenSSH 7.2p2: pre-auth remote code execution on web-01:22 -> admin
- **P3.S3** _[ağ erişimi]_ web-01 can reach idp-01 tcp/636 (ldaps) via fw-edge
- **P3.S4** _[parola tahmini]_ Guess medium password of 'j-doe' on idp-01 ldaps/636 (no MFA)
- **P3.S5** _[geçerli hesap kullanımı]_ Log on to idp-01 as 'j-doe' (read)
- **P3.S6** _[Kerberoasting]_ Request a service ticket for 'svc-web' from idp-01 and crack its weak password offline
- **P3.S7** _[veri erişimi]_ Read data on customer-db with 'svc-web' admin rights

## İş etkisi
Financial Loss: Unauthorized access could lead to data breaches, resulting in financial losses from fines, legal fees, and loss of customer trust.
Reputational Damage: A data breach can severely damage the company's reputation, leading to a decline in customer loyalty and market share.
Operational Disruption: The incident may require significant resources for investigation, containment, and recovery, disrupting normal business operations.

## Önceliklendirilmiş iyileştirme
1. `vuln-ssh-exposed` → `restrict_port:web-01:22:mgmt`: Restrict SSH access to web-01 on port 22 for management purposes only, and ensure it is not exposed publicly.
2. `vuln-ssh-exposed` → `restrict_port:web-01:22:mgmt`: Update the OpenSSH service on web-01 to a secure version, addressing known vulnerabilities.
3. `vuln-ssh-exposed` → `restrict_port:web-01:22:mgmt`: Implement strong password policies for all services, including LDAP and Kerberos, to mitigate brute-forcing attacks.
4. `vuln-ssh-exposed` → `restrict_port:web-01:22:mgmt`: Limit the privileges of service accounts like 'svc-web' to reduce the impact if compromised.

## En iyi uygulamalar
- Regularly update and patch all systems to address known vulnerabilities.
- Implement multi-factor authentication (MFA) for critical services and administrative access.
- Conduct regular security audits and penetration testing to identify and remediate potential weaknesses.
- Educate employees on secure password practices and the importance of strong, unique passwords.



### qwen2.5:7b · outdated_service_exploitation · en

## Executive summary
The simulation indicates a critical risk to the virtual organization, with a breach probability of 49.2% and a blast radius of 12.5%.
The most likely path has a likelihood of 92.2% and a risk score of 0.492, involving two steps: reaching web-01 via SSH on port 22 from the internet, followed by exploiting Outdated OpenSSH 7.2p2 for remote code execution.

## Attack narrative
**P1** The attacker starts at the internet and reaches web-01 through SSH (port 22) via the firewall edge device, then exploits a known vulnerability to gain administrative access.
- **P1.S1** _[network reach]_ internet can reach web-01 tcp/22 (ssh OpenSSH_7.2p2) via fw-edge
- **P1.S2** _[remote exploit]_ Exploit Outdated OpenSSH 7.2p2: pre-auth remote code execution on web-01:22 -> admin

## Business impact
Compromised assets include 1 out of 8 total assets, with the highest risk being on web-01 (49).

## Prioritized remediation
1. `vuln-ssh-exposed` → `restrict_port:web-01:22:mgmt`: Restrict SSH access to web-01 from the internet by closing port 22 on the firewall edge device. This action will reduce the score after remediation by +49.2 to 100.0.
2. `vuln-ssh-rce` → `apply_patch:vuln-ssh-rce`: Apply the necessary patch for Outdated OpenSSH 7.2p2 on web-01 to mitigate remote code execution vulnerabilities, reducing the score after remediation by +49.2 to 100.0.
3. `vuln-ssh-exposed` → `restrict_port:web-01:22:mgmt`: Enforce multi-factor authentication (MFA) on the admin application to reduce the risk of unauthorized access, but this action has no delta score change.
4. `vuln-ssh-rce` → `apply_patch:vuln-ssh-rce`: Reduce permissions for service web accessing customer database read operations to limit exposure, but this action has no delta score change.
5. `vuln-ssh-exposed` → `restrict_port:web-01:22:mgmt`: Enforce MFA on the svc-web application for additional security, but this action has no delta score change.
6. `vuln-ssh-rce` → `apply_patch:vuln-ssh-rce`: Apply the necessary patch for Outdated OpenSSH 7.2p2 on web-01 to mitigate remote code execution vulnerabilities, reducing the score after remediation by +0.0 to 50.8.

## Best practices
- Regularly update and patch all critical services to prevent exploitation of known vulnerabilities.
- Implement strict access controls, including multi-factor authentication (MFA), on sensitive applications and systems.



### llama3.1 · credential_compromise · en

## Executive summary
The report is a simulation of a cyber attack on the Northwind company's network.
The attack is focused on credential compromise, with multiple paths to achieve this goal.
The report provides detailed information about each step in the attack, including the techniques used and the vulnerabilities exploited.

## Attack narrative
**P1** Attack path P1: Compromise of svc-deploy credentials via brute-force SSH login on web-01. Request a service ticket for svc-web from idp-01 using kerberoast attack on weak password of svc-web.
- **P1.S1** _[network reach]_ internet can reach web-01 tcp/22 (ssh OpenSSH_7.2p2) via fw-edge
- **P1.S2** _[password guessing]_ Guess medium password of 'svc-deploy' on web-01 ssh/22 (no MFA)
**P2** Attack path P2: Compromise of svc-deploy credentials via brute-force SSH login on web-01. Request a service ticket for svc-web from idp-01 using kerberoast attack on weak password of svc-web.
- **P2.S1** _[network reach]_ internet can reach web-01 tcp/22 (ssh OpenSSH_7.2p2) via fw-edge
- **P2.S2** _[password guessing]_ Guess medium password of 'svc-deploy' on web-01 ssh/22 (no MFA)
- **P2.S3** _[valid account use]_ Log on to web-01 as 'svc-deploy' (write)
- **P2.S4** _[network reach]_ web-01 can reach idp-01 tcp/636 (ldaps) via fw-edge
- **P2.S5** _[password guessing]_ Guess medium password of 'j-doe' on idp-01 ldaps/636 (no MFA)
- **P2.S6** _[valid account use]_ Log on to idp-01 as 'j-doe' (read)
- **P2.S7** _[Kerberoasting]_ Request a service ticket for 'svc-web' from idp-01 and crack its weak password offline
**P3** Attack path P3: Compromise of j-doe credentials via brute-force LDAPS login on idp-01.
- **P3.S1** _[network reach]_ internet can reach web-01 tcp/22 (ssh OpenSSH_7.2p2) via fw-edge
- **P3.S2** _[password guessing]_ Guess medium password of 'svc-deploy' on web-01 ssh/22 (no MFA)
- **P3.S3** _[valid account use]_ Log on to web-01 as 'svc-deploy' (write)
- **P3.S4** _[network reach]_ web-01 can reach idp-01 tcp/88 (kerberos) via fw-edge
- **P3.S5** _[password guessing]_ Guess medium password of 'j-doe' on idp-01 kerberos/88 (no MFA)
- **P3.S6** _[valid account use]_ Log on to idp-01 as 'j-doe' (read)
- **P3.S7** _[Kerberoasting]_ Request a service ticket for 'svc-web' from idp-01 and crack its weak password offline

## Business impact
The attack could result in unauthorized access to sensitive data and systems, leading to financial loss, reputational damage, and regulatory non-compliance.
The attackers may use the compromised credentials to move laterally within the network, escalating privileges and causing further damage.

## Prioritized remediation
1. `vuln-ssh-exposed` → `restrict_port:web-01:22:mgmt`: Restrict SSH access to web-01 to only management networks
2. `vuln-svcweb-weakpw` → `set_password_policy:svc-web:strong`: Enforce strong password policy for svc-web credentials

## Best practices
- Implement multi-factor authentication (MFA) to prevent brute-force attacks.
- Regularly review and update access controls, including user permissions and group memberships.
- Conduct regular security audits and penetration testing to identify vulnerabilities.



### llama3.1 · lateral_movement · en

## Executive summary
The report provides an analysis of the Northwind scenario, which involves a series of attacks on a network.
The attackers use various techniques to gain access to sensitive areas of the network and ultimately reach their goal of compromising the customer database.
The report highlights several key findings, including the use of lateral movement tactics, exploitation of vulnerabilities in OpenSSH, and abuse of trust relationships between systems.

## Attack narrative
**P1** Attackers gain access to web-01 through a vulnerable SSH server and escalate privileges using a remote code execution vulnerability. They then use the compromised account to reach customer-db via idp-01, which is trusted by the identity server.
- **P1.S1** _[network reach]_ ws-emp-01 can reach web-01 tcp/22 (ssh OpenSSH_7.2p2) via fw-edge
- **P1.S2** _[remote exploit]_ Exploit Outdated OpenSSH 7.2p2: pre-auth remote code execution on web-01:22 -> admin
- **P1.S3** _[trust abuse]_ Abuse trust web-01 -> idp-01 as 'svc-web': svc-web Kerberos keytab cached on web-01; trusted by the identity server
- **P1.S4** _[Kerberoasting]_ Request a service ticket for 'svc-web' from idp-01 and crack its weak password offline
- **P1.S5** _[valid account use]_ Log on to customer-db as 'svc-web' (admin)
**P2** Attackers exploit a local privilege escalation vulnerability on ws-emp-01 to gain admin access. They then dump cached credentials of adm-app and use them to log in to app-01 as an admin. From there, they reach web-01 via fw-edge and compromise it using the same remote code execution vulnerability.
- **P2.S1** _[local privilege escalation]_ Escalate to admin on ws-emp-01 via Print spooler local privilege escalation
- **P2.S2** _[credential dumping]_ Dump cached credentials of 'j-doe' from ws-emp-01
- **P2.S3** _[valid account use]_ Log on to idp-01 as 'j-doe' (read)
- **P2.S4** _[Kerberoasting]_ Request a service ticket for 'svc-web' from idp-01 and crack its weak password offline
- **P2.S5** _[valid account use]_ Log on to customer-db as 'svc-web' (admin)
**P3** Attackers exploit a local privilege escalation vulnerability on ws-emp-01 to gain admin access. They then dump cached credentials of adm-app and use them to log in to app-01 as an admin. From there, they reach web-01 via fw-edge and compromise it using the same remote code execution vulnerability.
- **P3.S1** _[local privilege escalation]_ Escalate to admin on ws-emp-01 via Print spooler local privilege escalation
- **P3.S2** _[network reach]_ ws-emp-01 can reach web-01 tcp/22 (ssh OpenSSH_7.2p2) via fw-edge
- **P3.S3** _[remote exploit]_ Exploit Outdated OpenSSH 7.2p2: pre-auth remote code execution on web-01:22 -> admin
- **P3.S4** _[trust abuse]_ Abuse trust web-01 -> idp-01 as 'svc-web': svc-web Kerberos keytab cached on web-01; trusted by the identity server
- **P3.S5** _[Kerberoasting]_ Request a service ticket for 'svc-web' from idp-01 and crack its weak password offline
- **P3.S6** _[valid account use]_ Log on to customer-db as 'svc-web' (admin)

## Business impact
The attackers' goal is to compromise the customer database, which would allow them to steal sensitive information about customers.
This could lead to financial losses for the company due to identity theft or other malicious activities.
Additionally, the breach of customer data could damage the company's reputation and erode trust with its customers.

## Prioritized remediation
1. `vuln-ssh-rce` → `restrict_port:web-01:22:mgmt`: Restrict access to port 22 on web-01 to only allow management traffic.
2. `vuln-admapp-cached` → `enforce_mfa:adm-app`: Enforce multi-factor authentication for adm-app accounts to prevent unauthorized access.

## Best practices
- Regularly update and patch systems to prevent exploitation of known vulnerabilities.
- Implement robust security controls, such as firewalls and intrusion detection/prevention systems, to detect and prevent lateral movement attacks.
- Use multi-factor authentication to add an additional layer of security for sensitive accounts.



### llama3.1 · privilege_escalation · en

## Executive summary
The report is a simulation of a privilege escalation attack on the Northwind company's network.
The attacker starts from an initial compromised user account and attempts to escalate privileges through various means, including brute force attacks, credential theft, and exploitation of vulnerabilities in the system.

## Attack narrative
**P1** The attacker uses a brute-force attack on the SSH port of app-01 to gain access as 'adm-app'.
- **P1.S1** _[local privilege escalation]_ Escalate to admin on ws-emp-01 via Print spooler local privilege escalation
- **P1.S2** _[credential dumping]_ Dump cached credentials of 'adm-app' from ws-emp-01
- **P1.S3** _[valid account use]_ Log on to app-01 as 'adm-app' (admin)
- **P1.S4** _[credential dumping]_ Dump cached credentials of 'it-admin' from app-01
- **P1.S5** _[domain takeover]_ 'it-admin' is a domain admin - MFA challenge
**P2** The attacker uses credential theft to obtain the credentials for 'it-admin' from app-01.
- **P2.S1** _[local privilege escalation]_ Escalate to admin on ws-emp-01 via Print spooler local privilege escalation
- **P2.S2** _[credential dumping]_ Dump cached credentials of 'adm-app' from ws-emp-01
- **P2.S3** _[valid account use]_ Log on to app-01 as 'adm-app' (admin)
- **P2.S4** _[credential dumping]_ Dump cached credentials of 'it-admin' from app-01
- **P2.S5** _[valid account use]_ Log on to idp-01 as 'it-admin' (admin) - MFA challenge
- **P2.S6** _[domain takeover]_ Admin on identity server idp-01 controls the domain
**P3** The attacker logs in to idp-01 as 'it-admin' and gains control of the domain.
- **P3.S1** _[local privilege escalation]_ Escalate to admin on ws-emp-01 via Print spooler local privilege escalation
- **P3.S2** _[credential dumping]_ Dump cached credentials of 'adm-app' from ws-emp-01
- **P3.S3** _[valid account use]_ Log on to app-01 as 'adm-app' (admin)
- **P3.S4** _[credential dumping]_ Dump cached credentials of 'it-admin' from app-01
- **P3.S5** _[valid account use]_ Log on to idp-01 as 'it-admin' (admin) - MFA challenge

## Business impact
The attack results in a loss of sensitive data, including user credentials and system configuration files.
The attacker gains control of the identity server, allowing them to manipulate user accounts and access sensitive information.

## Prioritized remediation
1. `vuln-admapp-cached` → `enforce_mfa:adm-app`: Enforce MFA for 'adm-app' on app-01 SSH port to prevent brute-force attacks.
2. `vuln-admapp-cached` → `enforce_mfa:adm-app`: Enforce MFA for 'it-admin' on idp-01 to prevent credential theft and domain takeover.

## Best practices
- Implement MFA for all user accounts, especially those with high privileges.
- Regularly review and update system configurations to ensure they are secure and up-to-date.



### llama3.1 · sensitive_data_exposure · en

## Executive summary
The Northwind scenario is a simulated attack on the Northwind database, which contains sensitive customer data.
The attacker's goal is to gain access to this data and exploit it for malicious purposes.

## Attack narrative
**P1** Initial Access: Exploit OpenSSH Vulnerability (CVE-2022-0336) on Web Server 01 (WS01).
- **P1.S1** _[network reach]_ internet can reach web-01 tcp/22 (ssh OpenSSH_7.2p2) via fw-edge
- **P1.S2** _[remote exploit]_ Exploit Outdated OpenSSH 7.2p2: pre-auth remote code execution on web-01:22 -> admin
- **P1.S3** _[trust abuse]_ Abuse trust web-01 -> idp-01 as 'svc-web': svc-web Kerberos keytab cached on web-01; trusted by the identity server
- **P1.S4** _[Kerberoasting]_ Request a service ticket for 'svc-web' from idp-01 and crack its weak password offline
- **P1.S5** _[data access]_ Read data on customer-db with 'svc-web' admin rights
**P2** Privilege Escalation: Use the exploited vulnerability to gain administrative access to WS01.
- **P2.S1** _[network reach]_ internet can reach web-01 tcp/22 (ssh OpenSSH_7.2p2) via fw-edge
- **P2.S2** _[remote exploit]_ Exploit Outdated OpenSSH 7.2p2: pre-auth remote code execution on web-01:22 -> admin
- **P2.S3** _[trust abuse]_ Abuse trust web-01 -> idp-01 as 'svc-web': svc-web Kerberos keytab cached on web-01; trusted by the identity server
- **P2.S4** _[Kerberoasting]_ Request a service ticket for 'svc-web' from idp-01 and crack its weak password offline
- **P2.S5** _[valid account use]_ Log on to customer-db as 'svc-web' (admin)
- **P2.S6** _[data access]_ Admin on customer-db reads its data (sensitivity 3)
**P3** Lateral Movement: Move laterally from WS01 to IDP-01 using Kerberos authentication.
- **P3.S1** _[network reach]_ internet can reach web-01 tcp/22 (ssh OpenSSH_7.2p2) via fw-edge
- **P3.S2** _[remote exploit]_ Exploit Outdated OpenSSH 7.2p2: pre-auth remote code execution on web-01:22 -> admin
- **P3.S3** _[network reach]_ web-01 can reach idp-01 tcp/636 (ldaps) via fw-edge
- **P3.S4** _[password guessing]_ Guess medium password of 'j-doe' on idp-01 ldaps/636 (no MFA)
- **P3.S5** _[valid account use]_ Log on to idp-01 as 'j-doe' (read)
- **P3.S6** _[Kerberoasting]_ Request a service ticket for 'svc-web' from idp-01 and crack its weak password offline
- **P3.S7** _[data access]_ Read data on customer-db with 'svc-web' admin rights

## Business impact
Sensitive customer data exposure
Financial loss due to unauthorized access and exploitation of sensitive data

## Prioritized remediation
1. `vuln-ssh-rce` → `restrict_port:web-01:22:mgmt`: Restrict SSH port 22 on Web Server 01 to management access only.
2. `vuln-svcweb-weakpw` → `enforce_mfa:svc-web`: Enforce Multi-Factor Authentication (MFA) for Service Account 'svc-web'.

## Best practices
- Regularly update and patch systems to prevent exploitation of known vulnerabilities.
- Implement MFA for all sensitive accounts, including service accounts.



### llama3.1 · sensitive_data_exposure · tr

## Yönetici özeti
The Northwind scenario is a simulated attack on the Northwind database, which contains sensitive customer data.
The attacker's goal is to gain access to this data and exploit it for malicious purposes.

## Saldırı anlatımı
**P1** Initial Access: Exploit OpenSSH Vulnerability (CVE-2022-0336) on Web Server 01 (WS01).
- **P1.S1** _[ağ erişimi]_ internet can reach web-01 tcp/22 (ssh OpenSSH_7.2p2) via fw-edge
- **P1.S2** _[uzaktan istismar]_ Exploit Outdated OpenSSH 7.2p2: pre-auth remote code execution on web-01:22 -> admin
- **P1.S3** _[güven ilişkisi istismarı]_ Abuse trust web-01 -> idp-01 as 'svc-web': svc-web Kerberos keytab cached on web-01; trusted by the identity server
- **P1.S4** _[Kerberoasting]_ Request a service ticket for 'svc-web' from idp-01 and crack its weak password offline
- **P1.S5** _[veri erişimi]_ Read data on customer-db with 'svc-web' admin rights
**P2** Privilege Escalation: Use the exploited vulnerability to gain administrative access to WS01.
- **P2.S1** _[ağ erişimi]_ internet can reach web-01 tcp/22 (ssh OpenSSH_7.2p2) via fw-edge
- **P2.S2** _[uzaktan istismar]_ Exploit Outdated OpenSSH 7.2p2: pre-auth remote code execution on web-01:22 -> admin
- **P2.S3** _[güven ilişkisi istismarı]_ Abuse trust web-01 -> idp-01 as 'svc-web': svc-web Kerberos keytab cached on web-01; trusted by the identity server
- **P2.S4** _[Kerberoasting]_ Request a service ticket for 'svc-web' from idp-01 and crack its weak password offline
- **P2.S5** _[geçerli hesap kullanımı]_ Log on to customer-db as 'svc-web' (admin)
- **P2.S6** _[veri erişimi]_ Admin on customer-db reads its data (sensitivity 3)
**P3** Lateral Movement: Use the gained admin privileges to move laterally to IDP-01 (Identity Provider) via Kerberos protocol.
- **P3.S1** _[ağ erişimi]_ internet can reach web-01 tcp/22 (ssh OpenSSH_7.2p2) via fw-edge
- **P3.S2** _[uzaktan istismar]_ Exploit Outdated OpenSSH 7.2p2: pre-auth remote code execution on web-01:22 -> admin
- **P3.S3** _[ağ erişimi]_ web-01 can reach idp-01 tcp/636 (ldaps) via fw-edge
- **P3.S4** _[parola tahmini]_ Guess medium password of 'j-doe' on idp-01 ldaps/636 (no MFA)
- **P3.S5** _[geçerli hesap kullanımı]_ Log on to idp-01 as 'j-doe' (read)
- **P3.S6** _[Kerberoasting]_ Request a service ticket for 'svc-web' from idp-01 and crack its weak password offline
- **P3.S7** _[veri erişimi]_ Read data on customer-db with 'svc-web' admin rights

## İş etkisi
Sensitive customer data exposure
Financial loss due to unauthorized access and exploitation of sensitive data

## Önceliklendirilmiş iyileştirme
1. `vuln-ssh-rce` → `restrict_port:web-01:22:mgmt`: Restrict SSH port 22 on Web Server 01 to management access only.
2. `vuln-svcweb-weakpw` → `enforce_mfa:svc-web`: Enforce Multi-Factor Authentication (MFA) for Service Account 'svc-web'.

## En iyi uygulamalar
- Regularly update and patch systems to prevent exploitation of known vulnerabilities.
- Implement robust access controls, including MFA, to prevent unauthorized access.



### llama3.1 · outdated_service_exploitation · en

## Executive summary
The most likely path has a likelihood of 92.2% and a risk of 0.492.
The blast radius is 12.5%.

## Attack narrative
**P1** Path P1: The attacker reaches web-01#admin via the internet (ATTACKER@internet) and exploits Outdated OpenSSH 7.2p2: pre-auth remote code execution on web-01:22 -> admin (vuln-ssh-rce).
- **P1.S1** _[network reach]_ internet can reach web-01 tcp/22 (ssh OpenSSH_7.2p2) via fw-edge
- **P1.S2** _[remote exploit]_ Exploit Outdated OpenSSH 7.2p2: pre-auth remote code execution on web-01:22 -> admin

## Business impact
The risk of the asset fw-edge is 49.
The risk of the asset web-01 is 49.

## Prioritized remediation
1. `vuln-ssh-rce` → `apply_patch:vuln-ssh-rce`: Apply patch for vuln-ssh-rce to fix the vulnerability Outdated OpenSSH 7.2p2: pre-auth remote code execution on web-01:22 -> admin.
2. `vuln-ssh-exposed` → `restrict_port:web-01:22:mgmt`: Restrict port 22 on web-01 to prevent SSH (22/tcp) from being reachable from the internet.
3. `vuln-ssh-rce` → `apply_patch:vuln-ssh-rce`: Apply patch for vuln-ssh-rce to fix the vulnerability Outdated OpenSSH 7.2p2: pre-auth remote code execution on web-01:22 -> admin.
4. `vuln-ssh-exposed` → `restrict_port:web-01:22:mgmt`: Restrict port 22 on web-01 to prevent SSH (22/tcp) from being reachable from the internet.
5. `vuln-ssh-rce` → `apply_patch:vuln-ssh-rce`: Apply patch for vuln-ssh-rce to fix the vulnerability Outdated OpenSSH 7.2p2: pre-auth remote code execution on web-01:22 -> admin.
6. `vuln-ssh-exposed` → `restrict_port:web-01:22:mgmt`: Restrict port 22 on web-01 to prevent SSH (22/tcp) from being reachable from the internet.

## Best practices
- The most likely path has a likelihood of 92.2% and a risk of 0.492.
- The blast radius is 12.5%.


