import "@/index.css";
import "reactflow/dist/style.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { Toaster } from "sonner";
import Landing from "@/pages/Landing";
import Login from "@/pages/Login";
import Signup from "@/pages/Signup";
import Onboarding from "@/pages/Onboarding";
import Interview from "@/pages/Interview";
import ProfileResults from "@/pages/ProfileResults";
import Dashboard from "@/pages/Dashboard";
import RoadmapPage from "@/pages/RoadmapPage";
import SkillsPage from "@/pages/SkillsPage";
import AcademicsPage from "@/pages/AcademicsPage";
import ProjectsPage from "@/pages/ProjectsPage";
import HobbiesPage from "@/pages/HobbiesPage";
import CareerExplorer from "@/pages/CareerExplorer";
import SkillGapPage from "@/pages/SkillGapPage";
import CareerSimulator from "@/pages/CareerSimulator";
import WeeklyReview from "@/pages/WeeklyReview";
import PlacementSimulator from "@/pages/PlacementSimulator";
import StreakPage from "@/pages/StreakPage";
import AppShell from "@/components/AppShell";

function Private({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center text-neutral-500 font-mono-ui text-xs">LOADING...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (!user.onboarding_complete) return <Navigate to="/onboarding" replace />;
  return <AppShell>{children}</AppShell>;
}

function OnboardingGate({ children }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Toaster theme="dark" position="top-right" toastOptions={{ style: { background: "#0a0a0a", color: "#fff", border: "1px solid rgba(255,255,255,0.12)", fontFamily: "JetBrains Mono, monospace", fontSize: 12 } }} />
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/onboarding" element={<OnboardingGate><Onboarding /></OnboardingGate>} />
          <Route path="/interview" element={<OnboardingGate><Interview /></OnboardingGate>} />
          <Route path="/profile-results" element={<OnboardingGate><ProfileResults /></OnboardingGate>} />
          <Route path="/dashboard" element={<Private><Dashboard /></Private>} />
          <Route path="/roadmap" element={<Private><RoadmapPage /></Private>} />
          <Route path="/skills" element={<Private><SkillsPage /></Private>} />
          <Route path="/academics" element={<Private><AcademicsPage /></Private>} />
          <Route path="/projects" element={<Private><ProjectsPage /></Private>} />
          <Route path="/hobbies" element={<Private><HobbiesPage /></Private>} />
          <Route path="/careers" element={<Private><CareerExplorer /></Private>} />
          <Route path="/skill-gap" element={<Private><SkillGapPage /></Private>} />
          <Route path="/simulator" element={<Private><CareerSimulator /></Private>} />
          <Route path="/weekly-review" element={<Private><WeeklyReview /></Private>} />
          <Route path="/placement" element={<Private><PlacementSimulator /></Private>} />
          <Route path="/streak" element={<Private><StreakPage /></Private>} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
