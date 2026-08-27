# PathForge AI — PRD

## Vision
AI-powered Student Career & Roadmap Operating System. A Jarvis-style companion that continuously answers "given who I am right now, what is the smartest next step?"

## Stack
- Backend: FastAPI + MongoDB (motor)
- Frontend: React 19 + Tailwind + shadcn/ui + reactflow
- AI: Claude Sonnet 4.6 via Emergent Universal LLM Key
- Auth: Email/password JWT

## User personas
- First-year student (unsure about career)
- Later-year student refining path
- Admin (deferred)

## Phase 1 (SHIPPED — 2026-02)
- Signup/login/JWT + persistent auth
- Multi-step onboarding wizard (basic → academics → career awareness/aspirations → interests/strengths/dev-areas → personality → priorities → hobbies → time → current skills)
- Adaptive AI career interview (Claude, one-question-at-a-time, persisted)
- AI-generated Student Intelligence Profile (top 5 careers, interest radar, strengths, dev areas, alternatives, skill gaps)
- Personalized 4-year roadmap generator + node canvas (roadmap.sh-inspired) + list view
- Node detail + status transitions (locked/available/recommended/in_progress/completed) with Ask Forge / Add to Today / Mark Complete
- Skill Tracker CRUD
- Academic (CGPA/SGPA) tracker with auto-computation
- Project tracker CRUD
- Hobby tracker CRUD
- Daily Check-in
- AI Daily Planner (context-aware today's plan)
- Forge AI companion (persistent chat + proactive nudges — Jarvis feel)
- Career Explorer (searchable career database)
- Skill-Gap Analyzer
- Main Dashboard with widgets + health score
- Black + dark-grey monochrome design system (Swiss/Brutalist)

## Deferred (backlog)
- Alumni intelligence + matching + trajectories
- Admin dashboard + analytics
- Weekly review with Accept/Customize
- Career Goal Simulator (multi-route)
- Global search + notification settings
- Streaming AI responses
- Email verification + password reset flow (basic reset stub only)

## Test credentials
See /app/memory/test_credentials.md

## Iteration 2 — Voice Forge (Jarvis mode) — 2026-02
- Forge companion now speaks and listens via browser-native Web Speech API (SpeechRecognition + SpeechSynthesis)
- New Jarvis arc-reactor animations on FAB and drawer header (pulses on speak, blooms on listen)
- Mic-input volume feeds real-time reactor scale

## Iteration 3 — AI shape-drift hardening — 2026-02
- llm_json now takes require_keys=[] and retries once with stricter prompt if shape/keys missing
- get_roadmap_dict/get_profile_dict coerce all reader endpoints to dict — no more 500s on poisoned docs
- Timestamp-suffixed session_id per generate-roadmap call prevents Claude conversation drift
- 56/56 backend tests green (was 53/56)

## Iteration 4 — Jarvis becomes real — 2026-02
- Wake word: sidebar toggle ("Hey Forge") activates persistent SpeechRecognition; saying "hey/hi/ok forge" opens the drawer & auto-starts voice input
- Career Simulator page /simulator — generates 3 personalized routes to any target role with steps/skills/milestones/effort/risks + honest caveats
- Weekly Review page /weekly-review — wins/missed/risks/next-focus + Accept-all/Customize roadmap changes with real persistence
- Live Transcript: Forge's spoken reply is revealed word-by-word using onboundary events (falls back to timed cadence)
- Hardening: bumped generate-roadmap llm_json retries to 2; tightened weekly-review accept status allowlist

## Iteration 5 — Placement + Streak Rewards — 2026-02
- Placement Simulator (/placement): estimates readiness per company (score, verdict, strengths, gaps, missing skills, critical actions, bar notes) + overall + top move
- Streak Rewards: /api/streak computes current/longest/total from unique check-in dates; 6-tier perk system (Spark 3d → Singularity 100d)
- Dashboard streak widget with inline one-tap check-in form
- Streak page /streak with 3 stat blocks, next-perk progress bar, 6-card perks grid
- /api/checkin is now idempotent per (user, date) via upsert
- Placement Simulator "Reset" button clears hydrated inputs
- 70/70 backend tests green
