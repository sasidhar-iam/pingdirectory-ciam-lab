# PingDirectory CIAM Lab

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

Java compilation is configured in CI; the preparation environment has a Java runtime but no compiler. No live LDAP bind, vendor-server validation, consent schema deployment or replication testing has been completed. Node tests do not validate the Java implementation. Add integration tests before using this against PingDirectory.

See [upgrade notes](docs/UPGRADE-IMPACT.md), [Contributing](CONTRIBUTING.md), [Security](SECURITY.md) and [MIT License](LICENSE).
