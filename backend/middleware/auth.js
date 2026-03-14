const jwt = require('jsonwebtoken');
const pool = require('../db');
const logger = require('../logger');

if (!process.env.JWT_SECRET) {
  throw new Error('FATAL: JWT_SECRET environment variable is not set');
}

const authenticate = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({ message: 'Access denied. No token provided.' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });

    const userResult = await pool.query('SELECT * FROM users WHERE id = $1', [decoded.userId]);

    if (userResult.rows.length === 0) {
      return res.status(401).json({ message: 'Invalid token. User not found.' });
    }

    const user = userResult.rows[0];

    // Enforce SASTRA domain restrictions (only exact @sastra.edu for teachers)
    const isValidTeacher = user.role === 'teacher' && (user.email.endsWith('@sastra.edu') || user.email.endsWith('.sastra.edu'));
    const isValidStudent = user.role === 'student' && /^\d+@sastra\.ac\.in$/.test(user.email);

    if (!isValidTeacher && !isValidStudent) {
      return res.status(403).json({ message: 'Access denied. Invalid domain for user role.' });
    }

    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ message: 'Invalid token format.' });
    } else if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Token expired. Please log in again.' });
    }
    logger.error('Authentication error', { error: error.message });
    res.status(401).json({ message: 'Authentication failed.' });
  }
};

const authorize = (role) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required.' });
    }
    if (req.user.role !== role) {
      return res.status(403).json({ message: `Access denied. ${role} role required.` });
    }
    next();
  };
};

const validateSastraDomain = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Authentication required.' });
  }

  const { email, role } = req.user;
  const isValidTeacher = role === 'teacher' && email.endsWith('@sastra.edu');
  const isValidStudent = role === 'student' && /^\d+@sastra\.ac\.in$/.test(email);

  if (!isValidTeacher && !isValidStudent) {
    return res.status(403).json({
      message: 'Access denied. Only @sastra.edu (teachers) and @sastra.ac.in (students) domains are allowed.'
    });
  }

  next();
};

module.exports = { authenticate, authorize, validateSastraDomain };
