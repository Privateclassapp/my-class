# My Class 2.1.0 — Backup, Standby and Client Failover

## What changed

- Added chunked export endpoints for mirroring the main backend.
- Added a second-account mirror that creates verified snapshots in Drive.
- Added a read-only standby server and a manual, checksum-verified promotion step.
- Added client-side failover for read requests, with all writes pinned to the
  primary backend.
- Added read-only banners and disabled student receipt submission while the
  standby is active.

No password-hashing algorithm, password-hash format, exported browser-backup
schema, backend storage layout or `BACKEND_SCHEMA_VERSION` changed.

## Files changed

### Main Apps Script project

- `backend/Code.gs`
  - `BACKEND_VERSION` is `2.1.0`.
  - Dispatch calls `standbyGuard_(action)` when `Standby.gs` is present.
  - Added `whoami` (same response as `authGetSession`).
  - Added `exportManifest` / `exportPart` dispatch cases.
  - Read-only login verifies credentials but skips all `users.json` writes;
    only `sessions.json` is written.
- `backend/Export.gs` (new)
  - `exportManifest` lists users, teacher data, receipts metadata, portals and
    receipt images with size, timestamp and SHA-256.
  - `exportPart` returns one item with a matching checksum.
  - Reuses the login lockout policy through `EXPORT_FAILURES` and
    `EXPORT_LOCKED_UNTIL`; `EXPORT_SECRET` is compared in constant time.
  - Sessions, tokens and `PASSWORD_PEPPER` are never exported or logged.
- `backend/Backup.gs` — unchanged.

### Second Apps Script project

- `backend/Code.gs` — paste the same updated file.
- `backend/BackupMirror.gs` (new)
  - `mirrorNow` fetches `exportManifest` / `exportPart` from
    `MAIN_BACKEND_URL` using `EXPORT_SECRET`.
  - Rejects HTML/non-JSON responses, retries four times with backoff, and
    validates every part's size and SHA-256.
  - Reuses unchanged files by checksum via `makeCopy`.
  - Creates `My Class Mirror/snapshot-YYYYMMDD-HHmmss` with
    `manifest.json` and the backend layout.
  - Stops at `MIRROR_TIME_BUDGET_MS = 270000` and installs a one-time
    `mirrorResume` trigger after 10 minutes.
  - `mirrorInstallTrigger` installs the nightly `mirrorNow` trigger (02:00).
  - Keeps the newest 30 snapshots; sends one short email after two consecutive
    failures.
  - Automatically restores the latest complete snapshot into this account's
    `My Class Backend` folder through `mirrorRestoreToBackend`.
  - `mirrorVerify`, `mirrorStatus`, `mirrorPrune` and `mirrorResume` are
    available for manual checks and recovery.
- `backend/Standby.gs` (new)
  - `STANDBY_READ_ONLY=true` enables the guard.
  - Allowed actions: `health`, `authLogin`, `authLogout`, `authGetSession`,
    `whoami`, `teacherPull`, `studentGetPortal`.
  - All other actions return `READ_ONLY`.
  - `promoteStandby()` verifies the latest complete snapshot, removes the
    mirror triggers, writes `promoted.json`, then clears `STANDBY_READ_ONLY`.
  - After promotion, `mirrorNow` skips restoring an old snapshot so it cannot
    overwrite writes made by the new primary.

### Static client

- `config.js` — added optional `fallbackUrl`.
- `api.js`
  - Default timeout is 20 seconds.
  - Infrastructure-only failover on network, timeout, HTTP 5xx/429, invalid
    JSON or HTML.
  - Two failures within five minutes open a five-minute breaker; the next call
    retries the standby. After the breaker expires, the primary is probed again.
  - `forcePrimary`, `backend` and per-backend `tokens` options.
  - `retryPrimary()`, `status()` and `activeBackend()` helpers.
- `auth.js`
  - Teacher sessions are stored separately:
    `my-class-session-v2` and `my-class-session-v2:standby`.
  - Calls carry both tokens and the API selects the token for the chosen
    backend.
- `sync.js` — every sync call uses `forcePrimary: true`.
- `accounts.js` — account-management calls use `forcePrimary: true`.
- `app.js`
  - Backup banner with a retry button.
  - Settings shows backup status and retry action.
  - Version is `2.1.0`.
- `student/student.js`
  - Student sessions are stored separately:
    `my-class-student-session-v2` and
    `my-class-student-session-v2:standby`.
  - Backup banner and retry button.
  - Receipt submission uses `forcePrimary: true`.
  - The receipt form is disabled while the standby is active.
  - Logout clears both stored sessions.
- `i18n.js` — added backup read-only, retry and recovery strings in FA/EN.
- `styles.css` — banner retry button styling.
- `sw.js` / `student/sw.js` — cache version `2.1.0`.
- `README.md`, `PLAN.md`, `backend/README.md` — deployment, mirror, standby,
  promotion, failover and split-brain documentation.

### Tests

- `tests/helpers/appsScriptMock.js` — timestamps/size on fake files, one-time
  trigger support, shared Drive option, default `Export.gs` loading.
- `tests/export.test.js` (3), `tests/mirror.test.js` (5),
  `tests/standby.test.js` (2), `tests/failover.test.js` (6),
  `tests/auth-failover.test.js` (1).
- Full suite: **55/55 passing** with `node --test tests/*.test.js`.

## Deployment order

1. Take a browser JSON backup and, if possible, run `backupCreateSnapshot` on
   the current main backend.
2. Main Apps Script project: paste `Code.gs` and `Export.gs`; deploy a new
   version on the same deployment. The `/exec` URL should not change.
3. Confirm `exportManifest` works with `EXPORT_SECRET`.
4. Second Google account: create the Apps Script project and paste `Code.gs`,
   `BackupMirror.gs` and `Standby.gs`.
5. In the second project's Script Properties set:
   - `MAIN_BACKEND_URL` (full `/exec` URL of the main backend)
   - `EXPORT_SECRET` (same value as the main backend)
   - `PASSWORD_PEPPER` (copied by hand, same as the main backend)
   - `STANDBY_READ_ONLY=true`
6. Deploy the second project as a Web app (Execute as: Me, Anyone).
7. Run `mirrorNow` manually and confirm `mirrorStatus` shows a complete
   snapshot. Run `mirrorVerify` and confirm no errors.
8. Run `mirrorInstallTrigger` for the nightly mirror.
9. Deploy the static site with the updated files. Set `backendUrl` to the main
   `/exec` and `fallbackUrl` to the standby `/exec`. Do not set `fallbackUrl`
   until the mirror and standby are ready.
10. Open the app once online so the new service worker caches the 2.1.0 shell.

## Promotion

1. Stop writes to the old primary.
2. On the standby project, run `mirrorNow` and wait for completion.
3. Run `mirrorVerify`; require `ok: true` and `complete: true`.
4. Run `promoteStandby`; it removes the old mirror triggers, writes
   `promoted.json` and clears `STANDBY_READ_ONLY`.
5. Update `config.js` so the new `/exec` is `backendUrl`; clear or repoint
   `fallbackUrl`.
6. Keep the old primary read-only or shut it down. If both accept writes, the
   copies can split-brain and diverge.

## Known limits

- Mirror data can be up to a day old. Sessions are not mirrored.
- A standby token is separate from the primary token; users may need to sign in
  again on the backup server.
- The mirror does not copy `sessions.json`, `promoted.json` or `_Backups`.
- `PASSWORD_PEPPER` must be copied by hand; losing it invalidates logins.
- Promotion is manual and checks checksums only; it cannot decide which copy is
  authoritative after a split-brain event.
