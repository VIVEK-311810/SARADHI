import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Header from '../components/shared/Header';

const mockNavigate = jest.fn();

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

const renderHeader = (path = '/teacher/dashboard') => {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Header />
    </MemoryRouter>
  );
};

describe('Header', () => {
  beforeEach(() => {
    mockNavigate.mockReset();
  });

  it('should render the platform name', () => {
    renderHeader('/auth');
    expect(screen.getByText('EduPlatform')).toBeInTheDocument();
  });

  it('should not show navigation buttons on auth page', () => {
    renderHeader('/auth');
    expect(screen.queryByText('Dashboard')).not.toBeInTheDocument();
    expect(screen.queryByText('Logout')).not.toBeInTheDocument();
  });

  it('should show teacher navigation when teacher is logged in', () => {
    localStorage.setItem('currentUser', JSON.stringify({
      id: 'teacher-1',
      role: 'teacher',
      full_name: 'Prof Smith',
    }));

    renderHeader('/teacher/dashboard');
    expect(screen.getAllByText('Dashboard').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Create Session').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Analytics').length).toBeGreaterThan(0);
  });

  it('should show student navigation when student is logged in', () => {
    localStorage.setItem('currentUser', JSON.stringify({
      id: '123456',
      role: 'student',
      full_name: 'John Doe',
    }));

    renderHeader('/student/dashboard');
    expect(screen.getAllByText('Dashboard').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Join Session').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Leaderboard').length).toBeGreaterThan(0);
  });

  it('should clear localStorage and navigate to /auth on logout', () => {
    localStorage.setItem('currentUser', JSON.stringify({
      id: 'teacher-1',
      role: 'teacher',
      full_name: 'Prof Smith',
    }));
    localStorage.setItem('authToken', 'some-token');

    renderHeader('/teacher/dashboard');

    // Find the desktop logout button (visible on md+)
    const logoutButtons = screen.getAllByText('Logout');
    fireEvent.click(logoutButtons[0]);

    expect(localStorage.removeItem).toHaveBeenCalledWith('currentUser');
    expect(localStorage.removeItem).toHaveBeenCalledWith('authToken');
    expect(mockNavigate).toHaveBeenCalledWith('/auth');
  });

  it('should not show nav buttons when no user is logged in', () => {
    renderHeader('/teacher/dashboard');
    expect(screen.queryByText('Dashboard')).not.toBeInTheDocument();
    expect(screen.queryByText('Logout')).not.toBeInTheDocument();
  });
});
