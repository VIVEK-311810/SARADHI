import React from 'react';
import { Link } from 'react-router-dom';

const Navigation = () => {
  return (
    <nav className="bg-gray-800 p-4">
      <ul className="flex space-x-4 text-white">
        <li>
          <Link to="/" className="hover:text-gray-300">Home</Link>
        </li>
        <li>
          <Link to="/teacher/dashboard" className="hover:text-gray-300">Teacher Dashboard</Link>
        </li>
        <li>
          <Link to="/student/dashboard" className="hover:text-gray-300">Student Dashboard</Link>
        </li>
        <li>
          <Link to="/auth" className="hover:text-gray-300">Login</Link>
        </li>
      </ul>
    </nav>
  );
};

export default Navigation;
