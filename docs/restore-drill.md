# Database restore drill

A backup only counts once a restore has been tested. Do this **every quarter** and after any change to
the Atlas tier or backup settings. It takes about 30 minutes, and a temporary Flex cluster for an hour or
two costs a few cents.

What it proves: prod snapshots exist, can be restored, contain recent data, and how long a restore takes
(your real recovery time).

## Rules

- **Never restore over `prod`.** Always restore into a new, temporary cluster.
- Keep the temporary cluster in the **prod** Atlas project. It holds real user data, so it must not end
  up in the staging project.
- Delete it the same day.

## Steps

1. **Note the start time.**
2. **Create the target.** In the prod Atlas project, create a Flex cluster named `restore-drill`
   (AWS, Mumbai). Add no database users and no extra network access; use your admin access only.
3. **Restore.** Open cluster `prod` → Backup → Snapshots. Pick the most recent snapshot, choose
   Restore, and set the target to **`restore-drill`**. Read the target name twice before confirming.
4. **Wait** for the restore to finish, and note the time.
5. **Compare** collection counts. The restored counts should be equal to or a bit lower than prod
   (writes since the snapshot):

   ```bash
   counts='db.getSiblingDB("job-platform").getCollectionNames().sort()
     .forEach(c => print(c, db.getSiblingDB("job-platform")[c].estimatedDocumentCount()))'
   mongosh "$PROD_URI"    --quiet --eval "$counts" > prod.txt
   mongosh "$RESTORE_URI" --quiet --eval "$counts" > restored.txt
   diff -y prod.txt restored.txt
   ```

6. **Check freshness.** The newest document should be close to the snapshot time. The time comes from
   each `_id`, since not every collection has `createdAt`:

   ```bash
   mongosh "$RESTORE_URI" --quiet --eval '
     const d = db.getSiblingDB("job-platform");
     ["users", "jobs", "applications", "chatmessages"].forEach(c => {
       const last = d[c].find({}, {_id: 1}).sort({_id: -1}).limit(1).next();
       print(c, last ? last._id.getTimestamp().toISOString() : "(empty)");
     })'
   ```

7. **Spot-check** one real record you know: a user can be found by email, and a job has its company.
8. **Delete** `restore-drill`. Remove `prod.txt` / `restored.txt` (`shred -u`).
9. **Record** the result below.

## If a real restore is ever needed

Same steps, then point production at the restored cluster:

1. Create a database user on the restored cluster (as in `infra/DATA.md`), and allow network access.
2. Update `MONGODB_URI` in `/job-platform/prod/api` and force a new deployment (`docs/runbook.md`).
3. Keep the old cluster until you've confirmed nothing else needs recovering from it.

Flex restores whole snapshots (daily). Restoring to a point in time between snapshots needs M10+ with
continuous backup.

## Drill log

| Date | Snapshot time | Restore took | Counts OK | Freshness OK | By | Notes |
|---|---|---|---|---|---|---|
| | | | | | | First drill after prod goes live |
