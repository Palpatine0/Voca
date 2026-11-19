# Voca on the Mac mini

Live: `https://voca.sethmccarthy.in`. The mini stores the application, account
data, words, and audio. Cloudflare Tunnel provides public HTTPS access.
The existing Expo web export remains the frontend; Caddy serves its files and
routes `/api` and `/supabase` to the appropriate containers.

## Current state — October 24, 2026

- Installed at `/Users/sethmccarthy/Services/voca` on
  `sethmccarthy@macmini.sethmccarthy.in`.
- Seven application containers and the public tunnel are running. The web
  listener is bound to `127.0.0.1:8088` and built for the public HTTPS address.
  HTTP requests through the tunnel redirect to HTTPS.
- Imported one account, one identity, eight words, and fourteen audio files.
  Original password hashes and word fields were compared with the export.
  Uploaded audio passed SHA-256 comparisons.
- A disposable account passed password login, word creation, direct ElevenLabs
  pronunciation, browser playback, review persistence, image lookup, and live
  OCR. Cross-account edits and unauthenticated API requests were denied. The
  disposable account and its media were removed afterward.
- Public HTTPS checks also passed password login, word creation, direct audio,
  image lookup, review persistence, anonymous access rejection, and account
  isolation. All fourteen imported files matched archived SHA-256 hashes.
  Browser login and playback were verified at the public address. The
  disposable public test account and its media were removed.
- Backup `20261024T101924Z` restored the app schemas into a disposable database:
  one account, eight words, fourteen objects. All fourteen archive files were
  readable. The verification removes its temporary database.
- User launch agents start Docker/Voca after login, prevent idle system sleep,
  and take a backup daily at 04:00 in the mini's local time.
- The domain is active on Cloudflare's free plan. Seven existing destination
  records were preserved. The main website returns HTTP 200 and both Mac names
  retain their Tailscale IPs. SMTP is unconfigured, so
  signup is disabled. Existing accounts can log in; recovery-link routing was
  checked without sending mail. Email delivery is not yet verified.
- Vercel redirects to the mini and its Git connection is disconnected. Koyeb
  is paused with deploy-on-push disabled. Supabase Cloud remains an unused rollback copy because browser
  control failed while preparing its pause. No cloud data was deleted.
  The source account and eight words still matched the export after Koyeb
  was paused. Cloud and mini data are not continuously synchronized.
- A full machine reboot and full platform disaster recovery have not been
  tested. Docker Desktop requires the macOS user to log in after reboot.

## Exact names

`VOCA_STACK_NAME=voca` controls the prefix.

| Role | Container |
| --- | --- |
| Website and request routing | `voca_web` |
| Voca API | `voca_api` |
| PostgreSQL | `voca_db` |
| Account login | `voca_auth` |
| Database HTTP API | `voca_rest` |
| Audio storage | `voca_storage` |
| Supabase routing | `voca_gateway` |
| Public tunnel, optional `public` profile | `voca_tunnel` |
| Admin UI, optional `admin` profile | `voca_admin` |
| Admin database service, optional `admin` profile | `voca_meta` |
| Temporary archive helper, `maintenance` profile | `voca_backup` |

The archive helper uses its exact name above and is removed after each run.
The persistent volumes are `_db_data`, `_db_config`, `_storage_data`, and
`_admin_snippets` under the same prefix. The network is
`voca_network`. Other Docker projects are independent.

On October 24, the running project was renamed from `prd_carrion-spike_voca`
to `voca`. The database, configuration, and storage volumes were copied while
stopped and compared byte-for-byte with ownership and extended attributes
preserved. Account, identity, word, and storage-object table fingerprints
matched after startup; all fourteen public audio files matched the source
archive. The old stopped containers and network were removed. Old volumes
remain as frozen rollback copies; they are not used by the running stack.
The migration record is in `backups/voca-rename-20261024T101720Z/` on the mini.

Only the web and admin gateway have host ports; both default to loopback.
The public web router exposes only auth, REST, and storage paths under
`/supabase`. Studio and database ports are not publicly exposed.

## Start or update

On a fresh checkout, with Node 22 or newer:

```sh
node deploy/mac-mini/init-env.mjs --site-url https://voca.sethmccarthy.in --copy-provider-keys
cd deploy/mac-mini
./run.sh up -d --build --wait --wait-timeout 180
./migrate.sh
```

