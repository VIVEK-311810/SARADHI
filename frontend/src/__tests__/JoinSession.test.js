import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import JoinSession from '../components/student/JoinSession';

const mockNavigate = jest.fn();

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

const renderJoinSession = () =>
  render(
    <MemoryRouter>
      <JoinSession />
    </MemoryRouter>
  );

describe('JoinSession', () => {
  beforeEach(() => {
    mockNavigate.mockReset();
    // Set up authenticated student
    localStorage.setItem('currentUser', JSON.stringify({
      id: '123456',
      role: 'student',
      full_name: 'Test Student',
      email: '123456@sastra.ac.in',
    }));
    localStorage.setItem('authToken', 'valid-token');
  });

  it('should render the join session form', () => {
    renderJoinSession();
    expect(screen.getByText('Join a Session')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('ABC123')).toBeInTheDocument();
    expect(screen.getByText('Join Session')).toBeInTheDocument();
  });

  it('should redirect to /auth if no user is logged in', () => {
    localStorage.clear();
    renderJoinSession();
    expect(mockNavigate).toHaveBeenCalledWith('/auth');
  });

  it('should redirect to /auth if user is not a student', () => {
    localStorage.setItem('currentUser', JSON.stringify({
      id: 'teacher-1',
      role: 'teacher',
      full_name: 'Prof Smith',
    }));
    renderJoinSession();
    expect(mockNavigate).toHaveBeenCalledWith('/auth');
  });

  it('should uppercase input as user types', () => {
    renderJoinSession();
    const input = screen.getByPlaceholderText('ABC123');
    fireEvent.change(input, { target: { value: 'abc123' } });
    expect(input.value).toBe('ABC123');
  });

  it('should disable submit button when input is empty', () => {
    renderJoinSession();
    const submitButton = screen.getByText('Join Session');
    expect(submitButton).toBeDisabled();
  });

  it('should enable submit button when input has value', () => {
    renderJoinSession();
    const input = screen.getByPlaceholderText('ABC123');
    fireEvent.change(input, { target: { value: 'XYZ789' } });
    const submitButton = screen.getByText('Join Session');
    expect(submitButton).not.toBeDisabled();
  });

  it('should call API and navigate on successful join', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        session: {
          session_id: 'ABC123',
          title: 'Test Session',
          course_name: 'CS101',
        },
      }),
    });

    renderJoinSession();
    const input = screen.getByPlaceholderText('ABC123');
    fireEvent.change(input, { target: { value: 'ABC123' } });
    fireEvent.submit(screen.getByText('Join Session').closest('form'));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/sessions/ABC123/join'),
        expect.objectContaining({ method: 'POST' })
      );
    });

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/student/session/ABC123');
    });
  });

  it('should show error on failed join', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
    });

    renderJoinSession();
    const input = screen.getByPlaceholderText('ABC123');
    fireEvent.change(input, { target: { value: 'BAD999' } });
    fireEvent.submit(screen.getByText('Join Session').closest('form'));

    await waitFor(() => {
      expect(screen.getByText(/unable to join session/i)).toBeInTheDocument();
    });
  });

  it('should show loading state while joining', async () => {
    // Never-resolving promise to keep loading state
    global.fetch.mockReturnValueOnce(new Promise(() => {}));

    renderJoinSession();
    const input = screen.getByPlaceholderText('ABC123');
    fireEvent.change(input, { target: { value: 'ABC123' } });
    fireEvent.submit(screen.getByText('Join Session').closest('form'));

    await waitFor(() => {
      expect(screen.getByText('Joining...')).toBeInTheDocument();
    });
  });

  it('should have a back to dashboard link', () => {
    renderJoinSession();
    const backButton = screen.getByText(/back to dashboard/i);
    fireEvent.click(backButton);
    expect(mockNavigate).toHaveBeenCalledWith('/student/dashboard');
  });
});
