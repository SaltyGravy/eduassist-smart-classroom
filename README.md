# EduAssist Smart Classroom

The public Faculty and Student portal for EduAssist. It is a standard Next.js
application prepared for Vercel and backed by Turso serverless SQLite.

The administrator interface is intentionally a separate application in
`admin-site/`; it is not linked from this public portal.

## Local development

1. Copy `.env.example` to `.env.local`.
2. Use a local SQLite URL such as `file:./data/eduassist.db`, or provide Turso
   credentials.
3. Install and start the app:

```bash
pnpm install
pnpm dev
```

Required production variables:

```text
TURSO_DATABASE_URL
TURSO_AUTH_TOKEN
ADMIN_BRIDGE_SECRET
```

`ADMIN_BRIDGE_SECRET` must contain at least 32 random characters and must match
the value configured on the private admin project.

## Database migration

The migration commands are designed to preserve users, password hashes, audit
history, classes, enrolments, attendance sessions, reports, and the six-month
student device-change history.

```bash
pnpm db:export-live -- data/eduassist-migration.snapshot.json
pnpm db:import-snapshot -- data/eduassist-migration.snapshot.json
pnpm db:verify
```

The import deliberately invalidates old-domain sessions and clears only the
current student browser registration. Students register their browser again on
the Vercel domain without consuming a device change.

## Included workflows

- Faculty and student accounts with forced first-login password changes
- Student-only device registration and second-device blocking
- Two device changes in a rolling six-month window
- Faculty classes, join codes, roster management, and enrolment checks
- Ten-second rotating QR attendance with a manual-code fallback
- Attendance corrections, student reports, faculty reports, and CSV export
- Protected server bridge for the separate administrator application

Notes uploads, AI summaries, and AI quizzes remain reserved for the next phase.

## Verification

```bash
pnpm lint
pnpm test
```
