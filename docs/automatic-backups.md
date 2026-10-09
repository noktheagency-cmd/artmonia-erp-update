# Artmonia encrypted full backups

## Schedule and storage

`.github/workflows/nightly-backup.yml` runs at **03:17 Asia/Baku** every night
(`23:17 UTC` on the previous day), and supports manual `workflow_dispatch` runs.
GitHub only schedules the workflow from the default branch. Scheduled runs may
be delayed or dropped by GitHub; enable failed-workflow notifications and check
the latest completion marker when checking backup health. There is no independent
stale-backup alert configured by this workflow.

The flow is:

`GitHub Actions → full PostgreSQL + full file export → tar/gzip → age encryption → private Cloudflare R2 → read-back checksum → completion marker → 30-day retention`

Every successful snapshot is self-contained. All files are copied on **every**
run, rather than requiring earlier incremental snapshots for recovery. An older
snapshot also preserves files subsequently deleted from the live source.

Objects are stored under:

```text
artmonia-backups/v1/<project-ref>/<UTC-timestamp>_<random-id>/
  snapshot.tar.gz.age
  complete.json
```

Only the encrypted archive and a non-sensitive completion marker are uploaded.
No raw database, manifest, filenames or object contents are committed to Git or
uploaded as GitHub Actions artifacts. The private decryption identity stays with
the owner, outside GitHub and outside the R2 bucket.

## Required setup

1. Create a **private** R2 Standard bucket named `artmonia-backups`. Keep public
   access disabled. Create a dedicated R2 Object Read & Write token restricted to
   this bucket; this permission includes the deletions needed for retention.
2. Install `age` from its official distribution. Generate an identity with
   `age-keygen -o <secure-location>/artmonia-backup-identity.txt`. Save the private
   identity in a password manager or another protected offline location, with an
   additional recoverable copy. Losing it makes all existing archives unreadable.
   `age-keygen -y <identity-file>` prints the public `age1...` recipient.
3. Download the project's CA certificate from Supabase **Database Settings → SSL
   Configuration**. Backups verify both the certificate and the hostname. Do not
   disable TLS verification to work around a missing certificate.
4. Add the following in GitHub **Settings → Secrets and variables → Actions**.
   Never send secret values through chat or put them in committed files.

| GitHub Actions secret | Value |
| --- | --- |
| `BACKUP_DB_URL` | This project's session pooler URL on port **5432**, including the database password |
| `BACKUP_DB_CA_CERT` | Full PEM contents of the downloaded Supabase CA certificate |
| `BACKUP_SUPABASE_SERVICE_KEY` | This project's server-only Supabase service role key for private-file reads |
| `BACKUP_R2_ACCOUNT_ID` | Cloudflare account ID |
| `BACKUP_R2_ACCESS_KEY_ID` | Dedicated backup bucket's S3 Access Key ID |
| `BACKUP_R2_SECRET_ACCESS_KEY` | Dedicated backup bucket's S3 Secret Access Key |

| GitHub Actions variable | Value |
| --- | --- |
| `BACKUP_AGE_RECIPIENT` | Public `age1...` recipient; **never the private identity** |
| `BACKUP_R2_BUCKET` | `artmonia-backups` by default; set this if a different bucket is used |

The database URL is checked against `azhriwieowdeuvbqjqvl`. Transaction pooler
port 6543 and another project's username are rejected. Prisma-specific query
parameters are removed; credentials are passed through subprocess environment
variables, not command arguments or logs.

When an existing local `.env.local` contains the verified project's credentials,
the owner can configure the Supabase settings and public age recipient without
copying secret values manually:

```bash
node scripts/backup/configure-github.mjs /path/to/age-keygen /secure/artmonia-backup-identity.txt /path/to/supabase-ca.crt .env.local
```

This requires an authenticated `gh` CLI. Values travel through stdin into GitHub
Secrets and are not logged. Existing secrets are preserved; changing a configured
encryption recipient is rejected. The private identity is never uploaded.

At initial implementation, the production Railway service has **no configured
Cloudflare R2 HR storage variables**. Supabase Storage is inventoried dynamically,
so existing and future Supabase buckets are covered without a hardcoded bucket
list. If HR storage or another source R2 bucket is enabled, also configure:

| Setting | Type | Value |
| --- | --- | --- |
| `BACKUP_SOURCE_R2_BUCKETS` | Variable | Comma-separated list of **all** source R2 bucket names |
| `BACKUP_SOURCE_R2_ACCOUNT_ID` | Secret | Source Cloudflare account ID |
| `BACKUP_SOURCE_R2_ACCESS_KEY_ID` | Secret | Source token's Access Key ID |
| `BACKUP_SOURCE_R2_SECRET_ACCESS_KEY` | Secret | Source token's Secret Access Key |

Use a separate **read-only** source token. Partial source configuration fails the
job. The destination backup bucket cannot also be a source bucket.

## Coverage and consistency

- `database.dump`: one PostgreSQL custom-format logical dump using an exported
  repeatable-read snapshot, with **no schema/table exclusion**. This includes the
  ERP, public tables, Auth accounts, Storage metadata and migration history that
  PostgreSQL's logical dump exports. PostgreSQL system catalogs and physical WAL
  are not a logical backup; extension-managed internal data follows PostgreSQL's
  extension export rules. This is not point-in-time recovery.
