# Multi-master replication lab

Scenario: two PingDirectory servers, `pd1.example.test` and `pd2.example.test`, hold `dc=example,dc=test`; both accept writes. This is not a PingDS/OpenDJ command guide. Read the [connection setup](README.md) first.

## Preconditions

Use isolated servers with matched product/schema settings, verified TLS trust, synchronized clocks and a backup. Confirm the selected ports: 1636 is LDAPS in this example; 8989 is replication traffic, not an LDAP search port. Check DNS/firewall reachability from both nodes and the CLI host.

```bash
getent hosts pd1.example.test pd2.example.test
ss -lntp
openssl s_client -connect pd2.example.test:1636 -servername pd2.example.test   -CAfile /path/to/test-ca.pem -verify_hostname pd2.example.test -verify_return_error </dev/null
"$PD_HOME/bin/dsreplication" enable --help
"$PD_HOME/bin/dsreplication" initialize --help
```

Do not infer replication-port TLS health from an LDAP test. Check the replication listener and its trust separately using the deployment's configured certificate model.

## Read status

```bash
"$PD_HOME/bin/dsreplication" status   --hostname pd1.example.test --port 1636 --useSSL   --adminUID replication-admin --adminPasswordFile /run/secrets/topology-password   --trustStorePath "$PD_TRUSTSTORE" --trustStorePasswordFile "$PD_TRUSTSTORE_PASSWORD_FILE"   --displayServerTable --showAll
```

## Enable and initialize a new empty replica

These commands change topology and copy data. Confirm that pd1 is the intended source and pd2 is a disposable/new destination; initialization replaces destination suffix contents.

```bash
"$PD_HOME/bin/dsreplication" enable   --host1 pd1.example.test --port1 1636 --useSSL1 --replicationPort1 8989   --bindDN1 "$PD_BIND_DN" --bindPasswordFile1 "$PD_PASSWORD_FILE"   --host2 pd2.example.test --port2 1636 --useSSL2 --replicationPort2 8989   --bindDN2 "$PD_BIND_DN" --bindPasswordFile2 /run/secrets/pd2-admin-password   --baseDN dc=example,dc=test --adminUID replication-admin   --adminPasswordFile /run/secrets/topology-password   --trustStorePath "$PD_TRUSTSTORE" --trustStorePasswordFile "$PD_TRUSTSTORE_PASSWORD_FILE"

"$PD_HOME/bin/dsreplication" initialize   --hostSource pd1.example.test --portSource 1636 --useSSLSource   --hostDestination pd2.example.test --portDestination 1636 --useSSLDestination   --baseDN dc=example,dc=test --adminUID replication-admin   --adminPasswordFile /run/secrets/topology-password   --trustStorePath "$PD_TRUSTSTORE" --trustStorePasswordFile "$PD_TRUSTSTORE_PASSWORD_FILE"
```

The CLI may require additional interactive choices for secure replication and topology administration; review them rather than suppressing prompts. Use the installed CLI reference for existing topology credentials. Do not use `initialize-all` as a routine lag fix.

Sources: [CLI arguments](https://docs.ping.directory/PingDirectory/latest/cli/dsreplication.html), [deployment example](https://docs.pingidentity.com/pingdirectory/11.1/pingdirectory_server_administration_guide/pd_ds_deploy_non_int_dsreplication.html).

## Demonstrate both write directions

Create the sample profile through migration instructions, then modify a harmless attribute on pd1:

```ldif
dn: uid=customer-001,ou=people,dc=example,dc=test
changetype: modify
replace: description
description: replication-lab-write-from-pd1
```

Save as `/var/tmp/replication-probe.ldif`:

```bash
"$PD_HOME/bin/ldapmodify" "${CONN[@]}" --filename /var/tmp/replication-probe.ldif
"$PD_HOME/bin/ldapsearch" "${CONN[@]}"   --baseDN 'uid=customer-001,ou=people,dc=example,dc=test'   --searchScope base '(objectClass=*)' uid description
```

Switch the connection host to pd2 and search the same DN. Record propagation time. Make a different, sequential description update on pd2 and verify it on pd1. This proves both directions without deliberately creating a simultaneous conflict. Restore the sample description afterward.

For a controlled outage exercise, stop only a disposable replica, write on the other, restart and measure catch-up while the outage is comfortably within retained history. Test conflict behaviour separately before allowing competing production writers.

Acceptance: initialized data agrees, both directions converge within the lab target, no unexpected generation-ID or missing-change errors occur, and the configured retention agrees across nodes. Counts alone do not establish content equality. Attribute-level replication and topology administration are separate from ordinary configuration replication; do not assume all dsconfig changes propagate.

Source: [replication subcommand semantics](https://docs.pingidentity.com/pingdirectory/11.1/pingdirectory_server_administration_guide/pd_ds_summary_dsreplication_subcommands.html).
