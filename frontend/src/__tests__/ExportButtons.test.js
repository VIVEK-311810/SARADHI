import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ExportButtons from '../components/teacher/ExportButtons';

// Mock URL.createObjectURL and revokeObjectURL
global.URL.createObjectURL = jest.fn(() => 'blob:http://localhost/mock-blob');
global.URL.revokeObjectURL = jest.fn();

describe('ExportButtons', () => {
  beforeEach(() => {
    localStorage.setItem('authToken', 'test-token');
  });

  describe('type="poll"', () => {
    it('should render a CSV button', () => {
      render(<ExportButtons type="poll" pollId={1} />);
      expect(screen.getByText('CSV')).toBeInTheDocument();
    });

    it('should call export API when clicked', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        blob: async () => new Blob(['csv,data'], { type: 'text/csv' }),
      });

      render(<ExportButtons type="poll" pollId={42} />);
      fireEvent.click(screen.getByText('CSV'));

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          expect.stringContaining('/export/poll/42/csv'),
          expect.objectContaining({
            headers: expect.objectContaining({
              Authorization: 'Bearer test-token',
            }),
          })
        );
      });
    });

    it('should alert on export failure', async () => {
      global.fetch.mockResolvedValueOnce({ ok: false });

      render(<ExportButtons type="poll" pollId={1} />);
      fireEvent.click(screen.getByText('CSV'));

      await waitFor(() => {
        expect(window.alert).toHaveBeenCalledWith('Failed to export. Please try again.');
      });
    });
  });

  describe('type="session"', () => {
    it('should render CSV and PDF buttons', () => {
      render(<ExportButtons type="session" sessionId="ABC123" />);
      // The buttons contain "CSV" and "PDF" text
      expect(screen.getByText(/CSV/)).toBeInTheDocument();
      expect(screen.getByText(/PDF/)).toBeInTheDocument();
    });

    it('should call session CSV export', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        blob: async () => new Blob(['data'], { type: 'text/csv' }),
      });

      render(<ExportButtons type="session" sessionId="ABC123" />);
      const csvButton = screen.getByTitle('Export all responses to CSV');
      fireEvent.click(csvButton);

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          expect.stringContaining('/export/session/ABC123/all-responses/csv'),
          expect.any(Object)
        );
      });
    });

    it('should call session PDF export', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        blob: async () => new Blob(['pdf'], { type: 'application/pdf' }),
      });

      render(<ExportButtons type="session" sessionId="ABC123" />);
      const pdfButton = screen.getByTitle('Export session report as PDF');
      fireEvent.click(pdfButton);

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          expect.stringContaining('/export/session/ABC123/report/pdf'),
          expect.any(Object)
        );
      });
    });
  });

  describe('type="student"', () => {
    it('should render an Export button', () => {
      render(<ExportButtons type="student" studentId="stu-1" />);
      expect(screen.getByText('Export')).toBeInTheDocument();
    });

    it('should call student performance export', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        blob: async () => new Blob(['data'], { type: 'text/csv' }),
      });

      render(<ExportButtons type="student" studentId="stu-1" />);
      fireEvent.click(screen.getByText('Export'));

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          expect.stringContaining('/export/student/stu-1/performance/csv'),
          expect.any(Object)
        );
      });
    });
  });

  it('should return null for unknown type', () => {
    const { container } = render(<ExportButtons type="unknown" />);
    expect(container.firstChild).toBeNull();
  });
});
