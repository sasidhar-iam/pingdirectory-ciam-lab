# NoSQL to LDAP profiles and token-store boundaries

## Decide which product owns the data

| Data | Supported example in this lab | What not to assume |
| --- | --- | --- |
| Customer profiles | NoSQL JSONL mapped to inetOrgPerson plus a lab auxiliary class in PingDirectory | NoSQL fields are not automatically LDAP schema |
| PingFederate persistent grants | PF's version-matched PingDirectory schema and LDAP grant-store implementation | A profile LDIF is not an access-grant LDIF |
| PingAM Core Token Service (CTS) | Use a supported PingDS CTS deployment | PingDirectory and PingDS are different products |

The PingAM 7.5 supported-store table permits PingDirectory 9.3+ for identities, but not for CTS; external PingDS supports CTS. Recheck your exact AM version. Do not migrate CTS records into PingDirectory using these profile examples.
Source: [PingAM supported stores](https://docs.pingidentity.com/pingam/7.5/installation/prepare-ext-stores.html).

## Rehearse profile migration from a NoSQL export

Export a consistent, authorized snapshot from Cassandra, MongoDB or your actual source, then normalize it into the sample JSONL contract. The supplied converter is source-independent: it does not connect to Cassandra or MongoDB. It accepts a small rehearsal batch (10 MiB input / 10,000 profiles), not a twelve-million-record production migration.

| Source field | LDAP field | Rule |
| --- | --- | --- |
| customerId | uid, labSubjectId and DN component | Stable restricted identifier, unique in batch |
| displayName | cn | Required; unsafe LDIF text is base64 encoded |
| surname | sn | Required by the chosen class |
| entitlements | labEntitlement | Multi-valued strings; preserve source meaning |
| password/hash/token | Not copied | Separate reviewed authentication/token migration |

The sample OIDs are in the documentation enterprise arc. Allocate your organization's own OIDs for production. Review syntax, matching rules, indexes and application expectations before adopting a custom schema.

From this repository, produce an output only after validation:

```bash
umask 077
node src/jsonl-to-ldif.mjs fixtures/migration/users.jsonl > /var/tmp/users.ldif.tmp &&   mv -- /var/tmp/users.ldif.tmp /var/tmp/users.ldif
sha256sum fixtures/migration/users.jsonl /var/tmp/users.ldif
```

The converter constructs a safe DN from a restricted identifier; it does not implement arbitrary DN escaping. A failed conversion must not be imported. Export no passwords or raw tokens into these temporary files.

## Load schema, then a small sample

Use the [connection setup](README.md). Confirm the suffix already exists, inspect existing schema for OID/name collisions, then apply the new definitions with a schema-admin identity:

```bash
"$PD_HOME/bin/ldapsearch" "${CONN[@]}" --baseDN cn=schema --searchScope base   '(objectClass=*)' attributeTypes objectClasses
# SCHEMA CHANGE: isolated test directory only; add once.
"$PD_HOME/bin/ldapmodify" "${CONN[@]}" --filename fixtures/migration/schema.ldif
```

Source: [schema changes over LDAP](https://docs.pingidentity.com/pingdirectory/11.0/pingdirectory_server_administration_guide/pd_ds_create_attr_ldap.html), [object-class management](https://docs.pingidentity.com/pingdirectory/10.3/pingdirectory_server_administration_guide/pd_ds_manage_object_class_ldap.html). Check syntax against your installed release.

Add the parent OU only if absent, then add profiles. The files are entry LDIF, so use defaultAdd:

```bash
"$PD_HOME/bin/ldapmodify" "${CONN[@]}" --defaultAdd   --filename fixtures/migration/people-container.ldif
"$PD_HOME/bin/ldapmodify" "${CONN[@]}" --defaultAdd --filename /var/tmp/users.ldif
"$PD_HOME/bin/ldapsearch" "${CONN[@]}" --baseDN ou=people,dc=example,dc=test   '(uid=customer-001)' uid cn sn labSubjectId labEntitlement
```

Source: [adding entries](https://docs.pingidentity.com/pingdirectory/11.1/pingdirectory_server_administration_guide/pd_ds_add_entries.html).

Reconcile source and target identifiers, required fields, multi-value sets and rejects; a line count alone is insufficient. Test login separately because this converter does not migrate credentials. Rehearse rollback by removing only the synthetic cohort, not by deleting a shared suffix or live schema.

## Large offline import is a separate change

For a new/disposable first server with a rehearsed restore, load schema and a complete parent-first LDIF including all required suffix entries. Confirm backend identity and import semantics before proceeding. Offline import can replace backend contents; do not use it to append to an existing production store.

```bash
"$PD_HOME/bin/import-ldif" --help
# DATA-REPLACING OPERATION: planned offline import into a NEW test backend.
"$PD_HOME/bin/stop-server"
"$PD_HOME/bin/import-ldif" --backendID userRoot --ldifFile /approved/full-suffix.ldif   --rejectFile /var/tmp/import-rejects.ldif --skipFile /var/tmp/import-skips.ldif
"$PD_HOME/bin/start-server"
```

Review output and exit status before startup. Avoid overwriting existing reject reports. A replication target should normally be initialized from its intended authoritative source, not imported independently.
Source: [import procedure](https://docs.pingidentity.com/pingdirectory/11.1/pingdirectory_server_administration_guide/pd_ds_importing_data.html).

For production scale use streaming transformation, partition checkpoints, global duplicate detection, batch manifests, CDC watermarks and an explicit write cutover. Map deletes and changed entitlements too. Measure index-build time and disk headroom before the load.

## Configure PingFederate grant storage

Use the LDIF shipped with the exact PF distribution under:

```bash
PF_HOME=/opt/pingfederate
find "$PF_HOME/pingfederate/server/default/conf/access-grant/ldif-scripts"   -maxdepth 1 -type f -name '*pingdirectory*.ldif' -print
```

Review and substitute the supplied schema/base-DN placeholders, then apply the appropriate scripts with `ldapmodify`. Do not reproduce vendor schema from memory. Configure the LDAP datastore and its system ID, grant base DN and PF grant manager as described in the version-matched documentation. The PingDirectory implementation file is `org.sourceid.oauth20.token.AccessGrantManagerLDAPPingDirectoryImpl.xml`. Verify service permissions and grant indexes, then test issuance, refresh rotation, revocation and expiry.

Source baseline: [PF 13.0 directory grant storage](https://docs.pingidentity.com/pingfederate/13.0/administrators_reference_guide/pf_config_directori_for_grant_storage.html). Use the matching installed-version guide for final changes.

An existing Cassandra refresh token does not become a valid PF LDAP grant because its string was copied. Preserve client/consent binding, hashing/encryption conventions, issuer semantics, rotation and replay protection through a supported migration/exchange service. See the [organic migration design](https://github.com/sasidhar-iam/pingaccess-ciam-lab/blob/main/docs/open-banking-refresh-migration.md).

## PingAM CTS on PingDS

For a new supported PingDS CTS instance, use the documented `am-cts` setup profile. Select whether AM, DS or a split model owns expiration; this affects session notifications. Do not manually copy live CTS blobs into a profile store. These read-only discovery commands avoid inventing a universal setup command:

```bash
DS_HOME=/opt/pingds
"$DS_HOME/setup" --help
"$DS_HOME/bin/dsconfig" --help
```

Follow [the version-matched CTS install guide](https://docs.pingidentity.com/pingds/7.5/install-guide/profile-am-cts.html) for the actual setup arguments, deployment ID, trust, service account and indexes. Verify token/session continuity and failover using PingAM. No CTS setup command has been executed by this lab.
