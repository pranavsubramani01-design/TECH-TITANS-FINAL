"""PathForge AI — Backend regression tests."""
import os, time, uuid, pytest, requests

# Use public URL primarily; fallback to localhost if AI endpoints 502 through the edge
PUBLIC_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://career-roadmap-119.preview.emergentagent.com").rstrip("/")
LOCAL_URL = "http://localhost:8001"
AI_TIMEOUT = 180

# Cache for created data
STATE = {}


def _url(base, path):
    return f"{base}{path}"


@pytest.fixture(scope="session")
def base_url():
    # Public URL edge is currently timing out; use localhost for reliability.
    return LOCAL_URL


@pytest.fixture(scope="session")
def ai_base_url():
    # Use localhost for long-running AI calls to avoid edge 502s.
    return LOCAL_URL


@pytest.fixture(scope="session")
def signup_user(base_url):
    email = f"test_{uuid.uuid4().hex[:8]}@pathforge.ai"
    payload = {"full_name": "Test Student", "email": email, "password": "Passw0rd!"}
    r = requests.post(_url(base_url, "/api/auth/signup"), json=payload, timeout=30)
    assert r.status_code == 200, r.text
    data = r.json()
    assert "token" in data and "user" in data
    STATE["token"] = data["token"]
    STATE["user"] = data["user"]
    STATE["email"] = email
    STATE["password"] = "Passw0rd!"
    return data


@pytest.fixture(scope="session")
def auth_headers(signup_user):
    return {"Authorization": f"Bearer {signup_user['token']}"}


# ---------------- Auth ----------------
class TestAuth:
    def test_signup_returns_token(self, signup_user):
        assert signup_user["user"]["onboarding_complete"] is False

    def test_login_valid(self, base_url):
        r = requests.post(_url(base_url, "/api/auth/login"), json={"email": STATE["email"], "password": STATE["password"]}, timeout=30)
        assert r.status_code == 200
        assert "token" in r.json()

    def test_login_invalid(self, base_url):
        r = requests.post(_url(base_url, "/api/auth/login"), json={"email": STATE["email"], "password": "wrong"}, timeout=30)
        assert r.status_code == 401

    def test_me_with_token(self, base_url, auth_headers):
        r = requests.get(_url(base_url, "/api/auth/me"), headers=auth_headers, timeout=30)
        assert r.status_code == 200
        assert r.json()["user"]["email"] == STATE["email"]

    def test_me_without_token(self, base_url):
        r = requests.get(_url(base_url, "/api/auth/me"), timeout=30)
        assert r.status_code == 401

    def test_signup_duplicate(self, base_url):
        r = requests.post(_url(base_url, "/api/auth/signup"), json={"full_name": "X", "email": STATE["email"], "password": "Passw0rd!"}, timeout=30)
        assert r.status_code == 400


