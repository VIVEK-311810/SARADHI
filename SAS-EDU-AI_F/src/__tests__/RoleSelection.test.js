import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import RoleSelection from '../components/auth/RoleSelection';

const renderWithRouter = (ui) => render(<MemoryRouter>{ui}</MemoryRouter>);

describe('RoleSelection', () => {
  it('should render the platform title', () => {
    renderWithRouter(<RoleSelection />);
    expect(screen.getByText('SASTRA Educational Platform')).toBeInTheDocument();
  });

  it('should render teacher and student options', () => {
    renderWithRouter(<RoleSelection />);
    expect(screen.getByText('Teacher')).toBeInTheDocument();
    expect(screen.getByText('Student')).toBeInTheDocument();
  });

  it('should render sign-in buttons for both roles', () => {
    renderWithRouter(<RoleSelection />);
    expect(screen.getByText('Sign in as Teacher')).toBeInTheDocument();
    expect(screen.getByText('Sign in as Student')).toBeInTheDocument();
  });

  it('should redirect to teacher OAuth when teacher card is clicked', () => {
    renderWithRouter(<RoleSelection />);
    const teacherCard = screen.getByText('Teacher').closest('.cursor-pointer');
    fireEvent.click(teacherCard);
    expect(window.location.href).toContain('/auth/google/edu');
  });

  it('should redirect to student OAuth when student card is clicked', () => {
    renderWithRouter(<RoleSelection />);
    const studentCard = screen.getByText('Student').closest('.cursor-pointer');
    fireEvent.click(studentCard);
    expect(window.location.href).toContain('/auth/google/acin');
  });

  it('should display email domain info for each role', () => {
    renderWithRouter(<RoleSelection />);
    expect(screen.getByText('@*.sastra.edu email')).toBeInTheDocument();
    expect(screen.getByText('@sastra.ac.in email')).toBeInTheDocument();
  });

  it('should display secure authentication notice', () => {
    renderWithRouter(<RoleSelection />);
    expect(screen.getByText('Secure Authentication')).toBeInTheDocument();
    expect(screen.getByText(/Google OAuth2/)).toBeInTheDocument();
  });
});
