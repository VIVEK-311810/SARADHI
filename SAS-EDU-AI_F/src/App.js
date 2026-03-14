import React, { Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Toaster } from 'sonner';
import './index.css';

// Theme provider
import { ThemeProvider } from './context/ThemeContext';

// Shared Components (eager — used on every page, must be static imports)
import ErrorBoundary from './components/shared/ErrorBoundary';
import LoadingSpinner from './components/shared/LoadingSpinner';
import Header from './components/shared/Header';
import SessionHistory from './components/shared/SessionHistory';
import SessionResourcesShared from './components/shared/SessionResources';
import DemoBanner from './components/shared/DemoBanner';

// Auth Components
const RoleSelection = lazy(() => import('./components/auth/RoleSelection'));
const OAuth2Callback = lazy(() => import('./components/auth/OAuth2Callback'));

// Teacher Components
const EnhancedTeacherDashboard = lazy(() => import('./components/teacher/EnhancedTeacherDashboard'));
const CreateSession = lazy(() => import('./components/teacher/CreateSession'));
const EnhancedSessionManagement = lazy(() => import('./components/teacher/EnhancedSessionManagement'));
const ResourceUpload = lazy(() => import('./components/teacher/ResourceUpload'));
const TeacherAnalytics = lazy(() => import('./components/teacher/TeacherAnalytics'));

// Student Components
const EnhancedStudentDashboard = lazy(() => import('./components/student/EnhancedStudentDashboard'));
const EnhancedStudentSession = lazy(() => import('./components/student/EnhancedStudentSession'));
const JoinSession = lazy(() => import('./components/student/JoinSession'));
const SessionResources = lazy(() => import('./components/student/SessionResources'));
const AIAssistant = lazy(() => import('./components/student/AIAssistant'));
const VisitSession = lazy(() => import('./components/student/VisitSession'));
const AIResourceSearch = lazy(() => import('./components/student/AIResourceSearch'));
const Leaderboard = lazy(() => import('./components/student/Leaderboard'));
const Quiz = lazy(() => import('./components/student/Quiz'));

// Community Components
const CommunityBoard = lazy(() => import('./components/community/CommunityBoard'));
const TicketDetail = lazy(() => import('./components/community/TicketDetail'));

// AppLayout must be inside Router so useLocation works
function AppLayout() {
  const location = useLocation();
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors duration-200">
      <Toaster position="bottom-right" richColors closeButton />
      <DemoBanner />
      <Header />
      {/* key={location.pathname} forces remount on navigation, replaying animate-page-in */}
      <main key={location.pathname} className="container mx-auto px-4 py-8 animate-page-in">
        <Suspense fallback={<LoadingSpinner text="Loading..." />}>
          <Routes>
            {/* Default route */}
            <Route path="/" element={<Navigate to="/auth" replace />} />

            {/* Authentication routes */}
            <Route path="/auth" element={<RoleSelection />} />
            <Route path="/auth/callback" element={<OAuth2Callback />} />

            {/* Teacher routes */}
            <Route path="/teacher/dashboard" element={<EnhancedTeacherDashboard />} />
            <Route path="/teacher/create-session" element={<CreateSession />} />
            <Route path="/teacher/session/:sessionId" element={<EnhancedSessionManagement />} />
            <Route path="/teacher/session/:sessionId/upload" element={<ResourceUpload />} />
            <Route path="/teacher/analytics" element={<TeacherAnalytics />} />

            {/* Student routes */}
            <Route path="/student/dashboard" element={<EnhancedStudentDashboard />} />
            <Route path="/student/join" element={<JoinSession />} />
            <Route path="/student/session/:sessionId" element={<EnhancedStudentSession />} />
            <Route path="/student/session/:sessionId/resources" element={<SessionResources />} />
            <Route path="/student/session/:sessionId/search" element={<AIResourceSearch />} />
            <Route path="/student/ai-assistant/:sessionId" element={<AIAssistant />} />
            <Route path="/student/session/:sessionId/history" element={<VisitSession />} />
            <Route path="/student/session/:sessionId/quiz" element={<Quiz />} />
            <Route path="/student/leaderboard" element={<Leaderboard />} />
            <Route path="/student/leaderboard/:sessionId" element={<Leaderboard />} />

            {/* Community routes */}
            <Route path="/community" element={<CommunityBoard />} />
            <Route path="/community/session/:sessionId" element={<CommunityBoard />} />
            <Route path="/community/tickets/:ticketId" element={<TicketDetail />} />

            {/* Shared routes */}
            <Route path="/session-history" element={<SessionHistory />} />
            <Route path="/session/:sessionId/resources" element={<SessionResourcesShared />} />

            {/* Catch all route */}
            <Route path="*" element={<Navigate to="/auth" replace />} />
          </Routes>
        </Suspense>
      </main>
    </div>
  );
}

function App() {
  return (
    <ThemeProvider>
      <ErrorBoundary>
        <Router>
          <AppLayout />
        </Router>
      </ErrorBoundary>
    </ThemeProvider>
  );
}

export default App;