`init-env.mjs` refuses to overwrite an existing `.env`. It generates independent
database and JWT credentials; it does not reuse Supabase Cloud's keys. Supply
working ElevenLabs and Unsplash keys in `.env` if the local API file contains
placeholders. `.env`, `secrets/`, and `backups/` must remain private and ignored
by Git. Never put service-role, database, or provider secrets in Expo build args.

The mini has no Node installation; generate the environment on the workstation
and securely copy it along with the checkout. Docker builds both applications.
For updates, copy source without local `node_modules`, `.git`, secret files, or
backups, then run `./run.sh up -d --build --wait --wait-timeout 180` on the mini.
Apply additive migrations with `./migrate.sh` when schema changes are included.

Preview from a workstation connected to the mini's Tailscale network:

```sh
ssh -N -L 8088:127.0.0.1:8088 sethmccarthy@macmini.sethmccarthy.in
```

Open `http://localhost:8088`. Localhost is a staging setting, not the eventual
public address. After public cutover, open the actual HTTPS domain instead.

## Cloud data transfer

The current app uses email/password auth, `public.words`, and the public
`voca-media` bucket. Its source inventory had no MFA factors. The migration
helper does not cover other tables, MFA, OAuth configuration, or other buckets.
Sessions are not imported, so users sign in again after moving.

Export a private JSON snapshot from the source project's SQL editor:

```sql
select jsonb_build_object(
  'exported_at', now(),
  'users', (select coalesce(jsonb_agg(to_jsonb(u)), '[]'::jsonb) from auth.users u),
  'identities', (select coalesce(jsonb_agg(to_jsonb(i)), '[]'::jsonb) from auth.identities i),
  'words', (select coalesce(jsonb_agg(to_jsonb(w)), '[]'::jsonb) from public.words w),
  'buckets', (select coalesce(jsonb_agg(to_jsonb(b)), '[]'::jsonb) from storage.buckets b),
  'objects', (select coalesce(jsonb_agg(to_jsonb(o)), '[]'::jsonb) from storage.objects o)
) as migration_backup;
```

This contains password hashes: save it only in the ignored, private backup
directory. If downloaded as CSV, parse the `migration_backup` cell as JSON.
After the destination services and Voca migrations are ready:

```sh
python3 restore-cloud.py backups/supabase-cloud-2026-10-24.json
```

The helper refuses nonempty destination account/word tables and restores them
in one transaction. Storage metadata is created through the storage API, not
copied into its tables. From the workstation, with its source `api/.env` and
destination `deploy/mac-mini/.env`, copy and verify the files:

```sh
node deploy/mac-mini/copy-cloud-storage.mjs \
  --backup deploy/mac-mini/backups/supabase-cloud-2026-10-24.json \
  --destination http://localhost:8088/supabase
```

This downloads the source audio, archives it locally, uploads it to the mini,
checks the bytes, and rewrites the imported words' audio URLs. It does not
modify the cloud source. Do not rerun account import against the populated mini.

## Public cutover

The active Cloudflare zone is `090f686461b8c7d65e5c3b885a7f8c17`.
Its assigned nameservers are `nancy.ns.cloudflare.com` and
`uriah.ns.cloudflare.com`, replacing `ns33.domaincontrol.com` and
`ns34.domaincontrol.com` after approval and GoDaddy's SMS identity check.
Existing destination records are DNS-only:

| Name | Type | Destination | TTL |
| --- | --- | --- | --- |
| `@` | A | `76.223.105.230`, `13.248.243.5` | 3600 |
| `macmini` | A | `100.101.4.13` | 600 |
| `macpro` | A | `100.78.43.3` | 600 |
| `www` | CNAME | `sethmccarthy.in` | 3600 |
| `_domainconnect` | CNAME | `_domainconnect.gd.domaincontrol.com` | 3600 |
| `_dmarc` | TXT | Existing GoDaddy DMARC value, unchanged | 3600 |

The GoDaddy zone export and prepared BIND import are retained privately under
`backups/`. Cloudflare's NS/SOA records replace GoDaddy's provider-managed ones.
The proxied `voca` CNAME points to
`e608e64e-71e0-4d3f-9b68-24d081b4e26f.cfargotunnel.com`. The tunnel is named
`prd_carrion-spike_voca`, with the sole published route to `http://web:8080`.

The following is the cutover procedure for reference; public cutover is complete.
Email delivery and pausing the unused cloud database remain outstanding.

