const express = require('express');
const { passport } = require('../config/oauth');
const jwt = require('jsonwebtoken');
const pool = require('../db');
const logger = require('../logger');

const router = express.Router();


// Helper function to validate SASTRA email domains
const validateSastraEmail = (email, role) => {
  if (role === 'teacher') {
    return email.endsWith('@sastra.edu');
  } else if (role === 'student') {
    return email.endsWith('@sastra.ac.in') && /^\d+@sastra\.ac\.in$/.test(email);
  }
  return false;
};

// Initiate Google OAuth2 authentication for teachers (@sastra.edu)
router.get('/google/edu', passport.authenticate('google-edu', {
  scope: ['profile', 'email']
}));

// Initiate Google OAuth2 authentication for students (@sastra.ac.in)
router.get('/google/acin', passport.authenticate('google-acin', {
  scope: ['profile', 'email']
}));

// Generic Google OAuth2 authentication (determines strategy based on role selection)
router.get('/google/:role?', (req, res, next) => {
  const role = req.params.role;
  
  if (role === 'teacher') {
    // Redirect to teacher-specific OAuth
    return passport.authenticate('google-edu', {
      scope: ['profile', 'email']
    })(req, res, next);
  } else if (role === 'student') {
    // Redirect to student-specific OAuth
    return passport.authenticate('google-acin', {
      scope: ['profile', 'email']
    })(req, res, next);
  } else {
    // Default behavior - redirect to role selection
    return res.redirect('/auth?error=role_required');
  }
});

// OAuth2 callback for teachers (@sastra.edu)
router.get('/google/callback/edu', 
  passport.authenticate('google-edu', { failureRedirect: '/auth?error=oauth_failed' }),
  async (req, res) => {
    try {
      const user = req.user;
      
      // Validate email domain for role
      if (!validateSastraEmail(user.email, user.role)) {
        return res.redirect('/auth?error=invalid_domain');
      }

      // Generate JWT token
      const token = jwt.sign(
        {
          userId: user.id,
          email: user.email,
          role: user.role,
          fullName: user.full_name
        },
        process.env.JWT_SECRET,
        { expiresIn: '24h', algorithm: 'HS256' }
      );

      // Redirect to frontend with token
      res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/auth/callback?token=${token}&user=${encodeURIComponent(JSON.stringify({
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        role: user.role
      }))}`);
    } catch (error) {
      console.error('OAuth callback error (EDU):', error);
      res.redirect('/auth?error=callback_failed');
    }
  }
);

// OAuth2 callback for students (@sastra.ac.in)
router.get('/google/callback/acin', 
  passport.authenticate('google-acin', { failureRedirect: '/auth?error=oauth_failed' }),
  async (req, res) => {
    try {
      const user = req.user;
      
      // Validate email domain for role
      if (!validateSastraEmail(user.email, user.role)) {
        return res.redirect('/auth?error=invalid_domain');
      }

      // Generate JWT token
      const token = jwt.sign(
        {
          userId: user.id,
          email: user.email,
          role: user.role,
          fullName: user.full_name
        },
        process.env.JWT_SECRET,
        { expiresIn: '24h', algorithm: 'HS256' }
      );

      // Redirect to frontend with token
      res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/auth/callback?token=${token}&user=${encodeURIComponent(JSON.stringify({
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        role: user.role
      }))}`);
    } catch (error) {
      console.error('OAuth callback error (ACIN):', error);
      res.redirect('/auth?error=callback_failed');
    }
  }
);

// Verify JWT token
router.post('/verify', async (req, res) => {
  try {
    const { token } = req.body;
    
    if (!token) {
      return res.status(400).json({ error: 'Token is required' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });

    // Get fresh user data from database
    const userResult = await pool.query('SELECT * FROM users WHERE id = $1', [decoded.userId]);
    
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = userResult.rows[0];
    
    res.json({
      valid: true,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        role: user.role,
        createdAt: user.created_at
      }
    });
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Invalid token' });
    } else if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    }
    
    console.error('Token verification error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get current user info
router.get('/me', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authorization header required' });
    }

    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });

    const userResult = await pool.query('SELECT * FROM users WHERE id = $1', [decoded.userId]);

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = userResult.rows[0];

    res.json({
      id: user.id,
      email: user.email,
      fullName: user.full_name,
      role: user.role,
      createdAt: user.created_at
    });
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
    
    console.error('Get user info error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Logout
router.post('/logout', (req, res) => {
  req.logout((err) => {
    if (err) {
      console.error('Logout error:', err);
      return res.status(500).json({ error: 'Logout failed' });
    }
    res.json({ message: 'Logged out successfully' });
  });
});

// Check authentication status
router.get('/status', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.json({ authenticated: false });
    }

    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });

    const userResult = await pool.query('SELECT * FROM users WHERE id = $1', [decoded.userId]);
    
    if (userResult.rows.length === 0) {
      return res.json({ authenticated: false });
    }

    res.json({ 
      authenticated: true,
      user: {
        id: userResult.rows[0].id,
        email: userResult.rows[0].email,
        role: userResult.rows[0].role
      }
    });
  } catch (error) {
    res.json({ authenticated: false });
  }
});

module.exports = router;

