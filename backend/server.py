"""PathForge AI — Student Career & Roadmap Operating System — Backend."""
from fastapi import FastAPI, APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os, logging, uuid, json, bcrypt, jwt, re
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone, timedelta

from emergentintegrations.llm.chat import LlmChat, UserMessage
from json_repair import repair_json

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

MONGO_URL = os.environ['MONGO_URL']
DB_NAME = os.environ['DB_NAME']
JWT_SECRET = os.environ.get('JWT_SECRET', 'change-me')
EMERGENT_LLM_KEY = os.environ.get('EMERGENT_LLM_KEY', '')

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

app = FastAPI(title="PathForge AI")
api = APIRouter(prefix="/api")
security = HTTPBearer(auto_error=False)

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("pathforge")


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def new_id() -> str:
    return str(uuid.uuid4())


# ---------------- Auth ----------------
class SignupIn(BaseModel):
    full_name: str
    email: EmailStr
    password: str


class LoginIn(BaseModel):
    email: EmailStr
    password: str


def hash_pw(p: str) -> str:
    return bcrypt.hashpw(p.encode(), bcrypt.gensalt()).decode()


def verify_pw(p: str, h: str) -> bool:
    try:
        return bcrypt.checkpw(p.encode(), h.encode())
    except Exception:
        return False


def make_token(user_id: str) -> str:
    payload = {"sub": user_id, "exp": datetime.now(timezone.utc) + timedelta(days=30)}
    return jwt.encode(payload, JWT_SECRET, algorithm="HS256")


async def current_user(cred: HTTPAuthorizationCredentials = Depends(security)) -> dict:
    if not cred:
        raise HTTPException(401, "Not authenticated")
    try:
        data = jwt.decode(cred.credentials, JWT_SECRET, algorithms=["HS256"])
        uid = data.get("sub")
    except Exception:
        raise HTTPException(401, "Invalid token")
    user = await db.users.find_one({"id": uid}, {"_id": 0, "password_hash": 0})
    if not user:
        raise HTTPException(401, "User not found")
    return user


@api.get("/")
async def root():
    return {"service": "PathForge AI", "status": "ok"}


@api.post("/auth/signup")
async def signup(inp: SignupIn):
    existing = await db.users.find_one({"email": inp.email.lower()})
    if existing:
        raise HTTPException(400, "Email already registered")
    uid = new_id()
    user = {
        "id": uid,
        "full_name": inp.full_name.strip(),
        "email": inp.email.lower(),
        "password_hash": hash_pw(inp.password),
        "created_at": now_iso(),
        "onboarding_step": 0,
        "onboarding_complete": False,
    }
    await db.users.insert_one(user)
    await db.profiles.insert_one({"id": new_id(), "user_id": uid, "data": {}, "updated_at": now_iso()})
    token = make_token(uid)
    return {"token": token, "user": {"id": uid, "full_name": user["full_name"], "email": user["email"], "onboarding_complete": False, "onboarding_step": 0}}


@api.post("/auth/login")
async def login(inp: LoginIn):
    u = await db.users.find_one({"email": inp.email.lower()})
    if not u or not verify_pw(inp.password, u["password_hash"]):
        raise HTTPException(401, "Invalid credentials")
    token = make_token(u["id"])
    return {"token": token, "user": {"id": u["id"], "full_name": u["full_name"], "email": u["email"], "onboarding_complete": u.get("onboarding_complete", False), "onboarding_step": u.get("onboarding_step", 0)}}


@api.get("/auth/me")
async def me(user=Depends(current_user)):
    return {"user": user}


# ---------------- Onboarding / Profile ----------------
class OnboardingIn(BaseModel):
    step: int
    data: Dict[str, Any]
    complete: bool = False


@api.get("/profile")
async def get_profile(user=Depends(current_user)):
    p = await db.profiles.find_one({"user_id": user["id"]}, {"_id": 0})
    return {"profile": p or {"data": {}}, "user": user}


@api.post("/profile/onboarding")
async def save_onboarding(inp: OnboardingIn, user=Depends(current_user)):
    p = await db.profiles.find_one({"user_id": user["id"]})
    data = (p or {}).get("data", {}) if p else {}
    data.update(inp.data or {})
    await db.profiles.update_one(
        {"user_id": user["id"]},
        {"$set": {"data": data, "updated_at": now_iso()}},
        upsert=True,
    )
    updates = {"onboarding_step": inp.step}
    if inp.complete:
        updates["onboarding_complete"] = True
    await db.users.update_one({"id": user["id"]}, {"$set": updates})
    return {"ok": True, "data": data}


# ---------------- LLM helper ----------------
async def llm_json(system: str, user_prompt: str, session_id: str, retries: int = 1, require_keys: Optional[List[str]] = None) -> dict:
    """Ask Claude for JSON and return dict. Uses json-repair + retry on failure or bad shape."""
    if not EMERGENT_LLM_KEY:
        raise HTTPException(503, "AI service not configured")
    last_text = ""
    for attempt in range(retries + 1):
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"{session_id}-{attempt}",
            system_message=system + "\n\nReply with ONE minified JSON OBJECT only (starts with { and ends with }). No markdown, no prose. Escape all quotes/newlines inside strings.",
        ).with_model("anthropic", "claude-sonnet-4-6")
        resp = await chat.send_message(UserMessage(text=user_prompt))
        text = resp if isinstance(resp, str) else str(resp)
        last_text = text
        # strip code fences
        text = re.sub(r"^```(?:json)?", "", text.strip())
        text = re.sub(r"```$", "", text.strip())
        s, e = text.find("{"), text.rfind("}")
        if s >= 0 and e > s:
            text = text[s:e + 1]
        text = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f]", " ", text)
        parsed: Any = None
        try:
            parsed = json.loads(text, strict=False)
        except Exception:
            try:
                parsed = json.loads(repair_json(text, return_objects=False), strict=False)
            except Exception as ex:
                log.warning(f"json-repair failed attempt {attempt}: {ex}")
                parsed = None
        # validate shape
        if isinstance(parsed, dict) and (not require_keys or all(k in parsed for k in require_keys)):
            return parsed
        if attempt < retries:
            missing = [k for k in (require_keys or []) if not isinstance(parsed, dict) or k not in parsed]
            hint = f" You returned invalid shape. Return a JSON OBJECT with these top-level keys: {require_keys}." if require_keys else " You must return a JSON OBJECT."
            user_prompt = hint + " Original request: " + user_prompt
            continue
    log.error(f"JSON shape/parse fail after retries :: {last_text[:400]}")
    raise HTTPException(502, "AI returned invalid JSON shape")


async def llm_text(system: str, user_prompt: str, session_id: str) -> str:
    if not EMERGENT_LLM_KEY:
        raise HTTPException(503, "AI service not configured")
    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=session_id,
        system_message=system,
    ).with_model("anthropic", "claude-sonnet-4-6")
    resp = await chat.send_message(UserMessage(text=user_prompt))
    return resp if isinstance(resp, str) else str(resp)


async def get_roadmap_dict(user_id: str) -> dict:
    doc = await db.roadmaps.find_one({"user_id": user_id}) or {}
    rm = doc.get("roadmap")
    return rm if isinstance(rm, dict) else {}


async def get_profile_dict(user_id: str) -> dict:
    doc = await db.career_profiles.find_one({"user_id": user_id}) or {}
    cp = doc.get("profile")
    return cp if isinstance(cp, dict) else {}


# ---------------- Adaptive AI Interview ----------------
class InterviewIn(BaseModel):
    message: Optional[str] = None
    start: bool = False


