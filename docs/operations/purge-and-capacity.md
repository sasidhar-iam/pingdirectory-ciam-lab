# Eight-day retention and purge sizing

## First identify what is growing

| Object | What controls it | What eight days would mean |
| --- | --- | --- |
| Replication changelog | Replication server purge delay | Retain replication change history for eight days |
| PingFederate persistent grants | Authorization expiry plus one configured cleanup mechanism | Not an automatic eight-day token lifetime |
| Application entries or attribute values | App expiry semantics and a configured purge plugin/task | A separate policy, not replication retention |
| Backend caches | Cache sizing/eviction | Memory behaviour, not an eight-day deletion policy |
| PingAM CTS | Supported PingDS CTS configuration | Different product; see the migration runbook |

## Example A: retain replication history for eight days

Replication changes older than the configured delay can be removed even if a replica has not consumed them. Keep the same value across replication servers. A longer delay increases recovery history and storage needs; it does not guarantee recovery after an outage.

Read before changing, change on each intended server, then read back:

```bash
"$PD_HOME/bin/dsconfig" get-replication-server-prop "${CONN[@]}"   --provider-name 'Multimaster Synchronization' --property replication-purge-delay

# CONFIGURATION CHANGE: approved test topology only.
"$PD_HOME/bin/dsconfig" set-replication-server-prop "${CONN[@]}"   --provider-name 'Multimaster Synchronization'   --set 'replication-purge-delay:8 d'
```

Run the read command again on every node. Preserve the actual previous values for rollback; do not assume a default. Increasing retention cannot restore already-purged changes.

