# EduAssist

EduAssist is an interactive smart-classroom workspace with separate administrator,
faculty, and student experiences. It brings account administration,
device-registered access, attendance, AI-assisted study materials, quiz generation,
class management, and learning analytics into one calm, responsive interface.

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
- Four-minute QR-style attendance sessions with a live roster
- Study-material upload flow with generated summary cards
- Quiz generation, review, publishing, student attempts, and scoring
- Student directory, attendance breakdowns, and class analytics
- Mobile navigation and responsive views for smaller screens

Authentication and device registration are persisted in D1. Classroom content
remains demo data in browser state; connect the existing R2 binding and an AI
provider before using file processing or generated content in production.

The browser model intentionally uses a random installation identifier rather
than hardware IMEI data, which browsers do not safely expose. A future native
mobile client can add Android Play Integrity or iOS App Attest verification.

## Commands

```bash
pnpm dev       # development server
pnpm build     # production build
pnpm test      # build and rendered-output checks
```
