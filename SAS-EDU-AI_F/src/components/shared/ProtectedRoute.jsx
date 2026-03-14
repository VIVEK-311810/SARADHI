import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { safeParseUser } from '../../utils/api';

const ProtectedRoute = ({ allowedRoles }) => {
  const currentUser = safeParseUser();
  const authToken = localStorage.getItem('authToken');

  if (!authToken || !currentUser) {
    // Not authenticated, redirect to login
    return <Navigate to="/auth" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(currentUser.role)) {
    // Authenticated but not authorized, redirect to their dashboard or a forbidden page
    if (currentUser.role === 'teacher') {
      return <Navigate to="/teacher/dashboard" replace />;
    } else if (currentUser.role === 'student') {
      return <Navigate to="/student/dashboard" replace />;
    } else {
      return <Navigate to="/auth" replace />;
    }
  }

  // Authenticated and authorized, render the child routes
  return <Outlet />;
};

export default ProtectedRoute;
