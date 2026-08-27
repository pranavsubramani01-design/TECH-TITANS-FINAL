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

## Iteration 7 — Alumni Intelligence — 2026-06 (BUILT, AI VERIFICATION BLOCKED)
- User choices: AI-generated synthetic cohort only (labelled "AI-modelled, not a real person"), ~30 alumni, role-first (any college), no alumnus persona chat.
- Backend: `POST /api/alumni/seed` (3 parallel LLM batches × 10 across role clusters, idempotent unless `force=true`), `GET /api/alumni` (q + role/company/path_type/branch filters + facets), `GET /api/alumni/{id}`, `GET /api/alumni/matches` (deterministic Python scoring: target-role match 40, same branch 18, CGPA band 20, skill overlap ≤18 → top 6 with human-readable match reasons), `POST /api/alumni/{id}/compare` (LLM trajectory overlay: same_point / ahead / behind / 3 missing_moves / adapted_advice / verdict), `GET /api/alumni/{id}/compare` (cached).
- Frontend `/alumni` (`AlumniPage.jsx`): "Your closest mirrors" match cards with scores + reasons, filterable directory, detail drawer with year-by-year trajectory (did/skills/milestone), breakthrough, offer note, mistakes, advice, skills-at-offer, and the overlay panel. Alumni also indexed in the ⌘K palette and the PAGES list.
- Hardening: `llm_json`/`llm_text` now wrap provider errors — budget exhaustion returns a clean **503 with a top-up message** instead of a raw 500/502 Cloudflare page; AI pages surface `detail` in the toast.
- **BLOCKED**: the Emergent LLM key budget is exhausted, so the cohort could not be generated or verified end-to-end. Non-AI paths verified (list/facets/matches return 200 with empty cohort; page renders empty state). Re-run "BUILD ALUMNI COHORT" after topping up.

## Iteration 8 — Code-quality pass — 2026-06
- `llm_json`/`llm_text` chain provider errors with `raise ... from ex`; `resp` explicitly initialised.
- `alumni_matches` complexity split into `_role_score`, `_cgpa_score`, `_score_alumnus` (response shape unchanged).
- All 30 empty JS catch blocks now log via `console.error` (data loads) or `console.debug` (Web Speech API stop/start races).
- Array-index React keys replaced with content-composite keys across Resume, Alumni, Founder, Roadmap and Weekly Review lists.
- `ResumePage` PDF download no longer reads the JWT from localStorage — it goes through the shared axios client with `responseType: 'blob'`.
- Hook deps: `WeeklyReview.load` wrapped in `useCallback` and added to its effect; mount-only fetches explicitly marked.
- Test suite: boolean assertions use `==`; the Resume fixture now seeds via `PUT /api/resume` instead of calling the LLM.
- Verified by testing agent (iteration_7.json): **zero regressions**, 51/51 non-AI backend tests pass, all touched UI flows green. Remaining pytest failures are the expected 503s from the exhausted LLM key.
- NOTE (accepted, not changed): JWT is still stored in localStorage. Moving to httpOnly cookies is a full auth rework (backend cookie issuance, CSRF handling, test harness changes) and is tracked as a P2 item.

## Backlog / next
- P0: Verify Alumni Intelligence end-to-end once the LLM key is topped up (seed cohort → matches → overlay)
- P2: Auth hardening — move JWT to httpOnly cookies + CSRF token

- P1: Career Explorer depth (per-career roadmaps + market insights, currently a browse list)
- P2: Admin dashboard, notifications, streaming AI, resume variants per company
- P2 (tech debt): server.py is ~1330 lines — split into routers/{search,resume,founder}.py