- `roles.sql`: database role definitions, **without role passwords**.
- `database.toc`: archive inventory, checked for required ERP, Auth, Storage and
  Supabase migration tables before upload.
- `vault-secrets.json`: Vault secrets exported into the protected, encrypted
  payload, allowing re-encryption with a replacement project's root key. Never
  print this file or upload it separately. Treat recovered contents as credentials.
- `objects/*.bin`: complete Supabase object payloads, and configured source R2
  payloads. Original bucket names, paths, MIME types, checksums and sizes are in
  the encrypted `manifest.json`; filenames are never used as local paths.
- `recovery/`: Prisma and Supabase migration sources from the workflow's commit.

The current database is PostgreSQL **17**. A major-version change fails safely
until the backup tools are reviewed. `pg_dump`, `pg_dumpall` and `pg_restore`
execute in the PostgreSQL 17 Docker image pinned by its manifest digest. The workflow installs locked Node
dependencies without lifecycle scripts and uses the official Ubuntu age package.

PostgreSQL and object stores do not offer a shared atomic snapshot. The manifest
is based on database snapshot metadata; changed Supabase metadata, missing files,
wrong sizes, or changed R2 inventories fail the run. Plan major file imports and
schema migrations outside the backup window. Rerun a failed complete backup.

Supabase project-level settings (SMTP/OAuth configuration, API/JWT keys, domains,
webhook credentials, Edge Function secrets) are **not database rows** and require
separate protected configuration records. Supabase Vault/column-encryption root
keys must be preserved separately if those features hold data. Vault secrets have
an additional encrypted recovery export; other encrypted database columns still
require their original root keys. A raw dump alone cannot decrypt them on a
different project.

## Verification and retention

The upload must pass a full **R2 download + SHA-256 and byte-length comparison**
before `complete.json` is written. A failed export, download, encryption, upload,
verification or marker write cannot trigger retention deletion. Each run has a
unique ID, including retries within the same second.

After a successful backup, the script removes only this project's recognized
archive/marker keys dated at least 30 days before the run started. It preserves
the new snapshot and never deletes application files, another project, unknown
keys or the source buckets. Old incomplete archives are also removed during a
later successful run. Without successful runs, old snapshots remain for safety;
the retention target is therefore not a provider-enforced expiration policy.

Single-object upload currently supports archives below 5 GiB. Larger snapshots
fail explicitly and require a reviewed multipart-upload implementation.

Daily **full** file downloads count toward Supabase egress. Budget both the
database dump and all file bytes multiplied by about 30 runs/month, plus normal
application traffic. R2 retention capacity must hold about 30 full encrypted
archives, including the other buckets' usage on the same account. Free-tier
operation is conditional on these limits; backup frequency/coverage must not be
silently reduced when a limit is approached.

## First-run acceptance

1. After the workflow reaches `main` and all settings are present, open GitHub
   **Actions → Nightly encrypted full backup → Run workflow**.
2. Confirm the job succeeds, and R2 contains `snapshot.tar.gz.age` together with
   its `complete.json` under the same dated directory.
3. Download the archive and verify recovery on a trusted machine:

   ```bash
   age --decrypt --identity /secure/artmonia-backup-identity.txt --output snapshot.tar.gz snapshot.tar.gz.age
   mkdir -p tmp/backup-recovery
   tar -xzf snapshot.tar.gz -C tmp/backup-recovery
   node scripts/backup/verify.mjs tmp/backup-recovery
   ```

4. In a separately identified disposable **test** target, review the PostgreSQL
   archive inventory, restore the application schemas and Auth data, recreate the
   Storage buckets/policies and upload file payloads using the manifest's original
   paths. Check student/payment totals, one ERP login and opening private receipts.
   Enable cron/integrations only after verification to prevent external side effects.
5. Confirm the next night's successful run appears in R2. Enable GitHub's workflow
   failure notifications for the repository owner.

`verify.mjs` only verifies decrypted database/file checksums and inventory; it
never writes to a database. Successful checksums are not a completed database
restore test. Do not restore a full managed Supabase archive blindly into an
existing project: managed Auth/Storage objects, ownership, grants, extensions and
triggers need a reviewed restore plan. Preserve the old target and verify the new
one before cutover. Never replay historical data-repair migrations automatically
on a restored database. New-project public file URLs may also need rebinding.

## Local checks

```bash
node --test scripts/backup/core.test.mjs
npm test
```

Tests use synthetic data only and cover wrong-project/port rejection, missing
source credentials, 30-day boundaries, retention scope, retry identity, failed
uploads/verification/marker writes, stream checksums, UTF-8 paths and corrupted
or missing decrypted payloads. Live R2 upload and a real restore must be checked
separately; unit tests do not claim either.

The workflow also runs `scripts/backup/age.test.mjs` against the installed age
binaries, proving a synthetic round trip and rejection of altered ciphertext.
For the same local check, set `AGE_TEST_AGE_BIN` and `AGE_TEST_KEYGEN_BIN` to the
age and age-keygen executable paths. This test never uses the owner's identity.

## References

- [Supabase backups](https://supabase.com/docs/guides/platform/backups)
- [Supabase CLI recovery considerations](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore)
- [Supabase SSL verification](https://supabase.com/docs/guides/platform/ssl-enforcement)
- [GitHub schedule behavior](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)
- [R2 API tokens](https://developers.cloudflare.com/r2/api/tokens/)
- [age encryption](https://github.com/FiloSottile/age)
