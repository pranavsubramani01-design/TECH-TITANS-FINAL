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
    result = await llm_json(system, prompt, f"roadmap-{user['id']}-{int(datetime.now().timestamp())}", require_keys=["target_career", "years", "nodes"])
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
    doc = {"id": new_id(), "user_id": user["id"], **inp.model_dump(), "date": datetime.now(timezone.utc).date().isoformat(), "ts": now_iso()}
    await db.checkins.insert_one(doc)
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