@api.post("/ai/interview")
async def ai_interview(inp: InterviewIn, user=Depends(current_user)):
    session_id = f"interview-{user['id']}"
    profile = await db.profiles.find_one({"user_id": user["id"]}) or {"data": {}}
    pdata = profile.get("data", {})
    # persist prior chat
    history = await db.ai_messages.find({"session_id": session_id}, {"_id": 0}).sort("ts", 1).to_list(200)

    system = (
        "You are the PathForge AI Career Interviewer for a college student. "
        "Ask ONE thoughtful adaptive follow-up question at a time based on prior context. "
        f"Student profile so far: {json.dumps(pdata)[:2000]}. "
        "Explore interests, work style, motivations, discomforts, hidden strengths. "
        "Keep questions warm, human, under 40 words. After ~6 exchanges, ask if they're ready to conclude."
    )
    convo = "\n".join([f"{m['role']}: {m['content']}" for m in history[-12:]])
    if inp.start or not inp.message:
        prompt = f"Prior conversation (may be empty):\n{convo}\n\nGreet the student by their first name '{user['full_name'].split()[0]}' and ask the FIRST insightful adaptive question."
    else:
        prompt = f"Prior conversation:\n{convo}\n\nStudent just said: \"{inp.message}\"\n\nRespond warmly in 1 short sentence acknowledging their answer, then ask the NEXT adaptive question. Keep it under 60 words total."

    reply = await llm_text(system, prompt, session_id)
    ts = now_iso()
    if inp.message:
        await db.ai_messages.insert_one({"id": new_id(), "session_id": session_id, "user_id": user["id"], "role": "student", "content": inp.message, "ts": ts})
    await db.ai_messages.insert_one({"id": new_id(), "session_id": session_id, "user_id": user["id"], "role": "forge", "content": reply, "ts": now_iso()})
    return {"reply": reply}


@api.get("/ai/interview/history")
async def interview_history(user=Depends(current_user)):
    session_id = f"interview-{user['id']}"
    msgs = await db.ai_messages.find({"session_id": session_id}, {"_id": 0}).sort("ts", 1).to_list(500)
    return {"messages": msgs}


# ---------------- Generate Career Profile ----------------
@api.post("/ai/generate-profile")
async def generate_profile(user=Depends(current_user)):
    profile = await db.profiles.find_one({"user_id": user["id"]}) or {"data": {}}
    pdata = profile.get("data", {})
    interview = await db.ai_messages.find({"session_id": f"interview-{user['id']}"}, {"_id": 0}).sort("ts", 1).to_list(200)
    interview_text = "\n".join([f"{m['role']}: {m['content']}" for m in interview])[:6000]

    system = (
        "You are PathForge AI's Career Profiler. Analyze the student's data and produce a strict JSON object with keys: "
        "career_directions (array of {name, score:int 40-95, why:string}), interest_profile (object: Technical, Analytical, Creative, Leadership, Business, Research → int 0-100), "
        "strength_profile (array of {name, level:int 0-100}), development_areas (array of strings), "
        "alternative_careers (array of {name, why}), summary (string 2-3 sentences), skill_gaps (array of {skill, current, target, priority}). "
        "Base scores on the actual profile. Do not fabricate certainty."
    )
    prompt = f"STUDENT PROFILE:\n{json.dumps(pdata)[:4000]}\n\nCAREER INTERVIEW:\n{interview_text}\n\nReturn the JSON profile object now."
    result = await llm_json(system, prompt, f"profile-{user['id']}", require_keys=["career_directions", "interest_profile", "summary"])
    # Fallback: if AI returned empty career_directions, retry once with a hard requirement
    if not result.get("career_directions"):
        result = await llm_json(system + "\nYou MUST return at least 3 career_directions.", prompt, f"profile-{user['id']}-retry", require_keys=["career_directions"])
    await db.career_profiles.update_one(
        {"user_id": user["id"]},
        {"$set": {"user_id": user["id"], "profile": result, "generated_at": now_iso()}},
        upsert=True,
    )
    return {"profile": result}


@api.get("/ai/profile")
async def get_ai_profile(user=Depends(current_user)):
    p = await get_profile_dict(user["id"])
    return {"profile": p or None}


# ---------------- Generate Roadmap ----------------
@api.post("/ai/generate-roadmap")
async def generate_roadmap(user=Depends(current_user)):
    profile = await db.profiles.find_one({"user_id": user["id"]}) or {"data": {}}
    pdata = profile.get("data", {})
    cp = await db.career_profiles.find_one({"user_id": user["id"]}) or {}
    cp_data = cp.get("profile", {})
    target = (cp_data.get("career_directions") or [{"name": "Software Engineering"}])[0]["name"]

    system = (
        "You are PathForge AI's Roadmap Generator. Produce a strict JSON object with keys: "
        "target_career (string), years (array of 4 items, one per year, each with: year (int 1-4), label (short string), semesters (array of 2 items each with: semester (int), title (short), academics (array of max 3 short strings), skills (array of max 3 short strings), projects (array of max 2 short strings), career (array of max 2 short strings), exploration (array of max 2 short strings))), "
        "nodes (array of 12-16 items each: {id (unique kebab-case), title, category ('Foundation'|'Programming'|'DSA'|'Development'|'AI/ML'|'Databases'|'Systems'|'Career'|'Projects'|'Interview'), status ('locked'|'available'|'recommended'|'in_progress'|'completed'), difficulty ('Beginner'|'Intermediate'|'Advanced'), est_hours (int), why (one short sentence), prerequisites (array of node ids), skills (array of max 3 short strings), tasks (array of max 3 {title, minutes:int})}). "
        "Keep every string under 90 chars. No newlines inside strings. Personalize based on branch, year, semester, current skills, priorities, time. Make the first 2-3 nodes 'available' or 'recommended', later ones 'locked'."
    )
    prompt = (
        f"STUDENT: {json.dumps(pdata)[:3500]}\n"
        f"TARGET CAREER: {target}\n"
        f"CAREER PROFILE: {json.dumps(cp_data)[:1500]}\n\n"
        "Generate the personalized roadmap JSON now."
    )
    result = await llm_json(system, prompt, f"roadmap-{user['id']}-{int(datetime.now().timestamp())}", retries=2, require_keys=["target_career", "years", "nodes"])
    await db.roadmaps.update_one(
        {"user_id": user["id"]},
        {"$set": {"user_id": user["id"], "roadmap": result, "generated_at": now_iso()}},
        upsert=True,
    )
    return {"roadmap": result}


@api.get("/roadmap")
async def get_roadmap(user=Depends(current_user)):
    r = await get_roadmap_dict(user["id"])
    return {"roadmap": r or None}


class NodeUpdateIn(BaseModel):
    node_id: str
    status: str


@api.post("/roadmap/node")
async def update_node(inp: NodeUpdateIn, user=Depends(current_user)):
    rm = await get_roadmap_dict(user["id"])
    if not rm or not rm.get("nodes"):
        raise HTTPException(404, "Roadmap not found")
    updated = False
    for n in rm.get("nodes", []):
        if n.get("id") == inp.node_id:
            n["status"] = inp.status
            updated = True
    if updated:
        await db.roadmaps.update_one({"user_id": user["id"]}, {"$set": {"roadmap": rm, "updated_at": now_iso()}})
    return {"ok": updated, "roadmap": rm}


# ---------------- Daily Planner ----------------
@api.post("/planner/today")
async def generate_today(user=Depends(current_user)):
    profile = await db.profiles.find_one({"user_id": user["id"]}) or {"data": {}}
    rm = await get_roadmap_dict(user["id"])
    cp = await get_profile_dict(user["id"])
    system = (
        "You are Forge — PathForge AI's daily companion (Jarvis-style). Generate today's plan as strict JSON: "
        "{greeting:string, tasks:[{priority:int, title, kind:'learn'|'practice'|'build'|'academic'|'passion', minutes:int, node_id:optional string, why:string}], total_minutes:int, notes:string}. "
        "Match the student's available_time. Pick 3-5 tasks. Draw from roadmap nodes and current skill focus."
    )
    prompt = f"STUDENT: {json.dumps(profile.get('data', {}))[:2500]}\nCAREER PROFILE: {json.dumps(cp)[:1200]}\nROADMAP NODES: {json.dumps(rm.get('nodes', [])[:20])[:2500]}\n\nGenerate today's plan JSON."
    plan = await llm_json(system, prompt, f"plan-{user['id']}-{datetime.now().date().isoformat()}", require_keys=["greeting", "tasks"])
    today = datetime.now(timezone.utc).date().isoformat()
    await db.daily_plans.update_one({"user_id": user["id"], "date": today}, {"$set": {"user_id": user["id"], "date": today, "plan": plan, "generated_at": now_iso()}}, upsert=True)
    return {"plan": plan, "date": today}


@api.get("/planner/today")
async def get_today(user=Depends(current_user)):
    today = datetime.now(timezone.utc).date().isoformat()
    doc = await db.daily_plans.find_one({"user_id": user["id"], "date": today}, {"_id": 0})
    return {"plan": (doc or {}).get("plan"), "date": today}


# ---------------- Forge AI Companion (Jarvis) ----------------
class ForgeIn(BaseModel):
    message: str


