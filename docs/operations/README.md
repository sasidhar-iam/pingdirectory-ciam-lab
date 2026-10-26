# Practical directory operations

These runbooks use a PingDirectory 11.1 documentation baseline and synthetic data. They are not captured output from a running server. Confirm flags with the installed binary's `--help`; older versions may not have scheduled cleanup tasks.

1. [Eight-day retention, grant cleanup and capacity](purge-and-capacity.md)
2. [Multi-master replication](replication.md)
3. [NoSQL profile migration, schema and token-store boundaries](migration-and-token-stores.md)

Run local tools from the repository root. Commands involving server configuration, import, initialization or cleanup change a server; rehearse on an isolated directory with restorable backups.

## Connection setup for PingDirectory commands

The runbooks assume Bash, GNU Linux tools, the PingDirectory command suite and an existing test suffix `dc=example,dc=test`. These variables describe sample paths, not files shipped by this repository:

```bash
PD_HOME=/opt/pingdirectory
PD_HOST=pd1.example.test
PD_PORT=1636
PD_BIND_DN='cn=Directory Manager'
PD_PASSWORD_FILE=/run/secrets/pd-admin-password
PD_TRUSTSTORE=/run/secrets/pd-truststore.p12
PD_TRUSTSTORE_PASSWORD_FILE=/run/secrets/pd-truststore-password
CONN=(--hostname "$PD_HOST" --port "$PD_PORT" --useSSL
      --bindDN "$PD_BIND_DN" --bindPasswordFile "$PD_PASSWORD_FILE"
      --trustStorePath "$PD_TRUSTSTORE"
      --trustStorePasswordFile "$PD_TRUSTSTORE_PASSWORD_FILE")
```

Provision secrets out of band with owner-only permissions. Use a dedicated least-privilege identity for measurement; elevated configuration access is needed for schema and replication work. Trust the issuing CA and keep hostname verification enabled. No example uses `--trustAll`.
