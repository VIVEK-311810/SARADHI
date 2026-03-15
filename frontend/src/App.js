import React, { Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Toaster } from 'sonner';
import './index.css';

// Providers
import { ThemeProvider } from './context/ThemeContext';

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
const SessionResources         = lazy(() => import('./components/student/SessionResources'));
const AIAssistant              = lazy(() => import('./components/student/AIAssistant'));
const VisitSession             = lazy(() => import('./components/student/VisitSession'));
const AIResourceSearch         = lazy(() => import('./components/student/AIResourceSearch'));
const Leaderboard              = lazy(() => import('./components/student/Leaderboard'));
const Quiz                     = lazy(() => import('./components/student/Quiz'));

// Community Components
const CommunityBoard = lazy(() => import('./components/community/CommunityBoard'));
const TicketDetail   = lazy(() => import('./components/community/TicketDetail'));

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
          <Route path="/teacher/dashboard"                       element={<EnhancedTeacherDashboard />} />
          <Route path="/teacher/create-session"                  element={<CreateSession />} />
          <Route path="/teacher/session/:sessionId"             element={<EnhancedSessionManagement />} />
          <Route path="/teacher/session/:sessionId/upload"      element={<ResourceUpload />} />
          <Route path="/teacher/analytics"                      element={<TeacherAnalytics />} />
          <Route path="/community"                              element={<CommunityBoard />} />
          <Route path="/community/session/:sessionId"           element={<CommunityBoard />} />
          <Route path="/community/tickets/:ticketId"            element={<TicketDetail />} />
          <Route path="/session-history"                        element={<SessionHistory />} />
          <Route path="/session/:sessionId/resources"           element={<SessionResourcesShared />} />
          <Route path="*"                                        element={<Navigate to="/teacher/dashboard" replace />} />
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
          <Route path="/student/dashboard"                        element={<EnhancedStudentDashboard />} />
          <Route path="/student/join"                             element={<JoinSession />} />
          <Route path="/student/session/:sessionId"              element={<EnhancedStudentSession />} />
          <Route path="/student/session/:sessionId/resources"    element={<SessionResources />} />
          <Route path="/student/session/:sessionId/search"       element={<AIResourceSearch />} />
          <Route path="/student/ai-assistant/:sessionId"        element={<AIAssistant />} />
          <Route path="/student/session/:sessionId/history"     element={<VisitSession />} />
          <Route path="/student/session/:sessionId/quiz"        element={<Quiz />} />
          <Route path="/student/leaderboard"                    element={<Leaderboard />} />
          <Route path="/student/leaderboard/:sessionId"         element={<Leaderboard />} />
          <Route path="/community"                              element={<CommunityBoard />} />
          <Route path="/community/session/:sessionId"           element={<CommunityBoard />} />
          <Route path="/community/tickets/:ticketId"            element={<TicketDetail />} />
          <Route path="/session-history"                        element={<SessionHistory />} />
          <Route path="/session/:sessionId/resources"           element={<SessionResourcesShared />} />
          <Route path="*"                                        element={<Navigate to="/student/dashboard" replace />} />
        </Routes>
      </Suspense>
    </AppLayout>
  );
}

// ── Root router — determines which shell to render ───────────────────────────
function RootRouter() {
  const location = useLocation();
  const role = localStorage.getItem('role');
  const token = localStorage.getItem('token');
  const isDemo = localStorage.getItem('isDemo');

  // Auth routes — no sidebar
  if (location.pathname.startsWith('/auth')) {
    return <AuthShell />;
  }

  // Default redirect
  if (location.pathname === '/') {
    if ((token || isDemo) && role === 'teacher') return <Navigate to="/teacher/dashboard" replace />;
    if ((token || isDemo) && role === 'student')  return <Navigate to="/student/dashboard" replace />;
    return <Navigate to="/auth" replace />;
  }

  // Teacher routes
  if (location.pathname.startsWith('/teacher') || (role === 'teacher' && !location.pathname.startsWith('/student'))) {
    return <TeacherRoutes />;
  }

  // Student routes
  if (location.pathname.startsWith('/student') || (role === 'student' && !location.pathname.startsWith('/teacher'))) {
    return <StudentRoutes />;
  }

  // Community and shared — use role-based layout
  if (role === 'teacher') return <TeacherRoutes />;
  if (role === 'student') return <StudentRoutes />;

  // No role — send to auth
  return <Navigate to="/auth" replace />;
}

// ── App root ──────────────────────────────────────────────────────────────────
function App() {
  return (
    <ThemeProvider>
      <ErrorBoundary>
        <Router>
          <Toaster position="bottom-right" richColors closeButton />
          <DemoBanner />
          <RootRouter />
        </Router>
      </ErrorBoundary>
    </ThemeProvider>
  );
}

export default App;