Source: [replication purge delay](https://docs.pingidentity.com/pingdirectory/11.1/pingdirectory_server_administration_guide/pd_ds_modify_replication_purge_delay.html).

## Example B: expire grants correctly, clean at 02:00

Use the actual grant base DN from your PingFederate installation. Before switching cleanup ownership, follow Ping's documented procedure: disable the PF cleaner by setting `AccessGrantCleanerInterval` to `0` in `timer-intervals.xml`, save and restart PF as directed. Plan this handover so no unintended gap occurs. Do not enable both plugin and recurring-task cleanup for the same data.

Source: [grant cleanup ownership](https://docs.pingidentity.com/pingfederate/13.1/administrators_reference_guide/pf_managing_expired_persis_grants_in_pd.html).

The 11.1 recurring-task example below uses the task's expiry semantics. It does not add eight days to a grant's expiry:

```bash
# CONFIGURATION CHANGE: after cleanup handover and index verification.
"$PD_HOME/bin/dsconfig" create-recurring-task "${CONN[@]}"   --task-name 'Nightly PF grants'   --type clean-up-expired-ping-federate-persistent-access-grants   --set 'base-dn:ou=accessgrants,dc=example,dc=test'   --set max-updates-per-second:100

"$PD_HOME/bin/dsconfig" create-recurring-task-chain "${CONN[@]}"   --chain-name 'Nightly PF grants' --set enabled:true   --set 'recurring-task:Nightly PF grants'   --set scheduled-date-selection-type:every-day   --set scheduled-time-of-day:02:00 --set time-zone:Australia/Sydney
```

Sydney daylight-saving transitions can affect local 02:00 schedules. Test the scheduler's transition behaviour; choose UTC if a fixed elapsed schedule is required. Set a delete rate from measured capacity, not this sample number. Inspect task results under `cn=tasks`, cleanup monitors and application latency.

Source: [recurring cleanup tasks](https://docs.pingidentity.com/pingdirectory/11.1/pingdirectory_server_administration_guide/pd_ds_pf_grant_cleanup_recurring_task.html).

The grant expiry attribute needs an ordering index. Create it only if absent and rebuild it using the supported procedure for the selected deployment:

```bash
"$PD_HOME/bin/dsconfig" create-local-db-index "${CONN[@]}"   --backend-name userRoot --index-name accessGrantExpires --set index-type:ordering
"$PD_HOME/bin/rebuild-index" --help
# Run an approved index rebuild, then verify index usability before cleanup.
```

The remaining grant indexes also matter; consult the full list rather than indexing expiry alone.
Source: [grant indexes](https://docs.pingidentity.com/pingfederate/13.1/administrators_reference_guide/pf_index_grant_attributes_pd.html).

## Example C: an eight-day application-record retention policy

For a separate application-owned test OU, an eight-day age policy can use the generic purge plugin. This example targets only synthetic organizationalRole entries under `ou=lab-expiring,dc=example,dc=test`; do not apply it to customers, PF grants or CTS. Ensure the OU exists and createTimestamp has a usable ordering index before enabling deletion.

```bash
cutoff=$(date -u -d '8 days ago' +%Y%m%d%H%M%SZ)
"$PD_HOME/bin/ldapsearch" "${CONN[@]}" \
  --baseDN ou=lab-expiring,dc=example,dc=test \
  "(&(objectClass=organizationalRole)(createTimestamp<=$cutoff))" 1.1

# Prepare disabled. Review eligible records, indexes and a restorable backup first.
"$PD_HOME/bin/dsconfig" create-plugin "${CONN[@]}" \
  --plugin-name 'Lab eight-day application retention' --type purge-expired-data \
  --set enabled:false --set 'base-dn:ou=lab-expiring,dc=example,dc=test' \
  --set 'filter:(objectClass=organizationalRole)' \
  --set datetime-attribute:createTimestamp --set datetime-format:generalized-time \
  --set 'expiration-offset:8 d' --set purge-behavior:delete-entries
```

This preparation does not delete records. Enabling the plugin later is a separate destructive application-policy change. Eight days from creation is different from eight days after last access or after token expiry. Define which timestamp represents the business rule, and test boundary behaviour on synthetic entries.
Source: [Purge Expired Data plugin](https://docs.pingidentity.com/pingdirectory/11.1/pingdirectory_server_administration_guide/pd_ds_purge_expired_data_plugin.html).

## Calculate the maintenance window

Let B be the measured expired-record backlog at the start of cleanup, lambda the arrival rate of newly expired records during cleanup, and mu the sustainable delete rate:

- Drain time = B / (mu - lambda), only when mu > lambda.
- Daily scheduled delete budget = mu × window seconds. Compare it with the full day's expired arrivals.
- Replication history estimate = changes/sec × average logical change bytes × 86,400 × retention days × measured overhead factor, per node. This is a sizing model, not a measured disk prediction.

```bash
python3 tools/purge_capacity.py --backlog 360000 --expired-per-second 10   --delete-per-second 100 --window-hours 2 --change-rate 200   --change-bytes 600 --retention-days 8 --overhead-factor 1.5
```

Expected model: drain about 4,000 seconds (66.7 minutes); 720,000 deletes per two-hour window versus 864,000 newly expired records per day. The window can clear the current backlog but is not sustainable daily at that arrival rate. Estimated replication bytes are 124,416,000,000 per node before workload variation. Changing the illustrative overhead factor changes the estimate directly.

## Day-by-day growth and actual purge evidence

Identify the real changelog directory from your installation/configuration; do not guess it from a filename. Measure the same directory on each node at a consistent time:

```bash
# Once, for a NEW report file only:
printf 'timestamp_utc,host,path,allocated_bytes,apparent_bytes\n' > /var/tmp/pd-disk.csv
# Append one sample each day; do not repeat the header command:
bash tools/disk_snapshot.sh /actual/path/to/changelog >> /var/tmp/pd-disk.csv
python3 tools/purge_capacity.py --daily /var/tmp/pd-disk.csv

du -s -B1 -- /actual/path/to/changelog
du -s -B1 --apparent-size -- /actual/path/to/changelog
df -B1 -- /actual/path/to/changelog
# Optional, if sysstat is installed:
iostat -xz 1 5
```

The snapshot script includes timestamp, host and measured path. The report takes the last sample of each UTC day and compares consecutive calendar days. Gaps are marked, not called one-day growth. It reports allocated and apparent bytes separately. Net disk delta is not the number of purged records: writes, file reuse and storage allocation all affect it. Obtain delete counts/rates from the configured cleanup monitor, task results and appropriately filtered audit events. Physical disk can remain allocated after logical deletion.

Do not delete live database/changelog files or force compaction to make the graph fall. If purge throughput is low, check index use, task errors, replication lag and IO before changing limits.

Acceptance: retain intended history on all nodes, expired grants become unusable immediately according to authorization rules, live grants survive cleanup, backlog remains bounded and business latency stays within its target.
