# The Preventable Visit Detector

A care coordinator console that uses an AI agent to identify patients at high risk of a preventable ED visit, score them across clinical and social factors, and route outreach decisions through a human-approval loop — with every approval logged to a persistent audit ledger.

**Live demo:** https://my-agent.superkart.workers.dev

Built for the UIC INFORMS Hackathon — *Build with Claude: Agents for Healthcare* (May 2026).

---

## What it does

The agent follows a multi-step workflow without being prompted to:

1. **Rank** — pulls the full patient population and scores each patient on a 14-point risk scale
2. **Score** — breaks down the exact factors driving a patient's risk (ED visits, care plan gaps, chronic conditions, polypharmacy, debt, SDOH barriers)
3. **Draft** — writes a 2–3 sentence outreach message addressed to the coordinator, naming the specific barrier
4. **Record** — pauses and surfaces an approval dialog; the coordinator can edit the draft and add local context ("daughter drives Tuesdays") before approving
5. **Task** — creates a follow-up task with a due date, also gated behind coordinator approval
6. **Confirm** — summarizes what was logged and when

The human is never bypassed. The agent drafts; the coordinator decides.

---

## Features

- **AI chat** — conversational interface backed by Cloudflare Workers AI (Kimi K2.6). Ask anything: "Who are my highest-risk patients?", "Tell me about Lindsay Brekke's care gaps", "Draft outreach for the top 3 ED utilizers."
- **Population Risk Dashboard** — all 117 patients scored and ranked in real time; filterable by risk level (critical / high / medium / low), sortable by score, ED visits, conditions, or cost
- **Patient Metrics** — deep profile for any patient: active conditions, medications, SDOH flags, outstanding debt, care plan status
- **Health equity view** — high-risk rate broken down by race to surface systemic care gaps
- **Cost opportunity panel** — total preventable ED/inpatient spend, share from critical+high patients, estimated savings at 30% prevention
- **Decision Ledger** — real-time audit trail (right rail) of every coordinator-approved decision, persisted in Durable Object SQLite and updated via WebSocket broadcast
- **Reports tab** — exportable summaries (CSV / JSON / text)
- **Dark / light theme**, mobile-responsive layout

---

## Risk scoring formula

| Factor | Points |
|---|---|
| ED visits > 5 | +3 |
| No active care plan | +2 |
| Chronic conditions > 10 | +2 |
| Polypharmacy (≥ 5 active meds) | +1 |
| Outstanding debt > $10k | +1 |
| SDOH flags (housing / transport / food / safety) | +1 each, capped at +2 |
| **Max** | **14** |

Risk levels: **critical** ≥ 60% · **high** ≥ 43% · **medium** ≥ 25% · **low** < 25%

---

## Tech stack

| Layer | Technology |
|---|---|
| Runtime | Cloudflare Workers |
| Agent state + audit ledger | Cloudflare Durable Objects (built-in SQLite) |
| AI model | Workers AI — Kimi K2.6 (`@cf/moonshotai/kimi-k2.6`) |
| Frontend | React + TypeScript + Vite |
| UI components | Cloudflare Kumo design system |
| Patient data | Live read-only HTTP API (Synthea synthetic dataset, 117 patients) |
| Deployment | Cloudflare Workers + Assets (auto-deploy on push) |

---

## Agent tools

| Tool | Gate | Purpose |
|---|---|---|
| `queryDatabase` | Auto | Raw SQL SELECT against the patient dataset |
| `getPatientRiskScore` | Auto | Full risk breakdown for one patient (same formula as the dashboard) |
| `getTopRiskPatients` | Auto | Population ranked by risk score, with population stats |
| `recordDecision` | Human approval | Writes coordinator-approved outreach to the audit ledger |
| `createTask` | Human approval | Schedules a follow-up task tied to an approved decision |

---

## Running locally

```bash
# 1. Install dependencies
cd my-agent
npm install

# 2. Log in to Cloudflare (required for the remote AI binding)
npx wrangler login

# 3. Start the dev server
npm run dev
```

Open http://localhost:5173

## Deploying

```bash
npm run deploy
```

Builds the frontend and deploys the Worker. Takes about 30 seconds.

---

## Dataset

117 synthetic patients generated with [Synthea](https://github.com/synthetichealth/synthea). Queryable via a public read-only HTTP API — no auth required.

```bash
curl -X POST https://uic-hackathon-data.christian-7f4.workers.dev/query \
  -H "Content-Type: application/json" \
  -d '{"sql": "SELECT first, last, ed_visits, chronic_condition_count FROM patient_summary ORDER BY ed_inpatient_total_cost DESC LIMIT 5"}'
```

Tables: `patient_summary`, `encounters`, `conditions`, `medications`, `observations`, `procedures`, `claims_transactions`, `careplans`, `patients`
