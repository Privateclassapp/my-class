# My Class v2 — Backend Redesign Plan

## Decisions

- One owner-run Google Apps Script backend stores data in the owner's Drive.
- Owner gets a personal teacher workspace and owner-only admin.
- Usernames are globally unique. One student account per teacher/student.
- Teacher/owner sessions last 7 days; student sessions last 30 days.
- No automatic merge. Sync conflicts require an explicit pull or overwrite.
- Receipt images are fetched on demand and never embedded in synced JSON.
- Generated passwords are 12 unambiguous characters and are shown once.
- Existing browser data can be imported. Old Google Drive data is not migrated.
- The owner admin API and UI expose account metadata only, never teacher records.
- A second Apps Script project mirrors the main backend's data through the
  export API and serves as a read-only warm standby. It is not a live replica.
- The client may fall back to the standby for reads only after two
  infrastructure failures within five minutes. Every write is pinned to the
  primary backend.
- Promotion is manual, verifies the latest snapshot, and accepts split-brain
  risk once both accounts can write.

## Architecture

- The teacher PWA and student PWA call Apps Script through `config.js` → `backendUrl`
  and optional `fallbackUrl`.
- All requests are JSON POSTed as `text/plain`; responses use `{ ok, data }` or
  `{ ok:false, error:{ code, message } }`.
- Teacher data stays local-first in IndexedDB. The backend stores the synced copy.
- Local IndexedDB is scoped by teacher account. The legacy DB is adopted once.
- Student writes require the backend. The last portal is cached for offline reading.
- The teacher client builds student portal snapshots from existing billing/portal logic.
- The backend validates and stores those snapshots and overlays unsynced receipts.
- The backup project writes immutable snapshots under `My Class Mirror/` and
  restores the newest complete snapshot into its own backend folder.
- The standby keeps `STANDBY_READ_ONLY=true`; only login/session, `whoami`,
  `teacherPull` and `studentGetPortal` are allowed. Login in read-only mode
  writes only the standby's own `sessions.json`, never `users.json`.

## Storage

```text
users.json
sessions.json
teachers/<teacherId>/data.json
teachers/<teacherId>/receipts.json
students/<studentId>/portal.json
students/<studentId>/receipts/<receiptId>.<ext>
```

Teacher data uses integer revisions and `baseRevision`. A stale push returns
`SYNC_CONFLICT` without changing either side. Receipts deduplicate by submission ID.

Mirror layout:

```text
My Class Mirror/
  snapshot-YYYYMMDD-HHmmss/
    manifest.json
    users.json
    teachers/<teacherId>/data.json
    teachers/<teacherId>/receipts.json
    students/<studentId>/portal.json
    students/<studentId>/receipts/<receiptId>.<ext>
```

Sessions and `promoted.json` are never exported or copied into a snapshot.
The mirror keeps the newest 30 snapshots.

## API

- Auth: `authLogin`, `authLogout`, `authGetSession`, `authChangePassword`
- Student: `studentGetPortal`, `studentSubmitReceipt`
- Teacher: `teacherPull`, `teacherPush`, `teacherDeleteAll`, `teacherListReceipts`,
  `teacherGetReceiptImage`, `teacherAckReceipts`
- Student accounts: `teacherListStudentAccounts`, `teacherCreateStudentAccount`,
  `teacherResetStudentPassword`, `teacherSetStudentAccountStatus`
- Owner: `adminListTeachers`, `adminCreateTeacher`,
  `adminResetTeacherPassword`, `adminSetTeacherStatus`
- Export: `exportAll`, `exportManifest`, `exportPart` protected by `EXPORT_SECRET`
- Backup: `exportAll` protected by `EXPORT_SECRET`
- Standby: `whoami` plus the read-only allowlist above
- Health: `health`

## Security

