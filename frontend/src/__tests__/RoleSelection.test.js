import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import RoleSelection from '../components/auth/RoleSelection';

const renderWithRouter = (ui) => render(<MemoryRouter>{ui}</MemoryRouter>);

describe('RoleSelection', () => {
  it('should render the platform title', () => {
    renderWithRouter(<RoleSelection />);
    expect(screen.getByText('Welcome to SARADHI-AI')).toBeInTheDocument();
  });

  it('should render teacher and student options', () => {
    renderWithRouter(<RoleSelection />);
    expect(screen.getByText('Teacher')).toBeInTheDocument();
    expect(screen.getByText('Student')).toBeInTheDocument();
  });

  it('should render sign-in prompts for both roles', () => {
    renderWithRouter(<RoleSelection />);
    // Both role cards have a "Sign in" text
    const signInElements = screen.getAllByText('Sign in');
    expect(signInElements.length).toBeGreaterThanOrEqual(2);
  });

  it('should redirect to teacher OAuth when teacher card is clicked', () => {
    renderWithRouter(<RoleSelection />);
    const teacherCard = screen.getByText('Teacher').closest('button');
    fireEvent.click(teacherCard);
    expect(window.location.href).toContain('/auth/google/edu');
  });

  it('should redirect to student OAuth when student card is clicked', () => {
    renderWithRouter(<RoleSelection />);
    const studentCard = screen.getByText('Student').closest('button');
    fireEvent.click(studentCard);
    expect(window.location.href).toContain('/auth/google/acin');
  });

  it('should display email domain info for each role', () => {
    renderWithRouter(<RoleSelection />);
    expect(screen.getByText('@*.sastra.edu')).toBeInTheDocument();
    expect(screen.getByText('@sastra.ac.in')).toBeInTheDocument();
  });

  it('should display secure authentication notice', () => {
    renderWithRouter(<RoleSelection />);
    expect(screen.getByText(/Protected by Google OAuth2/)).toBeInTheDocument();
  });
});
