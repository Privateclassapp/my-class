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

## Architecture

- The teacher PWA and student PWA call Apps Script through `config.js` → `backendUrl`.
- All requests are JSON POSTed as `text/plain`; responses use `{ ok, data }` or
  `{ ok:false, error:{ code, message } }`.
- Teacher data stays local-first in IndexedDB. The backend stores the synced copy.
- Local IndexedDB is scoped by teacher account. The legacy DB is adopted once.
- Student writes require the backend. The last portal is cached for offline reading.
- The teacher client builds student portal snapshots from existing billing/portal logic.
- The backend validates and stores those snapshots and overlays unsynced receipts.

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

## API

- Auth: `authLogin`, `authLogout`, `authGetSession`, `authChangePassword`
- Student: `studentGetPortal`, `studentSubmitReceipt`
- Teacher: `teacherPull`, `teacherPush`, `teacherDeleteAll`, `teacherListReceipts`,
  `teacherGetReceiptImage`, `teacherAckReceipts`
- Student accounts: `teacherListStudentAccounts`, `teacherCreateStudentAccount`,
  `teacherResetStudentPassword`, `teacherSetStudentAccountStatus`
- Owner: `adminListTeachers`, `adminCreateTeacher`,
  `adminResetTeacherPassword`, `adminSetTeacherStatus`
- Backup: `exportAll` protected by `EXPORT_SECRET`
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

## Verification

- `node --test tests/*.test.js`
- Deploy smoke test: `health`, login, student portal, receipt upload.
- Manual: owner setup, account creation, legacy import, push/pull, conflict,
  offline editing, receipt review, disabled accounts, backup restore, PWA update.
