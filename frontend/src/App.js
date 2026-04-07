import React, { Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Toaster } from 'sonner';
import './index.css';

// Providers
import { ThemeProvider } from './context/ThemeContext';
import { NotificationProvider } from './context/NotificationContext';

// Eager shared components
import ErrorBoundary from './components/shared/ErrorBoundary';
import LoadingSpinner from './components/shared/LoadingSpinner';
import DemoBanner from './components/shared/DemoBanner';

// Layout
import AppLayout from './components/layout/AppLayout';

// Shared (used inside layout)
import SessionHistory from './components/shared/SessionHistory';
import SessionResourcesShared from './components/shared/SessionResources';

// Auth Components
const RoleSelection   = lazy(() => import('./components/auth/RoleSelection'));
const OAuth2Callback  = lazy(() => import('./components/auth/OAuth2Callback'));

// Landing + Demo
const LandingPage  = lazy(() => import('./components/landing/LandingPage'));
const TeacherDemo  = lazy(() => import('./components/demo/TeacherDemo'));
const StudentDemo  = lazy(() => import('./components/demo/StudentDemo'));

// Teacher Components
const EnhancedTeacherDashboard  = lazy(() => import('./components/teacher/EnhancedTeacherDashboard'));
const CreateSession             = lazy(() => import('./components/teacher/CreateSession'));
const EnhancedSessionManagement = lazy(() => import('./components/teacher/EnhancedSessionManagement'));
const ResourceUpload            = lazy(() => import('./components/teacher/ResourceUpload'));
const TeacherAnalytics          = lazy(() => import('./components/teacher/TeacherAnalytics'));

// Student Components
const EnhancedStudentDashboard = lazy(() => import('./components/student/EnhancedStudentDashboard'));
const EnhancedStudentSession   = lazy(() => import('./components/student/EnhancedStudentSession'));
const JoinSession              = lazy(() => import('./components/student/JoinSession'));
const AIAssistant              = lazy(() => import('./components/student/AIAssistant'));
const VisitSession             = lazy(() => import('./components/student/VisitSession'));
const AIResourceSearch         = lazy(() => import('./components/student/AIResourceSearch'));
const Leaderboard              = lazy(() => import('./components/student/Leaderboard'));
const Quiz                     = lazy(() => import('./components/student/Quiz'));
const CompetitionLobby         = lazy(() => import('./components/student/CompetitionLobby'));
const CompetitionRoom          = lazy(() => import('./components/student/CompetitionRoom'));
const FacultyCompetitionLobby  = lazy(() => import('./components/teacher/FacultyCompetitionLobby'));

// Community Components
const CommunityBoard = lazy(() => import('./components/community/CommunityBoard'));
const TicketDetail   = lazy(() => import('./components/community/TicketDetail'));

// ── Helpers ───────────────────────────────────────────────────────────────────
function getAuth() {
  const token  = localStorage.getItem('authToken');
  const isDemo = localStorage.getItem('isDemo') === 'true';
  const authenticated = !!(token || isDemo);

  let role = null;
  try {
    const raw = localStorage.getItem('currentUser');
    if (raw) role = JSON.parse(raw)?.role ?? null;
  } catch { /* ignore */ }

  return { authenticated, role };
}

// ── Auth pages (no sidebar) ───────────────────────────────────────────────────
function AuthShell() {
  const location = useLocation();
  return (
    <div className="min-h-screen bg-mesh-auth" key={location.pathname}>
      <Suspense fallback={<LoadingSpinner text="Loading..." />}>
        <Routes>
          <Route path="/auth"          element={<RoleSelection />} />
          <Route path="/auth/callback" element={<OAuth2Callback />} />
          <Route path="*"              element={<Navigate to="/auth" replace />} />
        </Routes>
      </Suspense>
    </div>
  );
}

