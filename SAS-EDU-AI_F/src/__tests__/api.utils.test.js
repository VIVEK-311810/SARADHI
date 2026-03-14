import { apiRequest, utils } from '../utils/api';

describe('API Utilities', () => {
  describe('apiRequest', () => {
    it('should make a request with correct URL', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: 'test' }),
      });

      const result = await apiRequest('/test-endpoint');

      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:3001/api/test-endpoint',
        expect.any(Object)
      );
      expect(result).toEqual({ data: 'test' });
    });

    it('should include auth token in headers when available', async () => {
      localStorage.setItem('authToken', 'my-test-token');

      global.fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({}),
      });

      await apiRequest('/test');

      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer my-test-token',
          }),
        })
      );
    });

    it('should not include auth header when no token exists', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({}),
      });

      await apiRequest('/test');

      const calledHeaders = global.fetch.mock.calls[0][1].headers;
      expect(calledHeaders.Authorization).toBeUndefined();
    });

    it('should merge custom options', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({}),
      });

      await apiRequest('/test', {
        method: 'POST',
        body: JSON.stringify({ key: 'value' }),
      });

      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ key: 'value' }),
        })
      );
    });

    it('should clear storage and redirect on 401', async () => {
      localStorage.setItem('authToken', 'expired');
      localStorage.setItem('currentUser', '{"id":"1"}');

      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
      });

      await expect(apiRequest('/test')).rejects.toThrow('Authentication required');
      expect(localStorage.removeItem).toHaveBeenCalledWith('authToken');
      expect(localStorage.removeItem).toHaveBeenCalledWith('currentUser');
      expect(window.location.href).toBe('/auth');
    });

    it('should throw on 403', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
      });

      await expect(apiRequest('/test')).rejects.toThrow('Access denied');
    });

    it('should throw on other HTTP errors', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      await expect(apiRequest('/test')).rejects.toThrow('HTTP error! status: 500');
    });

    it('should throw on network failure', async () => {
      global.fetch.mockRejectedValueOnce(new Error('Network error'));

      await expect(apiRequest('/test')).rejects.toThrow('Network error');
    });
  });

  describe('utils.isAuthenticated', () => {
    it('should return true when token and user exist', () => {
      localStorage.setItem('authToken', 'token');
      localStorage.setItem('currentUser', '{"id":"1"}');
      expect(utils.isAuthenticated()).toBe(true);
    });

    it('should return false when token is missing', () => {
      localStorage.setItem('currentUser', '{"id":"1"}');
      expect(utils.isAuthenticated()).toBe(false);
    });

    it('should return false when user is missing', () => {
      localStorage.setItem('authToken', 'token');
      expect(utils.isAuthenticated()).toBe(false);
    });

    it('should return false when both are missing', () => {
      expect(utils.isAuthenticated()).toBe(false);
    });
  });

  describe('utils.getCurrentUser', () => {
    it('should return parsed user object', () => {
      const user = { id: '123', role: 'student' };
      localStorage.setItem('currentUser', JSON.stringify(user));
      expect(utils.getCurrentUser()).toEqual(user);
    });

    it('should return null when no user stored', () => {
      expect(utils.getCurrentUser()).toBeNull();
    });
  });

  describe('utils.validateSastraEmail', () => {
    it('should accept valid teacher email', () => {
      expect(utils.validateSastraEmail('prof@sastra.edu', 'teacher')).toBe(true);
    });

    it('should reject teacher with wrong domain', () => {
      expect(utils.validateSastraEmail('prof@gmail.com', 'teacher')).toBe(false);
    });

    it('should accept valid student email', () => {
      expect(utils.validateSastraEmail('123456@sastra.ac.in', 'student')).toBe(true);
    });

    it('should reject student with non-numeric prefix', () => {
      expect(utils.validateSastraEmail('john@sastra.ac.in', 'student')).toBe(false);
    });

    it('should reject student with wrong domain', () => {
      expect(utils.validateSastraEmail('123456@gmail.com', 'student')).toBe(false);
    });

    it('should return false for unknown role', () => {
      expect(utils.validateSastraEmail('test@sastra.edu', 'admin')).toBe(false);
    });
  });

  describe('utils.formatFileSize', () => {
    it('should format bytes', () => {
      expect(utils.formatFileSize(500)).toBe('500 Bytes');
    });

    it('should format KB', () => {
      expect(utils.formatFileSize(1024)).toBe('1 KB');
    });

    it('should format MB', () => {
      expect(utils.formatFileSize(1048576)).toBe('1 MB');
    });

    it('should return N/A for falsy input', () => {
      expect(utils.formatFileSize(null)).toBe('N/A');
      expect(utils.formatFileSize(undefined)).toBe('N/A');
    });

    it('should return 0 Bytes for 0', () => {
      expect(utils.formatFileSize(0)).toBe('0 Bytes');
    });
  });
});