@api.post("/ai/forge")
async def forge_chat(inp: ForgeIn, user=Depends(current_user)):
    session_id = f"forge-{user['id']}"
    profile = (await db.profiles.find_one({"user_id": user["id"]}) or {}).get("data", {})
    cp = await get_profile_dict(user["id"])
    rm = await get_roadmap_dict(user["id"])
    skills = await db.user_skills.find({"user_id": user["id"]}, {"_id": 0}).to_list(100)
    system = (
        f"You are Forge — PathForge AI's Jarvis-style daily companion for {user['full_name']}. "
        "You know their profile, career direction, roadmap, skills, and today's plan. "
        f"PROFILE: {json.dumps(profile)[:1500]}\nCAREER: {json.dumps(cp)[:800]}\n"
        f"TARGET: {rm.get('target_career', 'undecided')}\nSKILLS: {json.dumps(skills)[:800]}\n"
        "Be concise, warm, tactical. Reference their actual data. Suggest concrete next actions. Never fabricate. Reply in 2-5 short sentences."
    )
    chat = LlmChat(api_key=EMERGENT_LLM_KEY, session_id=session_id, system_message=system).with_model("anthropic", "claude-sonnet-4-6")
    reply = await chat.send_message(UserMessage(text=inp.message))
    reply = reply if isinstance(reply, str) else str(reply)
    ts = now_iso()
    await db.ai_messages.insert_many([
        {"id": new_id(), "session_id": session_id, "user_id": user["id"], "role": "student", "content": inp.message, "ts": ts},
        {"id": new_id(), "session_id": session_id, "user_id": user["id"], "role": "forge", "content": reply, "ts": now_iso()},
    ])
    return {"reply": reply}


@api.get("/ai/forge/history")
async def forge_history(user=Depends(current_user)):
    msgs = await db.ai_messages.find({"session_id": f"forge-{user['id']}"}, {"_id": 0}).sort("ts", 1).to_list(500)
    return {"messages": msgs}


@api.post("/ai/forge/nudge")
async def forge_nudge(user=Depends(current_user)):
    """Proactive Jarvis-style suggestion based on current state."""
    profile = (await db.profiles.find_one({"user_id": user["id"]}) or {}).get("data", {})
    rm = await get_roadmap_dict(user["id"])
    today = datetime.now(timezone.utc).date().isoformat()
    plan = (await db.daily_plans.find_one({"user_id": user["id"], "date": today}) or {}).get("plan", {})
    system = "You are Forge, an ambient AI assistant. Produce ONE proactive, useful, contextual suggestion in 1 short sentence (under 22 words). No greeting."
    prompt = f"Student profile: {json.dumps(profile)[:800]}\nTarget: {rm.get('target_career', 'undecided')}\nToday plan: {json.dumps(plan)[:800]}\nGenerate a proactive suggestion now."
    reply = await llm_text(system, prompt, f"nudge-{user['id']}-{datetime.now().isoformat()}")
    return {"nudge": reply.strip()}


# ---------------- Skills ----------------
class SkillIn(BaseModel):
    name: str
    category: str
    current_level: str = "Beginner"
    target_level: str = "Intermediate"
    progress: int = 0
    evidence: Optional[str] = None


@api.get("/skills")
async def list_skills(user=Depends(current_user)):
    items = await db.user_skills.find({"user_id": user["id"]}, {"_id": 0}).to_list(500)
    return {"skills": items}


@api.post("/skills")
async def add_skill(inp: SkillIn, user=Depends(current_user)):
    doc = {"id": new_id(), "user_id": user["id"], **inp.model_dump(), "updated_at": now_iso()}
    await db.user_skills.insert_one(doc)
    doc.pop("_id", None)
    return {"skill": doc}


class SkillUpdateIn(BaseModel):
    current_level: Optional[str] = None
    target_level: Optional[str] = None
    progress: Optional[int] = None
    evidence: Optional[str] = None


@api.put("/skills/{skill_id}")
async def update_skill(skill_id: str, inp: SkillUpdateIn, user=Depends(current_user)):
    updates = {k: v for k, v in inp.model_dump().items() if v is not None}
    updates["updated_at"] = now_iso()
    await db.user_skills.update_one({"id": skill_id, "user_id": user["id"]}, {"$set": updates})
    doc = await db.user_skills.find_one({"id": skill_id, "user_id": user["id"]}, {"_id": 0})
    return {"skill": doc}


@api.delete("/skills/{skill_id}")
async def delete_skill(skill_id: str, user=Depends(current_user)):
    await db.user_skills.delete_one({"id": skill_id, "user_id": user["id"]})
    return {"ok": True}


# ---------------- Academic Records ----------------
class AcademicIn(BaseModel):
    semester: int
    subject: str
    credits: float
    grade_points: float
    grade: Optional[str] = None


@api.get("/academics")
async def list_academics(user=Depends(current_user)):
    items = await db.academics.find({"user_id": user["id"]}, {"_id": 0}).sort([("semester", 1)]).to_list(500)
    # compute SGPA/CGPA
    by_sem: Dict[int, List[dict]] = {}
    for i in items:
        by_sem.setdefault(i["semester"], []).append(i)
    sgpa_by_sem = []
    total_cr = 0.0
    total_pts = 0.0
    for sem in sorted(by_sem):
        cr = sum(x["credits"] for x in by_sem[sem])
        pts = sum(x["credits"] * x["grade_points"] for x in by_sem[sem])
        sgpa = round(pts / cr, 2) if cr else 0
        sgpa_by_sem.append({"semester": sem, "sgpa": sgpa, "credits": cr})
        total_cr += cr
        total_pts += pts
    cgpa = round(total_pts / total_cr, 2) if total_cr else 0
    return {"records": items, "sgpa_by_semester": sgpa_by_sem, "cgpa": cgpa}


@api.post("/academics")
async def add_academic(inp: AcademicIn, user=Depends(current_user)):
    doc = {"id": new_id(), "user_id": user["id"], **inp.model_dump(), "created_at": now_iso()}
    await db.academics.insert_one(doc)
    doc.pop("_id", None)
    return {"record": doc}


@api.delete("/academics/{rid}")
async def delete_academic(rid: str, user=Depends(current_user)):
    await db.academics.delete_one({"id": rid, "user_id": user["id"]})
    return {"ok": True}


# ---------------- Projects ----------------
class ProjectIn(BaseModel):
    name: str
    description: str = ""
    category: str = "General"
    status: str = "Planned"
    tech: List[str] = []
    github: Optional[str] = None
    demo: Optional[str] = None


@api.get("/projects")
async def list_projects(user=Depends(current_user)):
    items = await db.projects.find({"user_id": user["id"]}, {"_id": 0}).to_list(500)
    return {"projects": items}


@api.post("/projects")
async def add_project(inp: ProjectIn, user=Depends(current_user)):
    doc = {"id": new_id(), "user_id": user["id"], **inp.model_dump(), "created_at": now_iso()}
    await db.projects.insert_one(doc)
    doc.pop("_id", None)
    return {"project": doc}


@api.delete("/projects/{pid}")
async def delete_project(pid: str, user=Depends(current_user)):
    await db.projects.delete_one({"id": pid, "user_id": user["id"]})
    return {"ok": True}


# ---------------- Hobbies ----------------
class HobbyIn(BaseModel):
    name: str
    hours_per_week: float = 1.0
    streak_days: int = 0
    goals: str = ""


@api.get("/hobbies")
async def list_hobbies(user=Depends(current_user)):
    items = await db.hobbies.find({"user_id": user["id"]}, {"_id": 0}).to_list(500)
    return {"hobbies": items}


@api.post("/hobbies")
async def add_hobby(inp: HobbyIn, user=Depends(current_user)):
    doc = {"id": new_id(), "user_id": user["id"], **inp.model_dump(), "created_at": now_iso()}
    await db.hobbies.insert_one(doc)
    doc.pop("_id", None)
    return {"hobby": doc}


@api.delete("/hobbies/{hid}")
async def delete_hobby(hid: str, user=Depends(current_user)):
    await db.hobbies.delete_one({"id": hid, "user_id": user["id"]})
    return {"ok": True}


# ---------------- Daily Check-in ----------------
class CheckinIn(BaseModel):
    mood: str
    energy: int
    available_minutes: int
    notes: Optional[str] = ""


