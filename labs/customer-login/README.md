# Customer login + PingDirectory evaluation lab

A fictional Cedar customer portal with three generated users, a protected sample report and two explicit authentication modes:

- **Mock:** hashed local accounts; no Ping product connection.
- **PingDirectory:** per-user LDAPS bind using ldapts, then a narrowly scoped profile lookup. LDAP failure never falls back to mock.

This is a direct password-bind teaching exercise, not a full OIDC/MFA banking login. It binds only to 127.0.0.1. Do not expose it publicly or use real accounts.

## What is ready and what is not

The web app, mock flow, LDAP adapter contract and local tests are implemented. Automated browser layout/interaction validation remains uncompleted; the passing tests exercise the backend and mocked LDAP boundary. The custom Docker Compose setup has been statically reviewed but not run against PingDirectory in the preparation environment, where Docker and evaluation credentials were unavailable. The local Java keytool certificate generation/export was checked separately.

No PingDirectory user has been created by merely downloading this repository. Run the licensed product and seed step below to create the entries. No vendor binaries, evaluation credentials, generated passwords or private keys are committed.

## 1. Windows prerequisites

Install a supported **Node.js 22 or later** from [Node.js](https://nodejs.org/en/download). For the real product mode, install [Docker Desktop for Windows](https://docs.docker.com/desktop/setup/install/windows-install/) with its Linux-container/WSL 2 setup. Follow each product's installation and licensing instructions.

Download the repository through GitHub **Code → Download ZIP**, extract it and open this folder in PowerShell:

```powershell
cd "C:\path\to\pingdirectory-ciam-lab\labs\customer-login"
node --version
npm --version
docker version
docker compose version
```

Git and Vagrant are not required for this route. Docker checks are only needed for PingDirectory mode. This repository does not install software on your Windows computer.

## 2. Try the working mock page first

```powershell
npm ci
npm run seed
npm run start:mock
```

Open **http://127.0.0.1:3000**. In a second terminal, read the generated accounts privately:

```powershell
Get-Content .local\credentials.json
```

| Username | Role | Sample report |
| --- | --- | --- |
| alice | viewer | Denied |
| ben | analyst | Allowed |
| chitra | support | Allowed |

Passwords are freshly generated per seed; there is no shared published password. The seed refuses to overwrite existing accounts. Mock data uses salted scrypt hashes. Close the app with Ctrl+C before switching modes.

The .local folder and .env are ignored. On Windows, keep this folder in your private user profile and review its NTFS permissions; Unix file modes do not set Windows ACLs.

## 3. Obtain the actual Ping evaluation licence

Ping's official DevOps prerequisites describe **30-day evaluation licences**, with eligible images published in the last 90 days. This is not a permanently free PingDirectory edition. Register using the [official prerequisites and DevOps registration links](https://developer.pingidentity.com/devops/get-started/prereqs.html).

Copy .env.example to .env and edit it privately:

```powershell
Copy-Item .env.example .env
notepad .env
```

Supply your DevOps user/key and choose an eligible image. The example edge tag is moving, not a reproducible production pin. Select a supported tag/digest, record the actual image/product version and check availability. Set PING_IDENTITY_ACCEPT_EULA to YES yourself only after reviewing and accepting the applicable terms. Never send the credentials in a GitHub issue or chat.

Do not disable licence verification. Existing commercial licences require the appropriate documented mount configuration, which is not included in this evaluation Compose file.

## 4. Generate a private lab certificate and start PingDirectory

After filling .env, create a PKCS12 keystore and export its public certificate using keytool in the selected image:

```powershell
docker compose --profile tools run --rm tls-init
docker compose --profile tools run --rm tls-export
docker compose up -d pingdirectory
docker compose logs --tail 100 pingdirectory
docker compose ps
```

The certificate includes localhost, pingdirectory and 127.0.0.1 and lasts 30 days. Do not rerun tls-init over an existing keystore. Renew certificates deliberately when needed. The secret mount files are under .local; preserve that directory alongside the persistent directory volume.

The Compose file publishes LDAPS 1636 and administration HTTPS 8443 on loopback only. It uses a custom empty remote profile and configured base suffix, based on [official image variables](https://developer.pingidentity.com/devops/docker-images/pingdirectory/README.html). It is a single-product lab, not an official validated multi-product stack. See [Ping's Compose scope](https://developer.pingidentity.com/devops/deployment/deployCompose.html).

Do not use docker compose config in shared logs: expanded environment values can contain credentials. If startup fails, inspect logs privately for licence retrieval, image eligibility, file access, profile or certificate errors. Do not use trustAll or disable TLS checks as a workaround.

## 5. Create the three dummy directory users

Once the server is ready and the base suffix exists:

```powershell
npm run seed:ldap
npm run start:ldap
```

The seed uses the generated root secret only for provisioning. It adds ou=people and three inetOrgPerson entries under dc=example,dc=test. Each profile has uid, cn, sn, employeeType and a generated userPassword. It adds a narrow self-read ACI for the displayed fields when creating the OU. Existing entries are not overwritten; existing OU ACIs are not silently changed. Review those conditions on a reused directory.

Normal logins use each user's own bind credentials, not the root account. The role field is a deliberately simple lab mapping; do not allow production users to edit authorization attributes. Only synthetic data is shown.

Open **http://127.0.0.1:3000** again. The badge must say **PINGDIRECTORY MODE · LDAPS**, and successful profiles report the LDAPS source. The same generated account passwords apply. Validate the created entries using your directory administration tools.

If the directory is down, the app returns a service-unavailable error. A mock-mode success is not evidence of PingDirectory connectivity.

## 6. Tests and security boundaries

```powershell
npm test
npm audit --omit=dev
```

Tests cover generic login failures, CSRF/origin checks, session rotation, expiry, logout, role denial, rate limiting and mocked LDAP adapter failures. Mocked adapter checks do not prove a live bind. A dependency audit is a time-specific package check, not a complete security assessment.

This lab has in-memory sessions, a ten-minute fixed expiry and a small per-loopback-client rate limit. Restarting clears sessions. Cookie settings are for a local HTTP exercise; production needs HTTPS with Secure cookies, a durable session strategy, monitored throttling, MFA/federation and independent security review. Passwords and tokens are never placed in browser storage.

## Stop and retain data

```powershell
docker compose stop pingdirectory
```

This preserves the directory volume. Do not delete .local while expecting the existing data volume to retain the same administrator credentials and encryption material. Removing volumes is a separate destructive reset, not a normal stop operation.

## References

- [ldapts API and TLS guidance](https://github.com/ldapts/ldapts)
- [PingIDM CVE review](https://github.com/sasidhar-iam/ping-identity-ciam-lab/blob/main/docs/security/pingidm-cve-review-2026-10-29.md)
- [Repository security policy](../../SECURITY.md)
