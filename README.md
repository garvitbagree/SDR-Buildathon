# Reachwell: Inter Guild Buildathon

Multi-channel autonomous SDR system: a campaign control plane (React + FastAPI)
plus an agentic outreach engine built on DronaHQ.

## Structure
- `frontend/`          React + Vite + TypeScript control plane UI
- `backend/`           FastAPI service (campaigns, prompts, reps, controls)
- `backend/app/agents/`        The 7 SDR agents (ICP fitment, research, strategy, personalisation, conversation, follow-up, voice)
- `backend/app/integrations/dronahq/`  DronaHQ webhook integration (ICP + personalisation), with local-LLM fallback
- `docs/`              Architecture diagram and report

## Setup
### Backend
    cd backend
    python -m venv venv
    venv\Scripts\Activate.ps1
    pip install -r requirements.txt
    uvicorn app.main:app --reload

### Frontend
    cd frontend
    npm install
    npm run dev

## Environment variables
See `.env.example` and `backend/.env.example`.

## Tech stack
React, Vite, TypeScript, Tailwind, shadcn/ui, FastAPI, SQLAlchemy, DronaHQ.