@api.post("/checkin")
async def checkin(inp: CheckinIn, user=Depends(current_user)):
    today = datetime.now(timezone.utc).date().isoformat()
    doc = {"id": new_id(), "user_id": user["id"], **inp.model_dump(), "date": today, "ts": now_iso()}
    # upsert to keep one row per (user, day)
    await db.checkins.update_one(
        {"user_id": user["id"], "date": today},
        {"$set": doc},
        upsert=True,
    )
    doc.pop("_id", None)
    return {"checkin": doc}


@api.get("/checkin/today")
async def checkin_today(user=Depends(current_user)):
    today = datetime.now(timezone.utc).date().isoformat()
    doc = await db.checkins.find_one({"user_id": user["id"], "date": today}, {"_id": 0})
    return {"checkin": doc}


# ---------------- Career Explorer ----------------
CAREERS = [
    {"id": "sde", "name": "Software Engineer", "summary": "Design, build and maintain software systems, APIs and applications.", "skills": ["Programming", "DSA", "Systems", "Git", "Databases"], "industries": ["Tech", "Fintech", "SaaS"]},
    {"id": "ds", "name": "Data Scientist", "summary": "Extract insight from data using statistics, ML and communication.", "skills": ["Python", "Statistics", "ML", "SQL", "Storytelling"], "industries": ["Tech", "Finance", "Healthcare"]},
    {"id": "ml", "name": "ML Engineer", "summary": "Ship production ML systems and pipelines at scale.", "skills": ["Python", "ML", "MLOps", "Cloud", "DSA"], "industries": ["AI", "Tech"]},
    {"id": "pm", "name": "Product Manager", "summary": "Own product strategy, customer discovery and execution.", "skills": ["Communication", "Analytics", "User research", "Prioritization"], "industries": ["Tech", "SaaS"]},
    {"id": "sec", "name": "Cybersecurity Engineer", "summary": "Protect systems, hunt threats, harden infrastructure.", "skills": ["Networking", "Linux", "Cryptography", "Scripting"], "industries": ["Enterprise", "Gov"]},
    {"id": "vlsi", "name": "VLSI Engineer", "summary": "Design and verify integrated circuits and SoCs.", "skills": ["Verilog", "Digital design", "SystemVerilog", "CMOS"], "industries": ["Semiconductor"]},
    {"id": "core", "name": "Core Engineer", "summary": "Apply engineering in mechanical / chemical / electrical domains.", "skills": ["Domain fundamentals", "CAD/MATLAB", "Problem solving"], "industries": ["Manufacturing", "Energy"]},
    {"id": "res", "name": "Researcher", "summary": "Advance knowledge through rigorous investigation and publications.", "skills": ["Math", "Writing", "Domain depth", "Curiosity"], "industries": ["Academia", "Labs"]},
    {"id": "ent", "name": "Entrepreneur", "summary": "Identify problems and build ventures around them.", "skills": ["Customer discovery", "MVP", "Sales", "Grit"], "industries": ["Startups"]},
    {"id": "ux", "name": "UX/Product Designer", "summary": "Design intuitive, humane digital experiences.", "skills": ["Design", "Research", "Prototyping", "Empathy"], "industries": ["Tech", "Consumer"]},
    {"id": "con", "name": "Consultant", "summary": "Solve strategic problems for organizations.", "skills": ["Communication", "Analytics", "Structured thinking"], "industries": ["Consulting"]},
    {"id": "fin", "name": "Finance / Quant", "summary": "Model markets, price risk, deploy capital.", "skills": ["Math", "Statistics", "Programming", "Finance"], "industries": ["Banking", "HFT"]},
]


@api.get("/careers")
async def list_careers(q: str = ""):
    items = CAREERS
    if q:
        ql = q.lower()
        items = [c for c in CAREERS if ql in c["name"].lower() or ql in c["summary"].lower() or any(ql in s.lower() for s in c["skills"])]
    return {"careers": items}


@api.get("/careers/{cid}")
async def get_career(cid: str):
    for c in CAREERS:
        if c["id"] == cid:
            return {"career": c}
    raise HTTPException(404, "Career not found")


# ---------------- Skill Gap ----------------
@api.get("/skill-gap")
async def skill_gap(user=Depends(current_user)):
    cp = await get_profile_dict(user["id"])
    skills = await db.user_skills.find({"user_id": user["id"]}, {"_id": 0}).to_list(500)
    profile = (await db.profiles.find_one({"user_id": user["id"]}) or {}).get("data", {})
    dirs = cp.get("career_directions") or []
    target = dirs[0]["name"] if dirs else profile.get("primary_career", "TBD")
    return {"gaps": cp.get("skill_gaps", []), "current_skills": skills, "target": target}