# ---------------- Onboarding ----------------
class TestOnboarding:
    def test_step1(self, base_url, auth_headers):
        r = requests.post(_url(base_url, "/api/profile/onboarding"),
                          json={"step": 1, "data": {"branch": "CSE", "year": 2, "first_name": "Test"}},
                          headers=auth_headers, timeout=30)
        assert r.status_code == 200
        assert r.json()["data"]["branch"] == "CSE"

    def test_step2_merges(self, base_url, auth_headers):
        r = requests.post(_url(base_url, "/api/profile/onboarding"),
                          json={"step": 2, "data": {"semester": 3, "primary_career": "Software Engineer"}},
                          headers=auth_headers, timeout=30)
        assert r.status_code == 200
        d = r.json()["data"]
        assert d["branch"] == "CSE"  # prior key preserved
        assert d["semester"] == 3

    def test_get_profile(self, base_url, auth_headers):
        r = requests.get(_url(base_url, "/api/profile"), headers=auth_headers, timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert d["profile"]["data"]["branch"] == "CSE"
        assert d["user"]["email"] == STATE["email"]

    def test_complete_flag(self, base_url, auth_headers):
        r = requests.post(_url(base_url, "/api/profile/onboarding"),
                          json={"step": 12, "data": {"available_time": 120, "interests": ["AI", "Web"], "learning_style": "visual", "strengths": ["logic"], "priorities": ["placement"]},
                                "complete": True},
                          headers=auth_headers, timeout=30)
        assert r.status_code == 200
        r2 = requests.get(_url(base_url, "/api/auth/me"), headers=auth_headers, timeout=30)
        assert r2.json()["user"]["onboarding_complete"] is True


# ---------------- AI Interview ----------------
class TestInterview:
    def test_start_interview(self, ai_base_url, auth_headers):
        r = requests.post(_url(ai_base_url, "/api/ai/interview"), json={"start": True}, headers=auth_headers, timeout=AI_TIMEOUT)
        assert r.status_code == 200, r.text
        reply = r.json()["reply"]
        assert isinstance(reply, str) and len(reply) > 10
        STATE["first_reply"] = reply

    def test_follow_up(self, ai_base_url, auth_headers):
        r = requests.post(_url(ai_base_url, "/api/ai/interview"),
                          json={"message": "I love building things and solving hard problems, especially with AI."},
                          headers=auth_headers, timeout=AI_TIMEOUT)
        assert r.status_code == 200
        assert len(r.json()["reply"]) > 5

    def test_follow_up_2(self, ai_base_url, auth_headers):
        r = requests.post(_url(ai_base_url, "/api/ai/interview"),
                          json={"message": "I get bored with pure theory, I like shipping demos."},
                          headers=auth_headers, timeout=AI_TIMEOUT)
        assert r.status_code == 200

    def test_history(self, ai_base_url, auth_headers):
        r = requests.get(_url(ai_base_url, "/api/ai/interview/history"), headers=auth_headers, timeout=30)
        assert r.status_code == 200
        msgs = r.json()["messages"]
        assert len(msgs) >= 4
        roles = {m["role"] for m in msgs}
        assert "student" in roles and "forge" in roles
        ts_list = [m["ts"] for m in msgs]
        assert ts_list == sorted(ts_list)


# ---------------- AI Profile + Roadmap + Node status (must be same class for loadscope worker pin) ----------------
class TestAIGeneration:
    @pytest.fixture(scope="class", autouse=True)
    def _seed(self, ai_base_url, auth_headers):
        # Ensure onboarding data exists (loadscope may run this class on a fresh worker/user)
        requests.post(_url(ai_base_url, "/api/profile/onboarding"),
                      json={"step": 12,
                            "data": {"branch": "CSE", "year": 2, "semester": 3,
                                     "first_name": "Test", "available_time": 120,
                                     "primary_career": "Software Engineer",
                                     "interests": ["AI", "Web"],
                                     "learning_style": "visual",
                                     "strengths": ["logic"],
                                     "priorities": ["placement"]},
                            "complete": True},
                      headers=auth_headers, timeout=30)
        # Seed at least one interview exchange so profile generation has substance
        requests.post(_url(ai_base_url, "/api/ai/interview"), json={"start": True}, headers=auth_headers, timeout=AI_TIMEOUT)
        requests.post(_url(ai_base_url, "/api/ai/interview"),
                      json={"message": "I love building AI systems and shipping demos. I get bored with pure theory."},
                      headers=auth_headers, timeout=AI_TIMEOUT)
        yield

    def test_generate_profile(self, ai_base_url, auth_headers):
        r = requests.post(_url(ai_base_url, "/api/ai/generate-profile"), headers=auth_headers, timeout=AI_TIMEOUT)
        assert r.status_code == 200, r.text
        p = r.json()["profile"]
        for k in ["career_directions", "interest_profile", "strength_profile", "development_areas", "alternative_careers", "summary", "skill_gaps"]:
            assert k in p, f"missing {k}"
        assert isinstance(p["career_directions"], list) and len(p["career_directions"]) >= 1
        cd = p["career_directions"][0]
        for k in ["name", "score", "why"]:
            assert k in cd
        STATE["target_career"] = cd["name"]

    def test_get_profile(self, ai_base_url, auth_headers):
        r = requests.get(_url(ai_base_url, "/api/ai/profile"), headers=auth_headers, timeout=30)
        assert r.status_code == 200
        assert r.json()["profile"] is not None

    def test_generate_roadmap(self, ai_base_url, auth_headers):
        r = requests.post(_url(ai_base_url, "/api/ai/generate-roadmap"), headers=auth_headers, timeout=AI_TIMEOUT)
        assert r.status_code == 200, r.text
        rm = r.json()["roadmap"]
        assert "target_career" in rm
        assert isinstance(rm.get("years"), list) and len(rm["years"]) == 4
        for y in rm["years"]:
            assert isinstance(y.get("semesters"), list) and len(y["semesters"]) == 2
        nodes = rm.get("nodes", [])
        assert 12 <= len(nodes) <= 16, f"got {len(nodes)} nodes"
        for n in nodes:
            for k in ["id", "title", "category", "status", "difficulty", "est_hours", "why", "prerequisites", "skills", "tasks"]:
                assert k in n, f"node missing {k}"
        STATE["nodes"] = nodes

    def test_get_roadmap(self, ai_base_url, auth_headers):
        r = requests.get(_url(ai_base_url, "/api/roadmap"), headers=auth_headers, timeout=30)
        assert r.status_code == 200
        assert r.json()["roadmap"] is not None


    # Roadmap node status updates — must live inside TestAIGeneration so loadscope
    # pins them to the same worker that generated the roadmap.
    def test_update_node_in_progress(self, ai_base_url, auth_headers):
        nid = STATE["nodes"][0]["id"]
        r = requests.post(_url(ai_base_url, "/api/roadmap/node"), json={"node_id": nid, "status": "in_progress"}, headers=auth_headers, timeout=30)
        assert r.status_code == 200
        rm = r.json()["roadmap"]
        assert any(n["id"] == nid and n["status"] == "in_progress" for n in rm["nodes"])

    def test_update_node_completed(self, ai_base_url, auth_headers):
        nid = STATE["nodes"][0]["id"]
        r = requests.post(_url(ai_base_url, "/api/roadmap/node"), json={"node_id": nid, "status": "completed"}, headers=auth_headers, timeout=30)
        assert r.status_code == 200
        rm = r.json()["roadmap"]
        assert any(n["id"] == nid and n["status"] == "completed" for n in rm["nodes"])


# ---------------- AI regression: repeated calls (json-repair fix) ----------------
class TestAIRepeated:
    """After adding json-repair, generate-roadmap x3 and generate-profile x2 must all succeed."""

    def test_generate_roadmap_four_times(self, ai_base_url, auth_headers):
        failures = []
        for i in range(4):
            r = requests.post(_url(ai_base_url, "/api/ai/generate-roadmap"), headers=auth_headers, timeout=AI_TIMEOUT)
            if r.status_code != 200:
                failures.append(f"run {i+1}: {r.status_code} {r.text[:200]}")
                continue
            rm = r.json()["roadmap"]
            if not isinstance(rm, dict):
                failures.append(f"run {i+1}: roadmap is not a dict (got {type(rm).__name__})")
                continue
            if "target_career" not in rm:
                failures.append(f"run {i+1}: missing target_career")
            if not (isinstance(rm.get("years"), list) and len(rm["years"]) == 4):
                failures.append(f"run {i+1}: years length != 4 (got {len(rm.get('years', []))})")
            if len(rm.get("nodes", [])) < 12:
                failures.append(f"run {i+1}: nodes < 12 (got {len(rm.get('nodes', []))})")
        assert not failures, "generate-roadmap failures: " + "; ".join(failures)

    def test_generate_profile_twice(self, ai_base_url, auth_headers):
        failures = []
        for i in range(2):
            r = requests.post(_url(ai_base_url, "/api/ai/generate-profile"), headers=auth_headers, timeout=AI_TIMEOUT)
            if r.status_code != 200:
                failures.append(f"run {i+1}: {r.status_code} {r.text[:200]}")
                continue
            p = r.json()["profile"]
            for k in ["career_directions", "interest_profile", "strength_profile", "development_areas", "alternative_careers", "summary", "skill_gaps"]:
                if k not in p:
                    failures.append(f"run {i+1}: missing key {k}")
            if not (isinstance(p.get("career_directions"), list) and len(p["career_directions"]) >= 3):
                failures.append(f"run {i+1}: career_directions < 3 (got {len(p.get('career_directions', []))})")
        assert not failures, "generate-profile failures: " + "; ".join(failures)


# ---------------- Daily planner ----------------
class TestPlanner:
    def test_generate(self, ai_base_url, auth_headers):
        r = requests.post(_url(ai_base_url, "/api/planner/today"), headers=auth_headers, timeout=AI_TIMEOUT)
        assert r.status_code == 200, r.text
        plan = r.json()["plan"]
        assert isinstance(plan.get("tasks"), list)

    def test_get_today(self, ai_base_url, auth_headers):
        r = requests.get(_url(ai_base_url, "/api/planner/today"), headers=auth_headers, timeout=30)
        assert r.status_code == 200
        assert r.json()["plan"] is not None


# ---------------- Forge ----------------
class TestForge:
    def test_forge_chat(self, ai_base_url, auth_headers):
        r = requests.post(_url(ai_base_url, "/api/ai/forge"), json={"message": "What should I focus on this week?"}, headers=auth_headers, timeout=AI_TIMEOUT)
        assert r.status_code == 200, r.text
        assert len(r.json()["reply"]) > 5

    def test_forge_history(self, ai_base_url, auth_headers):
        r = requests.get(_url(ai_base_url, "/api/ai/forge/history"), headers=auth_headers, timeout=30)
        assert r.status_code == 200
        assert len(r.json()["messages"]) >= 2

    def test_forge_nudge(self, ai_base_url, auth_headers):
        r = requests.post(_url(ai_base_url, "/api/ai/forge/nudge"), headers=auth_headers, timeout=AI_TIMEOUT)
        assert r.status_code == 200
        assert isinstance(r.json()["nudge"], str) and len(r.json()["nudge"]) > 3


# ---------------- Skills CRUD ----------------
class TestSkills:
    def test_add(self, base_url, auth_headers):
        r = requests.post(_url(base_url, "/api/skills"), json={"name": "TEST_Python", "category": "Programming", "progress": 20}, headers=auth_headers, timeout=30)
        assert r.status_code == 200
        STATE["skill_id"] = r.json()["skill"]["id"]

    def test_list(self, base_url, auth_headers):
        r = requests.get(_url(base_url, "/api/skills"), headers=auth_headers, timeout=30)
        assert r.status_code == 200
        assert any(s["id"] == STATE["skill_id"] for s in r.json()["skills"])

    def test_update(self, base_url, auth_headers):
        r = requests.put(_url(base_url, f"/api/skills/{STATE['skill_id']}"), json={"progress": 60}, headers=auth_headers, timeout=30)
        assert r.status_code == 200
        assert r.json()["skill"]["progress"] == 60

    def test_delete(self, base_url, auth_headers):
        r = requests.delete(_url(base_url, f"/api/skills/{STATE['skill_id']}"), headers=auth_headers, timeout=30)
        assert r.status_code == 200


# ---------------- Academics ----------------
class TestAcademics:
    def test_add_and_cgpa(self, base_url, auth_headers):
        for rec in [{"semester": 1, "subject": "Math", "credits": 4, "grade_points": 9},
                    {"semester": 1, "subject": "Physics", "credits": 3, "grade_points": 8}]:
            r = requests.post(_url(base_url, "/api/academics"), json=rec, headers=auth_headers, timeout=30)
            assert r.status_code == 200
        r = requests.get(_url(base_url, "/api/academics"), headers=auth_headers, timeout=30)
        assert r.status_code == 200
        data = r.json()
        # (4*9+3*8)/(4+3) = 60/7 = 8.57
        assert data["cgpa"] == 8.57
        assert data["sgpa_by_semester"][0]["sgpa"] == 8.57


# ---------------- Projects ----------------
class TestProjects:
    def test_crud(self, base_url, auth_headers):
        r = requests.post(_url(base_url, "/api/projects"), json={"name": "TEST_Portfolio", "tech": ["React"]}, headers=auth_headers, timeout=30)
        assert r.status_code == 200
        pid = r.json()["project"]["id"]
        r = requests.get(_url(base_url, "/api/projects"), headers=auth_headers, timeout=30)
        assert any(p["id"] == pid for p in r.json()["projects"])
        r = requests.delete(_url(base_url, f"/api/projects/{pid}"), headers=auth_headers, timeout=30)
        assert r.status_code == 200


# ---------------- Hobbies ----------------
class TestHobbies:
    def test_crud(self, base_url, auth_headers):
        r = requests.post(_url(base_url, "/api/hobbies"), json={"name": "TEST_Chess", "hours_per_week": 2}, headers=auth_headers, timeout=30)
        assert r.status_code == 200
        hid = r.json()["hobby"]["id"]
        r = requests.get(_url(base_url, "/api/hobbies"), headers=auth_headers, timeout=30)
        assert any(h["id"] == hid for h in r.json()["hobbies"])
        r = requests.delete(_url(base_url, f"/api/hobbies/{hid}"), headers=auth_headers, timeout=30)
        assert r.status_code == 200


# ---------------- Check-in ----------------
class TestCheckin:
    def test_checkin(self, base_url, auth_headers):
        r = requests.post(_url(base_url, "/api/checkin"), json={"mood": "focused", "energy": 8, "available_minutes": 120}, headers=auth_headers, timeout=30)
        assert r.status_code == 200
        r = requests.get(_url(base_url, "/api/checkin/today"), headers=auth_headers, timeout=30)
        assert r.status_code == 200
        assert r.json()["checkin"]["mood"] == "focused"


# ---------------- Careers ----------------
class TestCareers:
    def test_list(self, base_url):
        r = requests.get(_url(base_url, "/api/careers"), timeout=30)
        assert r.status_code == 200
        assert len(r.json()["careers"]) >= 10

    def test_filter(self, base_url):
        r = requests.get(_url(base_url, "/api/careers?q=data"), timeout=30)
        assert r.status_code == 200
        assert len(r.json()["careers"]) >= 1

    def test_single(self, base_url):
        r = requests.get(_url(base_url, "/api/careers/sde"), timeout=30)
        assert r.status_code == 200
        assert r.json()["career"]["id"] == "sde"

    def test_unknown_404(self, base_url):
        r = requests.get(_url(base_url, "/api/careers/nope"), timeout=30)
        assert r.status_code == 404


# ---------------- Skill gap + Dashboard ----------------
class TestAggregates:
    def test_skill_gap(self, base_url, auth_headers):
        r = requests.get(_url(base_url, "/api/skill-gap"), headers=auth_headers, timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert "gaps" in d and "current_skills" in d and "target" in d

    def test_dashboard(self, base_url, auth_headers):
        r = requests.get(_url(base_url, "/api/dashboard"), headers=auth_headers, timeout=30)
        assert r.status_code == 200
        d = r.json()
        for k in ["health_score", "roadmap_progress", "nodes_completed", "nodes_total", "cgpa", "today_plan", "career_direction"]:
            assert k in d, f"dashboard missing {k}"


# ---------------- Authorization ----------------
class TestAuthorization:
    @pytest.mark.parametrize("path,method", [
        ("/api/profile", "GET"),
        ("/api/profile/onboarding", "POST"),
        ("/api/auth/me", "GET"),
        ("/api/skills", "GET"),
        ("/api/academics", "GET"),
        ("/api/projects", "GET"),
        ("/api/hobbies", "GET"),
        ("/api/checkin/today", "GET"),
        ("/api/dashboard", "GET"),
        ("/api/skill-gap", "GET"),
        ("/api/roadmap", "GET"),
        ("/api/ai/profile", "GET"),
        ("/api/planner/today", "GET"),
        ("/api/ai/forge/history", "GET"),
        ("/api/ai/interview/history", "GET"),
    ])
    def test_requires_auth(self, base_url, path, method):
        r = requests.request(method, _url(base_url, path), json={"step": 0, "data": {}} if method == "POST" else None, timeout=30)
        assert r.status_code == 401, f"{path} returned {r.status_code}"



# ---------------- Career Simulator ----------------
class TestSimulator:
    def test_run_simulator(self, ai_base_url, auth_headers):
        payload = {
            "target_role": "ML Engineer",
            "industry": "Tech",
            "salary_band": "20-30 LPA",
            "location": "Bangalore",
            "higher_studies": "maybe",
            "startup_or_job": "either",
        }
        r = requests.post(_url(ai_base_url, "/api/ai/simulator"), json=payload, headers=auth_headers, timeout=AI_TIMEOUT)
        assert r.status_code == 200, r.text
        sim = r.json()["simulation"]
        assert isinstance(sim, dict)
        routes = sim.get("routes")
        assert isinstance(routes, list) and len(routes) == 3, f"expected 3 routes, got {len(routes) if isinstance(routes, list) else type(routes)}"
        for i, rt in enumerate(routes):
            for k in ["name", "tagline", "steps", "skills", "effort", "duration", "milestones", "risks", "alternatives"]:
                assert k in rt, f"route {i} missing {k}"
            assert isinstance(rt["steps"], list) and len(rt["steps"]) >= 3
            assert isinstance(rt["milestones"], list) and len(rt["milestones"]) >= 2
        assert "caveats" in sim and isinstance(sim["caveats"], list)

    def test_simulator_history(self, ai_base_url, auth_headers):
        r = requests.get(_url(ai_base_url, "/api/ai/simulator/history"), headers=auth_headers, timeout=30)
        assert r.status_code == 200
        items = r.json()["simulations"]
        assert isinstance(items, list) and len(items) >= 1
        # newest first — first item should have result key
        assert "result" in items[0]


# ---------------- Weekly Review ----------------
class TestWeeklyReview:
    def test_generate_review(self, ai_base_url, auth_headers):
        r = requests.post(_url(ai_base_url, "/api/ai/weekly-review"), headers=auth_headers, timeout=AI_TIMEOUT)
        assert r.status_code == 200, r.text
        body = r.json()
        assert "review_id" in body and body["review_id"]
        review = body["review"]
        for k in ["summary", "wins", "missed", "risks", "adjustments", "next_week_focus", "roadmap_changes"]:
            assert k in review, f"review missing {k}"
        assert isinstance(review["summary"], str) and len(review["summary"]) > 5
        assert isinstance(review["wins"], list) and len(review["wins"]) >= 1
        assert isinstance(review["next_week_focus"], list) and len(review["next_week_focus"]) >= 1
        assert isinstance(review["roadmap_changes"], list)
        STATE["review_id"] = body["review_id"]
        STATE["review_changes"] = review["roadmap_changes"]

    def test_latest_review(self, ai_base_url, auth_headers):
        r = requests.get(_url(ai_base_url, "/api/ai/weekly-review/latest"), headers=auth_headers, timeout=30)
        assert r.status_code == 200
        doc = r.json()["review"]
        assert doc is not None
        assert doc["id"] == STATE["review_id"]

    def test_accept_review(self, ai_base_url, auth_headers):
        # Fetch current roadmap to determine expected valid node ids
        rm_before = requests.get(_url(ai_base_url, "/api/roadmap"), headers=auth_headers, timeout=30).json().get("roadmap") or {}
        valid_ids = {n["id"] for n in (rm_before.get("nodes") or [])}
        changes = STATE.get("review_changes") or []
        expected_valid = [c for c in changes if c.get("node_id") in valid_ids and c.get("new_status") in
                          {"available", "recommended", "in_progress", "locked", "completed"}]

        r = requests.post(_url(ai_base_url, "/api/ai/weekly-review/accept"),
                          json={"review_id": STATE["review_id"]},
                          headers=auth_headers, timeout=60)
        assert r.status_code == 200, r.text
        body = r.json()
        assert "applied" in body and isinstance(body["applied"], int)
        assert body["applied"] == len(expected_valid), f"expected {len(expected_valid)} applied, got {body['applied']}"
        assert "roadmap" in body and isinstance(body["roadmap"], dict)

        # Verify persistence: GET /api/roadmap reflects those changes
        if expected_valid:
            r2 = requests.get(_url(ai_base_url, "/api/roadmap"), headers=auth_headers, timeout=30)
            assert r2.status_code == 200
            rm_after = r2.json()["roadmap"]
            after_index = {n["id"]: n for n in rm_after.get("nodes", [])}
            for c in expected_valid:
                assert after_index[c["node_id"]]["status"] == c["new_status"], \
                    f"node {c['node_id']} status not applied"

    def test_accept_invalid_review(self, ai_base_url, auth_headers):
        r = requests.post(_url(ai_base_url, "/api/ai/weekly-review/accept"),
                          json={"review_id": "does-not-exist"},
                          headers=auth_headers, timeout=30)
        assert r.status_code == 404
