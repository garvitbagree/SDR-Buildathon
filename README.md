# Reachwell: Inter Guild Buildathon

Multi-channel autonomous SDR system: a campaign control plane (React + FastAPI)
plus an agentic outreach engine, with DronaHQ as the Agentic AI layer for two of
the seven agents and a Groq-backed local fallback for all of them.

## Structure
- `frontend/`                          React + Vite + TypeScript control plane UI
- `backend/`                           FastAPI service (campaigns, prompts, reps, pipeline, conflicts, controls)
- `backend/app/agents/`                The 7 SDR agents: ICP fitment, research, strategy, personalisation, conversation, follow-up, voice
- `backend/app/integrations/dronahq/`  DronaHQ webhook integration (ICP fitment + personalisation), with local-LLM fallback
- `backend/app/integrations/gmail.py`  IMAP poller that matches real inbound replies back to prospects
- `backend/tests/`                     Backend test suite (pytest)
- `docs/`                              Architecture diagram and report

## Tech stack
React 19, Vite, TypeScript, Tailwind, shadcn/ui · FastAPI, SQLAlchemy, Postgres (SQLite for local dev)
Groq (LLM inference) · DronaHQ (Agentic AI / Vibe Coding layer) · Resend (real email sending) · Gmail IMAP (real reply receiving)
Deployed on Render (backend) and Vercel (frontend).

## Setup

### Backend
    cd backend
    python -m venv venv
    venv\Scripts\Activate.ps1        # macOS/Linux: source venv/bin/activate
    pip install -r requirements.txt
    uvicorn app.main:app --reload

### Frontend
    cd frontend
    npm install
    npm run dev

### Tests
    cd backend
    venv\Scripts\Activate.ps1
    python -m pytest -q

## Environment variables

### Backend (`backend/.env`)
| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Postgres URL in production; defaults to local SQLite if unset |
| `FRONTEND_ORIGIN` | Comma-separated allowed CORS origins |
| `GROQ_API_KEYS` | Comma-separated Groq API keys (rotated by `llm.py`'s key pool) |
| `GROQ_KEY_RPM` | Requests-per-minute budget per key |
| `AGENT_CONCURRENCY` | Worker thread pool size (default 4) |
| `AUTO_WORKER` | `1` to auto-start the background pipeline worker on boot |
| `DRONA_ICP_WEBHOOK_URL`, `DRONA_ICP_API_KEY` | DronaHQ webhook for the ICP Fitment agent |
| `DRONA_PERSONALISATION_WEBHOOK_URL`, `DRONA_PERSONALISATION_API_KEY` | DronaHQ webhook for the Personalisation agent |
| `ICP_PROVIDER`, `PERSONALISATION_PROVIDER` | `dronahq` or `local` — which path each agent prefers before falling back |
| `DRONAHQ_AUTH_HEADER`, `DRONAHQ_AUTH_PREFIX` | Auth header name/prefix DronaHQ's webhook expects (defaults: `Authorization` / `Bearer `) |
| `DRONAHQ_CONNECT_TIMEOUT_SECONDS`, `DRONAHQ_TIMEOUT_SECONDS` | Connect/read timeouts for DronaHQ calls (defaults 5s / 20s) |
| `CHANNEL_MODE_EMAIL` | `sandbox` (default, recommended) or `live` — global switch for *all* email sends. Leave as `sandbox`; real sends go through the separate scoped path below instead |
| `DEMO_INBOXES` | Comma-separated real inboxes eligible for a real send (plus-tags allowed) |
| `RESEND_API_KEY` | API key for Resend (real email sending, HTTP-based — required since Render blocks outbound SMTP ports) |
| `RESEND_FROM` | Sender address; defaults to `onboarding@resend.dev` (no domain verification needed) |
| `GMAIL_ADDRESS`, `GMAIL_APP_PASSWORD` | Burner Gmail inbox + app password, for polling real replies |
| `AUTO_GMAIL_POLL` | `1` to auto-start the background Gmail poller on boot (only if `GMAIL_ADDRESS` is set) |

### Frontend (`frontend/.env`)
| Variable | Purpose |
|---|---|
| `VITE_API_URL` | Base URL of the backend API |

## How real email sending works

Every send is sandboxed by default — recorded, but nothing actually leaves the system. A specific,
scoped path lets you demonstrate a real send/reply loop for one prospect at a time without affecting
anything else:

1. Open a prospect in `READY_TO_SEND` state, click **"Point at burner inbox"** (sets their email to
   a tagged address on your `GMAIL_ADDRESS`).
2. Click **"Send real email"** — sends via Resend, real delivery, does not touch `CHANNEL_MODE_EMAIL`
   or any other prospect.
3. Reply from the burner inbox (or reply normally if the prospect was pointed at a different real
   inbox — `Reply-To` always routes back to the burner inbox regardless).
4. Click **"Check for replies now"** (or wait for the background poller) — the reply is matched to
   the right prospect and handed to the Conversation agent exactly as a production webhook would.
5. If the agent drafts a follow-up and a manager approves it, that approved reply is also sent for
   real, for that same prospect only.

## Demo tooling
- **Simulate reply** (single or batch, random or a chosen intent) — drives the funnel past
  "Contacted" without waiting on real replies.
- **Adjustable qualified target** — raise or lower a running campaign's target live; discovery
  keeps going until it's met.
- **Cost-per-qualified-lead** and a live/stale data indicator on the dashboard.
- **Prospect table + detail drawer** — full message thread, state, and the real-email actions above.

## Known limitations
- Prospect sourcing (`discovery.py`) uses a deterministic fake dataset, not a live Apollo/LinkedIn
  connector — a stand-in per the problem statement's "equivalents welcome."
- Real sending is wired up for email only; LinkedIn and SMS stay sandboxed.
- RAG retrieval (`rag.py`) uses keyword-overlap scoring, not vector embeddings.
- The worker's thread pool and Groq key pool can block under sustained heavy concurrent load; not
  triggered by a normal demo-scale run.