1. Inventory every GoDaddy DNS record, including mail and verification records.
   Import and compare them in Cloudflare before changing nameservers. Preserve
   `macmini.sethmccarthy.in` as DNS-only with its existing Tailscale address.
   The registrar can remain GoDaddy. Follow Cloudflare's
   [full DNS setup](https://developers.cloudflare.com/dns/zone-setups/full-setup/setup/).
2. Configure a Cloudflare Tunnel named `voca` with published
   application `voca.sethmccarthy.in` and service `http://web:8080`. Use the
   [tunnel setup guide](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/get-started/create-remote-tunnel/).
   Do not route the admin gateway or database through it.
3. Save the tunnel token as `secrets/tunnel-token`. Keep the enclosing `secrets`
   directory mode `700`; set this one token file to `644` so the container's
   unprivileged user can read the read-only bind mount. Other secrets stay `600`.
4. Pause cloud app writes for the final comparison/export. Reconcile any cloud
   changes since the initial copy before directing people to the mini. Take a
   mini backup before applying changes.
5. Set `VOCA_SITE_URL=https://voca.sethmccarthy.in` in the mini's `.env` and rebuild
   the web image. Change only the old mini-origin prefix in saved audio URLs;
   preserve their bucket/object paths. Auth, storage, and API configuration
   follow the same environment value.
6. Run `./run.sh --profile public up -d --build --wait --wait-timeout 180`.
   Verify HTTPS, login, existing audio, new audio, photo import, saving reviews,
   and account isolation from a device outside Tailscale.
7. Configure SMTP credentials and sender identity; verify confirmation and
   recovery delivery before setting `DISABLE_SIGNUP=false`. Add native reset
   destinations if required by a future mobile build.
8. Keep the old services as rollback until public verification and a fresh backup
   are complete. Retire them only after accounting for writes on both systems.
   Existing native builds still use the previous URL: update their API,
   Supabase URL/key, and `EXPO_PUBLIC_SITE_URL` before building a replacement.

The web image embeds public URLs at build time; changing `.env` without
rebuilding it is insufficient. The database key is also independent of the old
project, so a frontend built with the old anon key cannot authenticate here.

## Backups and recovery

```sh
./backup.sh
python3 verify-backup.py backups/20261024T100425Z
```

`backup.sh` briefly stops Voca's writers, saves a matching PostgreSQL dump and
storage archive with extended attributes, then restarts the services even on
failure. Expect brief unavailability during the scheduled backup. Each snapshot
contains the private environment, roles, compose file, optional tunnel token,
archive index, checksums, and a `COMPLETE` marker only on success. A failed
snapshot has no marker. Snapshots are not automatically deleted.

`verify-backup.py` checks the hashes, restores `auth`, `public`, and `storage`
into a disposable database, and reads every stored file. This checks app-data
recovery; it does not rehearse restoring every platform extension or booting a
replacement Mac. For disaster recovery, create an isolated stack with the saved
image versions and credentials, restore the PostgreSQL ownership/roles and
database dump with the Supabase bootstrap schemas in place, and extract
`storage.tar.gz` with GNU tar's `--xattrs` into its storage volume while writers
are stopped. Verify login and every media link before switching traffic.

Keep an additional protected copy off the mini. Snapshots include reusable
credentials and account hashes; plain copies belong only on trusted storage.
Do not use `docker compose down -v`, which removes persistent data.

## macOS startup and operation

```sh
python3 install-launch-agents.py
./run.sh ps
./run.sh logs --tail 100 api
```

The installed labels are `in.sethmccarthy.voca.startup`,
`in.sethmccarthy.voca.keep-awake`, and `in.sethmccarthy.voca.backup`.
Their logs are under `secrets/logs/`. Startup launches Docker Desktop, waits for
its engine, and starts Voca; it includes the public profile when a token exists.
The keep-awake agent prevents idle system sleep, without changing global power
settings or the other containers. A logout/reboot still requires signing in to
the mini. Automatic recovery after power loss has not been configured or tested.

For an optional admin session, start `./run.sh --profile admin up -d`, forward
the mini's loopback port `8001` over SSH, and use the generated dashboard
credentials. The admin profile has not been part of the current live checks.

Supabase component files and pinned upstream provenance are in
[`supabase/UPSTREAM`](supabase/UPSTREAM). No managed Supabase service is needed
by the running mini stack. ElevenLabs and Unsplash remain external providers.
