# EduAssist

EduAssist is an interactive smart-classroom workspace for faculty and students.
It brings device-registered access, attendance, AI-assisted study materials,
quiz generation, class management, and learning analytics into one calm,
responsive interface.

## Prerequisites

- Node.js `>=22.13.0`

## Run locally

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) and use the role switcher in
the secure login screen to explore both workspaces.

### Demo credentials

| Role | User ID | Password |
| --- | --- | --- |
| Faculty | `FAC001` | `Faculty@123` |
| Student | `STU001` | `Student@123` |

The first successful login registers that account to the current browser
installation. Use **Release this device** from the account menu before moving
the account to another browser. Faculty can also release a demo student's device
from the student roster.

## Included workflows

- Faculty overview with schedules, metrics, quick actions, and engagement trends
- Password-hashed faculty/student accounts with seven-day sessions
- One-device account binding with controlled device release
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