- Salted, iterated HMAC-SHA256 password hashes with constant-time comparison.
- Random session tokens; only token hashes are stored.
- Password reset and change revoke the account's sessions.
- IDs are taken from the session, never from request payloads.
- `LockService` around writes; schemas, sizes, MIME types, IDs and links validated.
- Account lockout after repeated failures; generic authentication errors.
- No secrets, tokens, request bodies, or receipt content in logs.
- No Google OAuth, Picker, API keys, `drive.js`, or Drive sharing.
- The owner's Drive account still controls stored data at rest; document this.
- Export/mirror failures are throttled and never include SECRET values in logs.
- The standby never accepts writes until `promoteStandby()` verifies a complete
  snapshot and writes `promoted.json`. After promotion, returning the old primary
  can cause conflicting writes; the owner must choose one copy and retire the other.

## Phases

### Phase 1 — Backend foundation, API client, student portal (done)

- Add `backend/Code.gs`, `backend/appsscript.json`, `backend/README.md`.
- Implement owner setup, all backend actions, validation, locks, sessions, receipts.
- Add `api.js`.
- Rewrite `/student` to use username/password and the backend.
- Add student auth i18n, styles, service-worker shell, and tests.
- Verify deployment and CORS before continuing.

### Phase 2 — Teacher auth, migration, sync, receipts (done)

- Scope IndexedDB per account; adopt legacy data once with confirmation.
- Replace setup/PIN gate with login, optional PIN, session expiry, and offline mode.
- Rewrite `sync.js` for revisions, conflicts, receipts, and portal snapshots.
- Remove Drive, Google email/portal fields, and Drive receipt previews.
- Update settings, money pages, service worker, config, i18n, and tests.

### Phase 3 — Credential management and owner admin (done)

- Add owner-only `#/admin` teacher account management.
- Add student account create/reset/disable UI with one-time share text.
- Add role-authorization tests.

### Phase 4 — Backup, cleanup, documentation, release (done)

- Add `backend/Backup.gs` with dated snapshots, retention, and failover instructions.
- Delete `drive.js` and remove all Google OAuth/Picker remnants.
- Reduce `config.js` to `{ backendUrl: '' }`.
- Rewrite the Persian README with deployment, privacy, backup, and troubleshooting.
- Bump app/service-worker versions to `2.0.0`.
- Run all tests and publish the final file/deployment inventory.

### Phase 5 — Chunked export API (done, v2.1.0)

- Add `backend/Export.gs` with `exportManifest` and `exportPart`.
- Export users, teacher data, receipts metadata, portals and receipt images.
- Protect the export with `EXPORT_SECRET` and the same lockout policy as login.

### Phase 6 — Second-account mirror (done, v2.1.0)

- Add `backend/BackupMirror.gs` to the second Apps Script project.
- Snapshot the main backend through the export API, reusing unchanged files by
  checksum and validating every downloaded part.
- Keep 30 snapshots, resume long runs with a one-time trigger, email after two
  consecutive failures, and restore the newest complete snapshot automatically.

### Phase 7 — Read-only standby and promotion (done, v2.1.0)

- Add `backend/Standby.gs` and the `STANDBY_READ_ONLY` guard in `Code.gs`.
- Allow login/session, `teacherPull`, `studentGetPortal` and `health` only.
- Login in read-only mode writes only `sessions.json`.
- `promoteStandby()` verifies the latest complete snapshot, removes mirror
  triggers, writes `promoted.json`, then clears the read-only flag. A promoted
  server skips automatic restore from the old primary.

### Phase 8 — Client failover and release (done, v2.1.0)

- Add `fallbackUrl` to `config.js`, infrastructure-only failover and a
  five-minute breaker in `api.js`.
- Store primary and standby sessions under separate keys.
- Pin sync and account-management writes to the primary backend.
- Show read-only backup banners and disable student receipt submission while
  the standby is active.
- Bump app/service-worker/backend versions to `2.1.0`.

## Verification

- `node --test tests/*.test.js`
- Deploy smoke test: `health`, login, student portal, receipt upload,
  `exportManifest`, `mirrorNow`, standby read-only rejection, `promoteStandby`.
- Manual: owner setup, account creation, legacy import, push/pull, conflict,
  offline editing, receipt review, disabled accounts, backup restore,
  failover banner, retry to primary, PWA update.
