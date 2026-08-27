# PathForge AI — PRD

## Vision
AI-powered Student Career & Roadmap Operating System. A Jarvis-style companion that continuously answers "given who I am right now, what is the smartest next step?"

## Stack
- Backend: FastAPI + MongoDB (motor)
- Frontend: React 19 + Tailwind + shadcn/ui + reactflow
- AI: Claude Sonnet 4.6 via Emergent Universal LLM Key
- Auth: Email/password JWT
- PDF: reportlab (server-side resume PDF)

## User personas
- First-year student (unsure about career)
- Later-year student refining path
- Student founder (founder track)
- Admin (deferred)

## Phase 1 (SHIPPED — 2026-02)
- Signup/login/JWT + persistent auth
- Multi-step onboarding wizard (basic → academics → career awareness/aspirations → interests/strengths/dev-areas → personality → priorities → hobbies → time → current skills)
- Adaptive AI career interview (Claude, one-question-at-a-time, persisted)
- AI-generated Student Intelligence Profile (top 5 careers, interest radar, strengths, dev areas, alternatives, skill gaps)
- Personalized 4-year roadmap generator + node canvas (roadmap.sh-inspired) + list view
- Node detail + status transitions (locked/available/recommended/in_progress/completed) with Ask Forge / Add to Today / Mark Complete
- Skill Tracker CRUD, Academic (CGPA/SGPA) tracker, Project tracker, Hobby tracker
- Daily Check-in + AI Daily Planner
- Forge AI companion (persistent chat + proactive nudges)
- Career Explorer, Skill-Gap Analyzer
- Main Dashboard with widgets + health score
- Black + dark-grey monochrome design system (Swiss/Brutalist)

## Deferred (backlog)
- Alumni intelligence + matching + trajectories (P1)
- Admin dashboard + analytics (P2)
- Automated notifications / deadline reminders (P2)
- Streaming AI responses (P2)
- Email verification + real password reset flow (P2)

## Test credentials
See /app/memory/test_credentials.md

## Iteration 2 — Voice Forge (Jarvis mode) — 2026-02
- Forge speaks and listens via Web Speech API (SpeechRecognition + SpeechSynthesis)
- Jarvis arc-reactor animations on FAB and drawer header; mic volume feeds reactor scale

## Iteration 3 — AI shape-drift hardening — 2026-02
- llm_json takes require_keys=[] and retries with stricter prompt on bad shape
- get_roadmap_dict/get_profile_dict coerce reader endpoints to dict
- Timestamp-suffixed session_id per generate call prevents Claude drift

## Iteration 4 — Jarvis becomes real — 2026-02
- Wake word ("Hey Forge") sidebar toggle → auto-opens drawer + voice input
- Career Simulator /simulator (3 personalized routes to any target role)
- Weekly Review /weekly-review (wins/missed/risks/next-focus + Accept-all/Customize)
- Live transcript reveal via onboundary events

## Iteration 5 — Placement + Streak Rewards — 2026-02
- Placement Simulator /placement (per-company readiness, gaps, critical actions)
- Streak Rewards /api/streak + /streak page (6-tier perk system), idempotent check-in
- 70/70 backend tests green

## Iteration 6 — Search, Resume, Founder Track — 2026-06
- **Global Search**: `GET /api/search?q=` fans out over 14 pages, roadmap nodes, founder nodes, skills, projects, 12 careers, 30 companies. `CommandPalette.jsx` opens on ⌘/Ctrl+K (or sidebar SEARCH button), grouped results, ↑↓ nav, ⏎ to jump, ESC to close. Zero results → "Ask Forge" fall-through that opens the drawer and sends the query (ForgeDrawer `initialQuestion` prop).
- **Resume Builder** (`/resume`): `POST /api/resume/generate` — Claude writes a truthful ATS one-pager from real CGPA, skills, projects and target career (explicitly forbidden from inventing employers/metrics/links). Editable (headline, summary, contact, skill groups, project bullets, achievements, coursework) with `PUT /api/resume` persistence. Two exports: browser print (@media print isolates `#resume-print`) and `GET /api/resume/pdf` (reportlab A4, verified 200 + %PDF).
- **Founder Track**: `POST /api/ai/generate-founder-roadmap` → 4 phases (discovery → validation → MVP/traction → fundraise), 12-16 founder-category nodes, thesis, first-week actions, honest disclaimer. Toggle on `/roadmap` (`track-job` / `track-founder`) reuses the React Flow canvas and routes status writes to `/api/founder/node`. `/founder` workspace adds the validation log (interview/hypothesis/experiment/mvp_scope/metric with outcomes + counts) and `POST /api/founder/insights` → signal strength, stage, patterns, blind spots, kill-or-continue, 3 next experiments.
- Testing: **86/86 backend tests green** (16 new). Frontend flows verified by testing agent (palette open/search/keyboard nav/ask-forge, resume preview+edit+persist+PDF, founder phases/log/insights, roadmap track toggle both ways).
- Post-test fixes: search now filters all nodes before slicing to 6; ForgeDrawer history load no longer overwrites a message sent via search hand-off.
- Known infra note: Emergent LLM key budget was exhausted during testing — live AI calls 500 until topped up (Profile → Manage plan → Universal Key → Add Balance).

## Backlog / next
- P1: Alumni intelligence (database, matching, trajectories, alumni roadmap view)
- P1: Career Explorer depth (per-career roadmaps + market insights, currently a browse list)
- P2: Admin dashboard, notifications, streaming AI, resume variants per company
- P2 (tech debt): server.py is ~1330 lines — split into routers/{search,resume,founder}.py
