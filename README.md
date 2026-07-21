# EduAssist

EduAssist is an interactive smart-classroom workspace with separate administrator,
faculty, and student experiences. It brings account administration,
device-registered access, persistent class management, secure QR attendance, and
verified attendance reporting into one calm, responsive interface.

## Prerequisites

- Node.js `>=22.13.0`

## Run locally

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) and use the role switcher on
the secure login screen. The one-time administrator credential is provided during
deployment handoff and is never displayed on the public login page.

## Administrator onboarding

1. Sign in to the **Admin** workspace with the bootstrap account.
2. The first login binds the account to that browser.
3. Replace the temporary password before the dashboard opens.
4. Create faculty and student accounts and share their temporary credentials privately.

The first successful login for every account registers it to the current browser
installation. Users can release their own device from their account menu. Only the
administrator can release somebody else's device for recovery.

## Included workflows

- Faculty overview with schedules, metrics, quick actions, and engagement trends
- Administrator dashboard for account creation, suspension, password reset, and recovery
- PBKDF2 password hashing, forced first-login password changes, and seven-day sessions
- One-device account binding with second-device blocking and controlled release
- Read-only audit history for login, device, password, and account actions
- Persistent faculty classes with unique student join codes
- Faculty roster management using existing student user IDs
- Two-to-five-minute QR attendance sessions with live check-ins and a manual-code fallback
- Enrolment, session-expiry, duplicate-submission, and class-membership checks on the server
- Automatic absent records when a session closes, plus faculty corrections for present/late/absent
- Faculty and student attendance reports with per-session history, percentages, and CSV export
- Mobile navigation and responsive views for smaller screens

Authentication, classes, enrolments, attendance sessions, check-ins, and reports
are persisted in D1. The Notes & AI Summary and Quiz sections are interface previews
reserved for the next project phase; they do not yet upload files, call an AI model,
or save generated content. Configure R2 storage and an AI provider before enabling
those workflows in production.

## Attendance workflow

1. The administrator creates the faculty and student accounts.
2. Faculty creates a class and shares its seven-character join code, or adds a student by user ID.
3. Faculty opens **Attendance**, chooses a two-to-five-minute duration, and generates the secure QR.
4. An enrolled student scans the QR from their registered device or enters its fallback code.
5. Faculty watches the roster update, closes the session, and corrects exceptions if needed.
6. Both roles open **Reports** to review the saved results or export CSV.

The browser model intentionally uses a random installation identifier rather
than hardware IMEI data, which browsers do not safely expose. A future native
mobile client can add Android Play Integrity or iOS App Attest verification.

## Commands

```bash
pnpm dev       # development server
pnpm build     # production build
pnpm test      # build and rendered-output checks
```
