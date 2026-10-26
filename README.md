# PingDirectory CIAM Lab

Purge sizing, multi-master replication and profile migration.

[![Verify examples](https://github.com/sasidhar-iam/pingdirectory-ciam-lab/actions/workflows/test.yml/badge.svg)](https://github.com/sasidhar-iam/pingdirectory-ciam-lab/actions/workflows/test.yml)
[MIT License](LICENSE) · [Report a problem](https://github.com/sasidhar-iam/pingdirectory-ciam-lab/issues) · [Contribute](CONTRIBUTING.md)

## Practical scenarios

| Scenario | Start here |
| --- | --- |
| Set eight-day replication retention and plan grant cleanup | [Purge and capacity runbook](docs/operations/purge-and-capacity.md) |
| Measure day-by-day allocated and apparent disk growth | [Snapshot tool](tools/disk_snapshot.sh) and [daily report](tools/purge_capacity.py) |
| Initialize a replica and test both write directions | [Multi-master runbook](docs/operations/replication.md) |
| Convert a small NoSQL export to LDAP profiles | [Migration and token-store boundaries](docs/operations/migration-and-token-stores.md) |

The code uses synthetic data. Runnable local models, documented vendor commands and unfinished integrations are labelled separately.


LDAP filter escaping, LDIF value formatting and a read-only Java LDAP lookup example for a CIAM learning environment.

## Run the utility tests

Requires Node.js 20 or later:

```sh
npm test
```

The Node utilities have no external dependencies. Filter escaping and DN escaping are different operations: `escapeFilter` must not be used to build a DN. The LDIF helper emits one attribute value, not a complete schema or migration tool, and does not fold long lines.

## Java lookup

Requires JDK 17 or later and an authorized test LDAP server. Create a `build` folder, then:

```sh
javac -d build java/LdapLookup.java
java -cp build LdapLookup synthetic-customer-001
```

Supply `LDAP_URL` (ldaps), `LDAP_BIND_DN`, `LDAP_PASSWORD` and `LDAP_BASE_DN` through your local environment or secret injection. Use a read-only bind identity and a valid server certificate trusted by the JVM. Do not put the password in a command line or commit it. The program prints only a count and refuses referrals.

`fixtures/customer.ldif` assumes that `ou=people,dc=example,dc=test` already exists and that inetOrgPerson is available. Review and import only into an isolated test directory.

## What remains

Java compilation is checked in CI; see the Actions tab for the latest result. No live LDAP bind, vendor-server validation, consent schema deployment or replication testing has been completed. Node tests do not validate the Java implementation. Add integration tests before using this against PingDirectory.

See [upgrade notes](docs/UPGRADE-IMPACT.md), [Contributing](CONTRIBUTING.md), [Security](SECURITY.md) and [MIT License](LICENSE).

## Practical operations and migration

Start with the [operations runbooks](docs/operations/README.md): eight-day replication retention, grant cleanup, purge sizing, daily disk deltas, multi-master replication, schema and NoSQL profile migration.

Run the calculator tests with `python3 -m unittest discover -s tools -p 'test_*.py' -v`. Run `node src/jsonl-to-ldif.mjs fixtures/migration/users.jsonl` to print a synthetic profile migration example. Server commands are documented examples, not live integration test results.

## Related CIAM labs

- [PingAccess](https://github.com/sasidhar-iam/pingaccess-ciam-lab)
- [PingDirectory](https://github.com/sasidhar-iam/pingdirectory-ciam-lab)
- [PingFederate and cloud identity](https://github.com/sasidhar-iam/ping-identity-ciam-lab)
- [Banking IAM overview and release-impact guide](https://github.com/sasidhar-iam/banking-iam-repo)