// ── Teacher routes (with sidebar) ────────────────────────────────────────────
function TeacherRoutes() {
  return (
    <AppLayout role="teacher">
      <Suspense fallback={<LoadingSpinner text="Loading..." />}>
        <Routes>
          <Route path="/teacher/dashboard"                  element={<EnhancedTeacherDashboard />} />
          <Route path="/teacher/create-session"             element={<CreateSession />} />
          <Route path="/teacher/session/:sessionId"         element={<EnhancedSessionManagement />} />
          <Route path="/teacher/session/:sessionId/upload"  element={<ResourceUpload />} />
          <Route path="/teacher/analytics"                  element={<TeacherAnalytics />} />
          <Route path="/teacher/competition"               element={<FacultyCompetitionLobby />} />
          <Route path="/teacher/competition/room/:roomCode" element={<CompetitionRoom isTeacherSpectator />} />
          <Route path="/community"                          element={<CommunityBoard />} />
          <Route path="/community/session/:sessionId"       element={<CommunityBoard />} />
          <Route path="/community/tickets/:ticketId"        element={<TicketDetail />} />
          <Route path="/session-history"                    element={<SessionHistory />} />
          <Route path="/session/:sessionId/resources"       element={<SessionResourcesShared />} />
          <Route path="*"                                   element={<Navigate to="/teacher/dashboard" replace />} />
        </Routes>
      </Suspense>
    </AppLayout>
  );
}

// ── Student routes (with sidebar) ────────────────────────────────────────────
function StudentRoutes() {
  return (
    <AppLayout role="student">
      <Suspense fallback={<LoadingSpinner text="Loading..." />}>
        <Routes>
          <Route path="/student/dashboard"                     element={<EnhancedStudentDashboard />} />
          <Route path="/student/join"                          element={<JoinSession />} />
          <Route path="/student/session/:sessionId"            element={<EnhancedStudentSession />} />
          <Route path="/student/session/:sessionId/resources"  element={<SessionResourcesShared />} />
          <Route path="/student/session/:sessionId/search"     element={<AIResourceSearch />} />
          <Route path="/student/ai-assistant/:sessionId"       element={<AIAssistant />} />
          <Route path="/student/ai-assistant"                  element={<Navigate to="/student/dashboard" replace />} />
          <Route path="/student/session/:sessionId/history"    element={<VisitSession />} />
          <Route path="/student/session/:sessionId/quiz"       element={<Quiz />} />
          <Route path="/student/leaderboard"                   element={<Leaderboard />} />
          <Route path="/student/leaderboard/:sessionId"        element={<Leaderboard />} />
          <Route path="/student/competition"                   element={<CompetitionLobby />} />
          <Route path="/student/competition/room/:roomCode"    element={<CompetitionRoom />} />
          <Route path="/community"                             element={<CommunityBoard />} />
          <Route path="/community/session/:sessionId"          element={<CommunityBoard />} />
          <Route path="/community/tickets/:ticketId"           element={<TicketDetail />} />
          <Route path="/session-history"                       element={<SessionHistory />} />
          <Route path="/session/:sessionId/resources"          element={<SessionResourcesShared />} />
          <Route path="*"                                      element={<Navigate to="/student/dashboard" replace />} />
        </Routes>
      </Suspense>
    </AppLayout>
  );
}

// ── Root router — determines which shell to render ───────────────────────────
function RootRouter() {
  const location = useLocation();
  const { authenticated, role } = getAuth();

  // Auth routes — always accessible (no sidebar)
  if (location.pathname.startsWith('/auth')) {
    return <AuthShell />;
  }

  // Not authenticated → landing page at root, demo pages, or redirect to landing
  if (!authenticated) {
    if (location.pathname === '/') {
      return (
        <Suspense fallback={<LoadingSpinner text="Loading..." />}>
          <LandingPage />
        </Suspense>
      );
    }
    if (location.pathname === '/demo/teacher') {
      return (
        <Suspense fallback={<LoadingSpinner text="Loading..." />}>
          <TeacherDemo />
        </Suspense>
      );
    }
    if (location.pathname === '/demo/student') {
      return (
        <Suspense fallback={<LoadingSpinner text="Loading..." />}>
          <StudentDemo />
        </Suspense>
      );
    }
    return <Navigate to="/" replace />;
  }

  // Root redirect → role dashboard
  if (location.pathname === '/') {
    return <Navigate to={role === 'teacher' ? '/teacher/dashboard' : '/student/dashboard'} replace />;
  }

  // Teacher shell
  if (role === 'teacher') {
    return <TeacherRoutes />;
  }

  // Student shell
  if (role === 'student') {
    return <StudentRoutes />;
  }

  // Unknown role → re-auth
  return <Navigate to="/auth" replace />;
}

// ── App root ──────────────────────────────────────────────────────────────────
function App() {
  return (
    <ThemeProvider>
      <NotificationProvider>
        <ErrorBoundary>
          <Router>
            <Toaster position="bottom-right" richColors closeButton />
            <DemoBanner />
            <RootRouter />
          </Router>
        </ErrorBoundary>
      </NotificationProvider>
    </ThemeProvider>
  );
}

export default App;