# ---------------- Dashboard summary ----------------
@api.get("/dashboard")
async def dashboard(user=Depends(current_user)):
    profile = (await db.profiles.find_one({"user_id": user["id"]}) or {}).get("data", {})
    cp = await get_profile_dict(user["id"])
    rm = await get_roadmap_dict(user["id"])
    skills = await db.user_skills.find({"user_id": user["id"]}, {"_id": 0}).to_list(500)
    projects = await db.projects.find({"user_id": user["id"]}, {"_id": 0}).to_list(200)
    academics = await db.academics.find({"user_id": user["id"]}, {"_id": 0}).to_list(500)
    today = datetime.now(timezone.utc).date().isoformat()
    plan = (await db.daily_plans.find_one({"user_id": user["id"], "date": today}) or {}).get("plan")

    total_cr = sum(x["credits"] for x in academics)
    total_pts = sum(x["credits"] * x["grade_points"] for x in academics)
    cgpa = round(total_pts / total_cr, 2) if total_cr else None

    nodes = rm.get("nodes", []) if rm else []
    total_nodes = len(nodes)
    completed = sum(1 for n in nodes if n.get("status") == "completed")
    progress = round(completed / total_nodes * 100) if total_nodes else 0
    health = min(100, 40 + progress // 2 + (10 if cgpa and cgpa >= 7 else 0) + (10 if len(projects) >= 1 else 0))

    dirs = cp.get("career_directions") if isinstance(cp.get("career_directions"), list) else []
    career_direction = dirs[0] if dirs else None
    return {
        "user": {"full_name": user["full_name"], "email": user["email"]},
        "profile": profile,
        "career_direction": career_direction,
        "roadmap_progress": progress,
        "roadmap_target": rm.get("target_career") if rm else None,
        "cgpa": cgpa,
        "skills_count": len(skills),
        "projects_count": len(projects),
        "today_plan": plan,
        "health_score": health,
        "nodes_completed": completed,
        "nodes_total": total_nodes,
    }


# ---------------- Career Goal Simulator ----------------
class SimulatorIn(BaseModel):
    target_role: str
    industry: Optional[str] = ""
    salary_band: Optional[str] = ""
    location: Optional[str] = ""
    higher_studies: Optional[str] = ""  # 'yes'|'no'|'maybe'
    startup_or_job: Optional[str] = ""  # 'startup'|'job'|'either'


@api.post("/ai/simulator")
async def simulator(inp: SimulatorIn, user=Depends(current_user)):
    profile = (await db.profiles.find_one({"user_id": user["id"]}) or {}).get("data", {})
    cp = await get_profile_dict(user["id"])
    system = (
        "You are PathForge AI's Career Goal Simulator. Produce STRICT JSON: "
        "{target_role, industry, routes:[3 items each {name, tagline, steps:[5-7 short strings], skills:[5 short strings], "
        "effort:'Low'|'Medium'|'High'|'Very High', duration:'e.g. 2-3 years', milestones:[3-4 short], risks:[2-3 short], "
        "alternatives:[2 short]}], caveats: array of 2-3 sentences}. "
        "NEVER guarantee salary or placement. Use language like 'possible trajectory', 'competitive pathway'. "
        "Personalize with the student's branch, current skills, and priorities."
    )
    prompt = (
        f"STUDENT: {json.dumps(profile)[:2200]}\nCAREER PROFILE: {json.dumps(cp)[:900]}\n"
        f"TARGET: {json.dumps(inp.model_dump())}\n\nGenerate three distinct routes."
    )
    result = await llm_json(system, prompt, f"sim-{user['id']}-{int(datetime.now().timestamp())}", require_keys=["routes"])
    await db.simulations.insert_one({"id": new_id(), "user_id": user["id"], "input": inp.model_dump(), "result": result, "ts": now_iso()})
    return {"simulation": result}


@api.get("/ai/simulator/history")
async def simulator_history(user=Depends(current_user)):
    items = await db.simulations.find({"user_id": user["id"]}, {"_id": 0}).sort("ts", -1).to_list(10)
    return {"simulations": items}


# ---------------- Weekly Review ----------------
@api.post("/ai/weekly-review")
async def weekly_review(user=Depends(current_user)):
    profile = (await db.profiles.find_one({"user_id": user["id"]}) or {}).get("data", {})
    cp = await get_profile_dict(user["id"])
    rm = await get_roadmap_dict(user["id"])
    skills = await db.user_skills.find({"user_id": user["id"]}, {"_id": 0}).to_list(200)
    week_ago = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
    checkins = await db.checkins.find({"user_id": user["id"], "ts": {"$gte": week_ago}}, {"_id": 0}).to_list(20)
    plans = await db.daily_plans.find({"user_id": user["id"], "generated_at": {"$gte": week_ago}}, {"_id": 0}).to_list(14)
    nodes = rm.get("nodes", []) if isinstance(rm, dict) else []
    completed = [n for n in nodes if n.get("status") == "completed"]
    in_prog = [n for n in nodes if n.get("status") == "in_progress"]

    system = (
        "You are PathForge AI's Weekly Reviewer. Analyze the student's last 7 days and produce STRICT JSON: "
        "{summary:string (2 sentences), wins:[3-5 short strings], missed:[2-4 short strings], risks:[2-3 short strings], "
        "adjustments:[2-4 short strings], next_week_focus:[3-4 short strings], "
        "roadmap_changes:[array of {node_id:string (must match an existing node id from roadmap), new_status:'available'|'recommended'|'in_progress'|'locked', reason:string (1 sentence why)}]}. "
        "Only propose roadmap_changes when they are clearly justified. Never fabricate node ids."
    )
    prompt = (
        f"CAREER TARGET: {rm.get('target_career', 'undecided')}\n"
        f"ROADMAP NODES (first 20): {json.dumps(nodes[:20])[:2000]}\n"
        f"COMPLETED NODES: {json.dumps([n.get('title') for n in completed])[:500]}\n"
        f"IN PROGRESS: {json.dumps([n.get('title') for n in in_prog])[:500]}\n"
        f"SKILLS: {json.dumps(skills)[:800]}\n"
        f"DAILY PLANS THIS WEEK: {json.dumps(plans)[:1200]}\n"
        f"CHECKINS THIS WEEK: {json.dumps(checkins)[:600]}\n\n"
        "Generate the weekly review JSON."
    )
    result = await llm_json(system, prompt, f"review-{user['id']}-{datetime.now().date().isoformat()}", require_keys=["summary", "wins", "next_week_focus"])
    review_id = new_id()
    await db.weekly_reviews.insert_one({
        "id": review_id, "user_id": user["id"], "week_ending": datetime.now(timezone.utc).date().isoformat(),
        "review": result, "applied": False, "ts": now_iso(),
    })
    return {"review_id": review_id, "review": result}


@api.get("/ai/weekly-review/latest")
async def weekly_review_latest(user=Depends(current_user)):
    doc = await db.weekly_reviews.find_one({"user_id": user["id"]}, {"_id": 0}, sort=[("ts", -1)])
    return {"review": doc}


class ReviewApplyIn(BaseModel):
    review_id: str


@api.post("/ai/weekly-review/accept")
async def weekly_review_accept(inp: ReviewApplyIn, user=Depends(current_user)):
    doc = await db.weekly_reviews.find_one({"id": inp.review_id, "user_id": user["id"]})
    if not doc:
        raise HTTPException(404, "Review not found")
    changes = (doc.get("review") or {}).get("roadmap_changes") or []
    rm = await get_roadmap_dict(user["id"])
    nodes = rm.get("nodes", []) if isinstance(rm, dict) else []
    node_index = {n.get("id"): n for n in nodes if n.get("id")}
    applied = 0
    for c in changes:
        nid = c.get("node_id")
        ns = c.get("new_status")
        if nid in node_index and ns in {"available", "recommended", "in_progress", "locked"}:
            node_index[nid]["status"] = ns
            applied += 1
    if applied and isinstance(rm, dict):
        await db.roadmaps.update_one({"user_id": user["id"]}, {"$set": {"roadmap": rm, "updated_at": now_iso()}})
    await db.weekly_reviews.update_one({"id": inp.review_id}, {"$set": {"applied": True, "applied_at": now_iso()}})
    return {"applied": applied, "roadmap": rm}


# ---------------- Streaks & Perks ----------------
PERKS = [
    {"days": 3,  "id": "spark",       "name": "Spark",       "desc": "Momentum ignited. Your first micro-badge."},
    {"days": 7,  "id": "momentum",    "name": "Momentum",    "desc": "One full week. Forge tunes tasks to your energy."},
    {"days": 14, "id": "focus",       "name": "Focus",       "desc": "Two weeks. Priority tag unlocked for tasks."},
    {"days": 30, "id": "discipline",  "name": "Discipline",  "desc": "A month clean. Advanced weekly analytics unlocked."},
    {"days": 60, "id": "legend",      "name": "Legend",      "desc": "Sixty days. Forge grants the golden arc-reactor ring."},
    {"days": 100,"id": "singularity", "name": "Singularity", "desc": "One hundred consecutive check-ins. You are the roadmap."},
]


def _compute_streak(dates: list[str]) -> tuple[int, int]:
    """Return (current_streak, longest_streak). dates: sorted ISO YYYY-MM-DD strings, unique."""
    if not dates:
        return 0, 0
    from datetime import date
    ds = sorted({d for d in dates})
    parsed = [date.fromisoformat(d) for d in ds]
    # longest
    longest = 1
    run = 1
    for i in range(1, len(parsed)):
        if (parsed[i] - parsed[i - 1]).days == 1:
            run += 1
            longest = max(longest, run)
        else:
            run = 1
    # current: streak ending today or yesterday
    today = datetime.now(timezone.utc).date()
    current = 0
    if parsed[-1] == today or parsed[-1] == today - timedelta(days=1):
        current = 1
        for i in range(len(parsed) - 2, -1, -1):
            if (parsed[i + 1] - parsed[i]).days == 1:
                current += 1
            else:
                break
    return current, longest


@api.get("/streak")
async def get_streak(user=Depends(current_user)):
    rows = await db.checkins.find({"user_id": user["id"]}, {"_id": 0, "date": 1}).to_list(1000)
    dates = [r["date"] for r in rows if r.get("date")]
    current, longest = _compute_streak(dates)
    unlocked = [p for p in PERKS if longest >= p["days"]]
    next_perk = next((p for p in PERKS if longest < p["days"]), None)
    return {
        "current_streak": current,
        "longest_streak": longest,
        "total_checkins": len(set(dates)),
        "unlocked_perks": unlocked,
        "next_perk": next_perk,
        "days_to_next": (next_perk["days"] - longest) if next_perk else 0,
    }


# ---------------- Placement Simulator ----------------
class PlacementIn(BaseModel):
    role: str
    companies: List[str] = []


@api.post("/ai/placement")
async def placement(inp: PlacementIn, user=Depends(current_user)):
    profile = (await db.profiles.find_one({"user_id": user["id"]}) or {}).get("data", {})
    cp = await get_profile_dict(user["id"])
    rm = await get_roadmap_dict(user["id"])
    skills = await db.user_skills.find({"user_id": user["id"]}, {"_id": 0}).to_list(200)
    acads = await db.academics.find({"user_id": user["id"]}, {"_id": 0}).to_list(200)
    projects = await db.projects.find({"user_id": user["id"]}, {"_id": 0}).to_list(50)
    total_cr = sum(x.get("credits", 0) for x in acads)
    total_pts = sum(x.get("credits", 0) * x.get("grade_points", 0) for x in acads)
    cgpa = round(total_pts / total_cr, 2) if total_cr else None

    companies = [c.strip() for c in inp.companies if c.strip()] or ["Google", "Microsoft", "Amazon"]

    system = (
        "You are PathForge AI's Placement Readiness Simulator. Return STRICT JSON: "
        "{role, overall_readiness:int 0-100, tier:'exploratory'|'developing'|'competitive'|'strong', "
        "companies:[{name, readiness:int 0-100, verdict:'far'|'developing'|'competitive'|'strong', "
        "strengths:[3 short strings], gaps:[3 short strings], missing_skills:[3 short strings], "
        "critical_actions:[3 short imperative sentences], bar_notes:string (1 sentence about typical bar)}], "
        "top_move:string (single most impactful next action, 1 sentence), disclaimer:string}. "
        "NEVER guarantee placements. Use language like 'competitive', 'developing', 'signals suggest'. "
        "Base scoring on skills, projects, CGPA, roadmap progression, career direction."
    )
    payload = {
        "role": inp.role,
        "companies": companies,
        "cgpa": cgpa,
        "profile": profile,
        "career_direction": (cp.get("career_directions") or [{}])[0] if isinstance(cp.get("career_directions"), list) else None,
        "roadmap_target": rm.get("target_career") if isinstance(rm, dict) else None,
        "completed_nodes": [n.get("title") for n in (rm.get("nodes", []) if isinstance(rm, dict) else []) if n.get("status") == "completed"],
        "skills": skills[:40],
        "projects": [{"name": p.get("name"), "tech": p.get("tech"), "status": p.get("status")} for p in projects[:20]],
    }
    prompt = f"STUDENT DATA:\n{json.dumps(payload)[:5000]}\n\nGenerate placement readiness JSON now."
    result = await llm_json(system, prompt, f"placement-{user['id']}-{int(datetime.now().timestamp())}", retries=2, require_keys=["overall_readiness", "companies", "top_move"])
    await db.placements.insert_one({"id": new_id(), "user_id": user["id"], "input": inp.model_dump(), "result": result, "ts": now_iso()})
    return {"placement": result}


@api.get("/ai/placement/latest")
async def placement_latest(user=Depends(current_user)):
    doc = await db.placements.find_one({"user_id": user["id"]}, {"_id": 0}, sort=[("ts", -1)])
    return {"placement": (doc or {}).get("result"), "input": (doc or {}).get("input")}


# ---------------- Global Search ----------------
COMPANIES = [
    {"name": "Google", "tags": ["FAANG", "Product", "DSA-heavy"]},
    {"name": "Microsoft", "tags": ["Product", "Systems"]},
    {"name": "Amazon", "tags": ["Leadership principles", "Scale"]},
    {"name": "Meta", "tags": ["FAANG", "DSA-heavy"]},
    {"name": "Apple", "tags": ["Hardware", "Systems"]},
    {"name": "Netflix", "tags": ["Senior-heavy", "Culture"]},
    {"name": "NVIDIA", "tags": ["GPU", "AI", "Systems"]},
    {"name": "OpenAI", "tags": ["AI research", "Product"]},
    {"name": "Goldman Sachs", "tags": ["Finance", "Quant"]},
    {"name": "JPMorgan Chase", "tags": ["Finance", "Enterprise"]},
    {"name": "Deloitte", "tags": ["Consulting", "Service"]},
    {"name": "TCS", "tags": ["Mass recruiter", "Service"]},
    {"name": "Infosys", "tags": ["Mass recruiter", "Service"]},
    {"name": "Wipro", "tags": ["Mass recruiter", "Service"]},
    {"name": "Accenture", "tags": ["Consulting", "Service"]},
    {"name": "Zoho", "tags": ["Product", "Skill-first"]},
    {"name": "Flipkart", "tags": ["E-commerce", "Scale"]},
    {"name": "Zomato", "tags": ["Consumer", "Product"]},
    {"name": "Razorpay", "tags": ["Fintech", "Startup"]},
    {"name": "CRED", "tags": ["Fintech", "Design-led"]},
    {"name": "Swiggy", "tags": ["Consumer", "Ops-tech"]},
    {"name": "Atlassian", "tags": ["Product", "Remote"]},
    {"name": "Uber", "tags": ["Scale", "Systems"]},
    {"name": "Adobe", "tags": ["Product", "Creative tech"]},
    {"name": "Qualcomm", "tags": ["Semiconductor", "VLSI"]},
    {"name": "Texas Instruments", "tags": ["Semiconductor", "Analog"]},
    {"name": "Intel", "tags": ["Semiconductor", "Systems"]},
    {"name": "Samsung R&D", "tags": ["Hardware", "Embedded"]},
    {"name": "De Shaw", "tags": ["Quant", "Highly selective"]},
    {"name": "Tower Research", "tags": ["HFT", "Quant"]},
]

PAGES = [
    {"label": "Dashboard", "to": "/dashboard", "hint": "Health score, today's plan, streak"},
    {"label": "Roadmap", "to": "/roadmap", "hint": "Node canvas, job & founder tracks"},
    {"label": "Skills", "to": "/skills", "hint": "Skill tracker"},
    {"label": "Academics", "to": "/academics", "hint": "CGPA / SGPA tracker"},
    {"label": "Projects", "to": "/projects", "hint": "Project tracker"},
    {"label": "Hobbies", "to": "/hobbies", "hint": "Hobby tracker"},
    {"label": "Career Explorer", "to": "/careers", "hint": "Browse career paths"},
    {"label": "Skill Gap", "to": "/skill-gap", "hint": "Gap vs target career"},
    {"label": "Career Simulator", "to": "/simulator", "hint": "Multi-route simulation"},
    {"label": "Placement Simulator", "to": "/placement", "hint": "Company readiness"},
    {"label": "Weekly Review", "to": "/weekly-review", "hint": "Wins, misses, next focus"},
    {"label": "Streak", "to": "/streak", "hint": "Check-in streak & perks"},
    {"label": "Resume Builder", "to": "/resume", "hint": "AI tailored one-page resume"},
    {"label": "Founder Track", "to": "/founder", "hint": "Startup roadmap + validation log"},
]


@api.get("/search")
async def global_search(q: str = "", user=Depends(current_user)):
    ql = q.strip().lower()
    out: Dict[str, List[dict]] = {"pages": [], "roadmap": [], "founder": [], "skills": [], "projects": [], "careers": [], "companies": []}
    if not ql:
        out["pages"] = [{"title": p["label"], "subtitle": p["hint"], "to": p["to"]} for p in PAGES]
        return {"query": q, "results": out, "count": len(out["pages"]), "ask_forge": False}

    def hit(*vals) -> bool:
        return any(ql in str(v).lower() for v in vals if v)

    out["pages"] = [{"title": p["label"], "subtitle": p["hint"], "to": p["to"]} for p in PAGES if hit(p["label"], p["hint"])][:6]

    rm = await get_roadmap_dict(user["id"])
    for n in (rm.get("nodes") or []):
        if hit(n.get("title"), n.get("category"), n.get("why"), " ".join(n.get("skills") or [])):
            out["roadmap"].append({"title": n.get("title"), "subtitle": f"{n.get('category','')} · {str(n.get('status','')).replace('_',' ')}", "to": "/roadmap"})
    out["roadmap"] = out["roadmap"][:6]

    fr = await get_founder_dict(user["id"])
    for n in (fr.get("nodes") or []):
        if hit(n.get("title"), n.get("category"), n.get("why")):
            out["founder"].append({"title": n.get("title"), "subtitle": f"FOUNDER · {n.get('category','')}", "to": "/founder"})
    out["founder"] = out["founder"][:5]

    skills = await db.user_skills.find({"user_id": user["id"]}, {"_id": 0}).to_list(300)
    out["skills"] = [{"title": s.get("name"), "subtitle": f"{s.get('category','skill')} · level {s.get('level', 0)}", "to": "/skills"} for s in skills if hit(s.get("name"), s.get("category"))][:6]

    projects = await db.projects.find({"user_id": user["id"]}, {"_id": 0}).to_list(200)
    out["projects"] = [{"title": p.get("name"), "subtitle": f"{p.get('tech','')} · {p.get('status','')}", "to": "/projects"} for p in projects if hit(p.get("name"), p.get("tech"), p.get("description"))][:6]

    out["careers"] = [{"title": c["name"], "subtitle": c["summary"][:80], "to": "/careers"} for c in CAREERS if hit(c["name"], c["summary"], " ".join(c["skills"]))][:6]
    out["companies"] = [{"title": c["name"], "subtitle": " · ".join(c["tags"]), "to": "/placement"} for c in COMPANIES if hit(c["name"], " ".join(c["tags"]))][:6]

    count = sum(len(v) for v in out.values())
    return {"query": q, "results": out, "count": count, "ask_forge": count == 0}


# ---------------- Resume Builder ----------------
def _resume_context(profile, cp, rm, skills, acads, projects, hobbies, user) -> dict:
    total_cr = sum(x.get("credits", 0) for x in acads)
    total_pts = sum(x.get("credits", 0) * x.get("grade_points", 0) for x in acads)
    cgpa = round(total_pts / total_cr, 2) if total_cr else None
    dirs = cp.get("career_directions") if isinstance(cp.get("career_directions"), list) else []
    target = (dirs[0].get("name") if dirs else None) or (rm.get("target_career") if isinstance(rm, dict) else None) or "Software Engineer"
    return {
        "full_name": user["full_name"],
        "email": user["email"],
        "target_role": target,
        "cgpa": cgpa,
        "semesters": [{"semester": a.get("semester"), "sgpa": a.get("sgpa")} for a in acads][:12],
        "profile": profile,
        "skills": [{"name": s.get("name"), "category": s.get("category"), "level": s.get("level")} for s in skills][:40],
        "projects": [{"name": p.get("name"), "tech": p.get("tech"), "description": p.get("description"), "status": p.get("status"), "link": p.get("link")} for p in projects][:12],
        "hobbies": [h.get("name") for h in hobbies][:10],
        "completed_nodes": [n.get("title") for n in (rm.get("nodes", []) if isinstance(rm, dict) else []) if n.get("status") == "completed"][:20],
        "strengths": cp.get("strength_profile"),
    }


@api.post("/resume/generate")
async def resume_generate(user=Depends(current_user)):
    profile = (await db.profiles.find_one({"user_id": user["id"]}) or {}).get("data", {})
    cp = await get_profile_dict(user["id"])
    rm = await get_roadmap_dict(user["id"])
    skills = await db.user_skills.find({"user_id": user["id"]}, {"_id": 0}).to_list(300)
    acads = await db.academics.find({"user_id": user["id"]}, {"_id": 0}).to_list(300)
    projects = await db.projects.find({"user_id": user["id"]}, {"_id": 0}).to_list(100)
    hobbies = await db.hobbies.find({"user_id": user["id"]}, {"_id": 0}).to_list(100)
    ctx = _resume_context(profile, cp, rm, skills, acads, projects, hobbies, user)

    system = (
        "You are PathForge AI's Resume Builder. Build a truthful, ATS-friendly ONE-PAGE resume tailored to the target role. "
        "Return STRICT JSON: {name, email, phone, location, links:[{label,url}], headline (max 90 chars), "
        "summary (2 sentences, first person free), education:[{institution, degree, detail, score, period}], "
        "skills:[{group (e.g. Languages/Frameworks/Tools/Core), items:[max 8 short strings]}], "
        "projects:[{name, tech, bullets:[2-3 impact bullets starting with a strong verb, max 120 chars each]}], "
        "coursework:[max 6 short strings], achievements:[max 4 short strings], extras:[max 3 short strings], target_role}. "
        "NEVER invent employers, internships, metrics, certifications, phone numbers or links that are not in the data. "
        "If phone/location/links are unknown, return empty strings or empty arrays. Rewrite the student's real projects "
        "and skills into strong resume language without fabricating outcomes. Keep total content to one page."
    )
    prompt = f"STUDENT DATA:\n{json.dumps(ctx, default=str)[:6000]}\n\nGenerate the tailored resume JSON now."
    result = await llm_json(system, prompt, f"resume-{user['id']}-{int(datetime.now().timestamp())}", retries=2, require_keys=["name", "skills", "projects"])
    result.setdefault("target_role", ctx["target_role"])
    result.setdefault("email", ctx["email"])
    result.setdefault("name", ctx["full_name"])
    await db.resumes.update_one(
        {"user_id": user["id"]},
        {"$set": {"user_id": user["id"], "resume": result, "generated_at": now_iso(), "updated_at": now_iso()}},
        upsert=True,
    )
    return {"resume": result}


@api.get("/resume")
async def resume_get(user=Depends(current_user)):
    doc = await db.resumes.find_one({"user_id": user["id"]}, {"_id": 0}) or {}
    r = doc.get("resume")
    return {"resume": r if isinstance(r, dict) else None, "updated_at": doc.get("updated_at")}


class ResumeSaveIn(BaseModel):
    resume: Dict[str, Any]


@api.put("/resume")
async def resume_save(inp: ResumeSaveIn, user=Depends(current_user)):
    await db.resumes.update_one(
        {"user_id": user["id"]},
        {"$set": {"user_id": user["id"], "resume": inp.resume, "updated_at": now_iso()}},
        upsert=True,
    )
    return {"ok": True, "resume": inp.resume}


def _build_resume_pdf(r: dict) -> bytes:
    from io import BytesIO
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.lib.units import mm
    from reportlab.lib.enums import TA_CENTER
    from reportlab.lib import colors
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, HRFlowable

    buf = BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=16 * mm, rightMargin=16 * mm, topMargin=14 * mm, bottomMargin=14 * mm, title=f"{r.get('name','Resume')} — Resume")
    name_s = ParagraphStyle("name", fontName="Helvetica-Bold", fontSize=20, leading=23, alignment=TA_CENTER, spaceAfter=2)
    contact_s = ParagraphStyle("contact", fontName="Helvetica", fontSize=8.5, leading=12, alignment=TA_CENTER, textColor=colors.HexColor("#3f3f3f"))
    sec_s = ParagraphStyle("sec", fontName="Helvetica-Bold", fontSize=9.5, leading=12, spaceBefore=8, spaceAfter=2, textColor=colors.black)
    body_s = ParagraphStyle("body", fontName="Helvetica", fontSize=9, leading=12.5)
    bullet_s = ParagraphStyle("bullet", parent=body_s, leftIndent=9, bulletIndent=1)

    def esc(t):
        return str(t or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

    F = [Paragraph(esc(r.get("name")), name_s)]
    contact = [x for x in [r.get("email"), r.get("phone"), r.get("location")] if x]
    contact += [f"{l.get('label')}: {l.get('url')}" for l in (r.get("links") or []) if l.get("url")]
    if contact:
        F.append(Paragraph(esc(" | ".join(contact)), contact_s))
    if r.get("headline"):
        F.append(Paragraph(esc(r["headline"]), contact_s))
    F.append(Spacer(1, 4))
    F.append(HRFlowable(width="100%", thickness=0.8, color=colors.black, spaceAfter=2))

    def section(title):
        F.append(Paragraph(esc(title).upper(), sec_s))
        F.append(HRFlowable(width="100%", thickness=0.4, color=colors.HexColor("#999999"), spaceAfter=4))

    if r.get("summary"):
        section("Summary")
        F.append(Paragraph(esc(r["summary"]), body_s))
    if r.get("education"):
        section("Education")
        for e in r["education"]:
            head = " — ".join([x for x in [esc(e.get("institution")), esc(e.get("degree"))] if x])
            right = " · ".join([x for x in [esc(e.get("score")), esc(e.get("period"))] if x])
            F.append(Paragraph(f"<b>{head}</b>{(' · ' + right) if right else ''}", body_s))
            if e.get("detail"):
                F.append(Paragraph(esc(e["detail"]), body_s))
    if r.get("skills"):
        section("Skills")
        for g in r["skills"]:
            items = ", ".join([esc(i) for i in (g.get("items") or [])])
            F.append(Paragraph(f"<b>{esc(g.get('group'))}:</b> {items}", body_s))
    if r.get("projects"):
        section("Projects")
        for p in r["projects"]:
            tech = f" <font color='#555555'>| {esc(p.get('tech'))}</font>" if p.get("tech") else ""
            F.append(Paragraph(f"<b>{esc(p.get('name'))}</b>{tech}", body_s))
            for b in (p.get("bullets") or []):
                F.append(Paragraph(esc(b), bullet_s, bulletText="•"))
    for key, title in [("coursework", "Relevant Coursework"), ("achievements", "Achievements"), ("extras", "Extras")]:
        vals = r.get(key) or []
        if vals:
            section(title)
            for v in vals:
                F.append(Paragraph(esc(v), bullet_s, bulletText="•"))
    doc.build(F)
    return buf.getvalue()


@api.get("/resume/pdf")
async def resume_pdf(user=Depends(current_user)):
    from fastapi.responses import Response
    doc = await db.resumes.find_one({"user_id": user["id"]}) or {}
    r = doc.get("resume")
    if not isinstance(r, dict):
        raise HTTPException(404, "No resume generated yet")
    pdf = _build_resume_pdf(r)
    fname = re.sub(r"[^A-Za-z0-9]+", "_", str(r.get("name") or "resume")).strip("_") or "resume"
    return Response(content=pdf, media_type="application/pdf", headers={"Content-Disposition": f'attachment; filename="{fname}_Resume.pdf"'})


# ---------------- Founder Track ----------------
FOUNDER_CATEGORIES = "'Discovery'|'Validation'|'MVP'|'Traction'|'Fundraising'|'Team'|'Ops'|'Skills'"


async def get_founder_dict(user_id: str) -> dict:
    doc = await db.founder_roadmaps.find_one({"user_id": user_id}) or {}
    rm = doc.get("roadmap")
    return rm if isinstance(rm, dict) else {}


class FounderGenIn(BaseModel):
    idea: Optional[str] = ""
    horizon_months: Optional[int] = 12


@api.post("/ai/generate-founder-roadmap")
async def generate_founder_roadmap(inp: FounderGenIn, user=Depends(current_user)):
    profile = (await db.profiles.find_one({"user_id": user["id"]}) or {}).get("data", {})
    cp = await get_profile_dict(user["id"])
    skills = await db.user_skills.find({"user_id": user["id"]}, {"_id": 0}).to_list(200)
    projects = await db.projects.find({"user_id": user["id"]}, {"_id": 0}).to_list(50)

    system = (
        "You are PathForge AI's Founder Track Generator. Build a startup-building roadmap for a student founder. "
        "Return STRICT JSON with keys: track ('founder'), idea (string), thesis (1 sentence), "
        "phases (array of exactly 4 items each: {phase (int 1-4), label (short), window (e.g. 'Month 1-3'), "
        "goal (1 short sentence), milestones (array of max 3 short strings), metrics (array of max 2 short strings), "
        "risks (array of max 2 short strings)}), "
        f"nodes (array of 12-16 items each: {{id (unique kebab-case), title, category ({FOUNDER_CATEGORIES}), "
        "status ('locked'|'available'|'recommended'|'in_progress'|'completed'), difficulty ('Beginner'|'Intermediate'|'Advanced'), "
        "est_hours (int), why (one short sentence), prerequisites (array of node ids), skills (array of max 3 short strings), "
        "tasks (array of max 3 {title, minutes:int})}), "
        "first_week (array of 3 short imperative actions), disclaimer (string). "
        "The path MUST run customer discovery → problem validation → MVP scope/build → early traction → pitch/fundraise readiness. "
        "Keep every string under 90 chars, no newlines inside strings. Make first 2-3 nodes 'available' or 'recommended', later ones 'locked'. "
        "Ground it in the student's real skills, branch and time availability. Be honest about startup risk."
    )
    prompt = (
        f"STUDENT: {json.dumps(profile)[:3000]}\n"
        f"CAREER PROFILE: {json.dumps(cp)[:1200]}\n"
        f"SKILLS: {json.dumps([s.get('name') for s in skills])[:600]}\n"
        f"PROJECTS: {json.dumps([p.get('name') for p in projects])[:400]}\n"
        f"STARTUP IDEA (may be vague or empty): {inp.idea or 'not decided yet — help them find a problem space that fits their skills'}\n"
        f"HORIZON: {inp.horizon_months or 12} months\n\n"
        "Generate the founder roadmap JSON now."
    )
    result = await llm_json(system, prompt, f"founder-{user['id']}-{int(datetime.now().timestamp())}", retries=2, require_keys=["phases", "nodes"])
    result.setdefault("track", "founder")
    result.setdefault("idea", inp.idea or "")
    await db.founder_roadmaps.update_one(
        {"user_id": user["id"]},
        {"$set": {"user_id": user["id"], "roadmap": result, "idea": inp.idea or "", "generated_at": now_iso()}},
        upsert=True,
    )
    return {"roadmap": result}


@api.get("/founder/roadmap")
async def founder_roadmap(user=Depends(current_user)):
    r = await get_founder_dict(user["id"])
    return {"roadmap": r or None}


class FounderNodeIn(BaseModel):
    node_id: str
    status: str


@api.post("/founder/node")
async def founder_node(inp: FounderNodeIn, user=Depends(current_user)):
    rm = await get_founder_dict(user["id"])
    if not rm or not rm.get("nodes"):
        raise HTTPException(404, "Founder roadmap not found")
    allowed = {"locked", "available", "recommended", "in_progress", "completed"}
    if inp.status not in allowed:
        raise HTTPException(400, "Invalid status")
    updated = False
    for n in rm.get("nodes", []):
        if n.get("id") == inp.node_id:
            n["status"] = inp.status
            updated = True
    if updated:
        await db.founder_roadmaps.update_one({"user_id": user["id"]}, {"$set": {"roadmap": rm, "updated_at": now_iso()}})
    return {"ok": updated, "roadmap": rm}


LOG_TYPES = {"interview", "hypothesis", "experiment", "mvp_scope", "metric"}
LOG_OUTCOMES = {"validated", "invalidated", "inconclusive", "pending"}


class FounderLogIn(BaseModel):
    type: str
    title: str
    notes: Optional[str] = ""
    outcome: Optional[str] = "pending"


@api.get("/founder/log")
async def founder_log_list(user=Depends(current_user)):
    items = await db.founder_logs.find({"user_id": user["id"]}, {"_id": 0}).sort("ts", -1).to_list(300)
    counts = {o: sum(1 for i in items if i.get("outcome") == o) for o in LOG_OUTCOMES}
    return {"entries": items, "counts": counts, "total": len(items)}


@api.post("/founder/log")
async def founder_log_add(inp: FounderLogIn, user=Depends(current_user)):
    if inp.type not in LOG_TYPES:
        raise HTTPException(400, "Invalid type")
    outcome = inp.outcome if inp.outcome in LOG_OUTCOMES else "pending"
    doc = {"id": new_id(), "user_id": user["id"], "type": inp.type, "title": inp.title.strip(), "notes": (inp.notes or "").strip(), "outcome": outcome, "ts": now_iso()}
    await db.founder_logs.insert_one(dict(doc))
    return {"entry": doc}


@api.delete("/founder/log/{lid}")
async def founder_log_delete(lid: str, user=Depends(current_user)):
    res = await db.founder_logs.delete_one({"id": lid, "user_id": user["id"]})
    return {"ok": res.deleted_count > 0}


@api.post("/founder/insights")
async def founder_insights(user=Depends(current_user)):
    items = await db.founder_logs.find({"user_id": user["id"]}, {"_id": 0}).sort("ts", -1).to_list(120)
    if not items:
        raise HTTPException(400, "Log at least one entry first")
    rm = await get_founder_dict(user["id"])
    system = (
        "You are PathForge AI's Founder Coach. Analyze a student founder's validation log. Return STRICT JSON: "
        "{signal_strength:int 0-100, stage:'pre-problem'|'problem-validated'|'solution-validated'|'early-traction', "
        "patterns:[3 short strings], validated:[max 3 short strings], invalidated:[max 3 short strings], "
        "blind_spots:[max 3 short strings], next_experiments:[3 {title, why, effort:'S'|'M'|'L'}], "
        "kill_or_continue:string (1 honest sentence), disclaimer:string}. "
        "Be brutally honest — if evidence is thin, say the signal is weak. Never inflate."
    )
    prompt = (
        f"FOUNDER ROADMAP IDEA: {rm.get('idea') or 'unknown'}\n"
        f"VALIDATION LOG ({len(items)} entries):\n{json.dumps(items, default=str)[:5000]}\n\n"
        "Generate the insights JSON now."
    )
    result = await llm_json(system, prompt, f"founder-insights-{user['id']}-{int(datetime.now().timestamp())}", retries=2, require_keys=["signal_strength", "patterns", "next_experiments"])
    await db.founder_insights.update_one(
        {"user_id": user["id"]},
        {"$set": {"user_id": user["id"], "insights": result, "ts": now_iso()}},
        upsert=True,
    )
    return {"insights": result}


@api.get("/founder/insights/latest")
async def founder_insights_latest(user=Depends(current_user)):
    doc = await db.founder_insights.find_one({"user_id": user["id"]}, {"_id": 0}) or {}
    ins = doc.get("insights")
    return {"insights": ins if isinstance(ins, dict) else None, "ts": doc.get("ts")}


# ---------------- register ----------------
app.include_router(api)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("shutdown")
async def _shutdown():
    client.close()
