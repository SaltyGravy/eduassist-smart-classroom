# EduAssist

EduAssist is an interactive smart-classroom workspace for faculty and students.
It brings attendance, AI-assisted study materials, quiz generation, class
management, and learning analytics into one calm, responsive interface.

## Prerequisites

- Node.js `>=22.13.0`

## Run locally

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) and use the role switcher in
the top-right corner to explore both faculty and student workflows.

## Included workflows

- Faculty overview with schedules, metrics, quick actions, and engagement trends
- Four-minute QR-style attendance sessions with a live roster
- Study-material upload flow with generated summary cards
- Quiz generation, review, publishing, student attempts, and scoring
- Student directory, attendance breakdowns, and class analytics
- Mobile navigation and responsive views for smaller screens

The current build is a functional product demo: data is held in browser state so
every workflow can be tried without credentials or setup. Connect the existing
D1/R2 bindings and an AI provider before using it for persistent production data.

## Commands

```bash
pnpm dev       # development server
pnpm build     # production build
pnpm test      # build and rendered-output checks
```
