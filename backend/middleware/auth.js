const jwt = require('jsonwebtoken');
const pool = require('../db');
const logger = require('../logger');
const { redis } = require('../redis');

if (!process.env.JWT_SECRET) {
  throw new Error('FATAL: JWT_SECRET environment variable is not set');
}

const USER_CACHE_TTL = 300; // 5 minutes

const authenticate = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({ message: 'Access denied. No token provided.' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'], issuer: 'sas-edu-ai', audience: 'sas-edu-ai-client' });

    // Check JWT revocation list (only when Redis is available)
    if (redis && decoded.jti) {
      const isRevoked = await redis.sismember('revoked:tokens', decoded.jti).catch(() => 0);
      if (isRevoked) {
        return res.status(401).json({ message: 'Token has been revoked.' });
      }
    }

    // Try Redis cache before hitting DB
    const cacheKey = `auth:user:${decoded.userId}`;
    let user = null;

    if (redis) {
      const cached = await redis.get(cacheKey).catch(() => null);
      if (cached) {
        user = JSON.parse(cached);
      }
    }

    if (!user) {
      const userResult = await pool.query(
        'SELECT id, email, role, full_name, created_at FROM users WHERE id = $1',
        [decoded.userId]
      );

      if (userResult.rows.length === 0) {
        return res.status(401).json({ message: 'Invalid token. User not found.' });
      }

      user = userResult.rows[0];

      // Cache for 5 minutes (non-blocking — don't fail auth if cache write fails)
      if (redis) {
        redis.setex(cacheKey, USER_CACHE_TTL, JSON.stringify(user)).catch(() => {});
      }
    }

    // Enforce SASTRA domain restrictions — allow @sastra.edu and *.sastra.edu subdomains (faculty)
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
  const isValidTeacher = role === 'teacher' && (email.endsWith('@sastra.edu') || email.endsWith('.sastra.edu'));
  const isValidStudent = role === 'student' && /^\d+@sastra\.ac\.in$/.test(email);

  if (!isValidTeacher && !isValidStudent) {
    return res.status(403).json({
      message: 'Access denied. Only @sastra.edu (teachers) and @sastra.ac.in (students) domains are allowed.'
    });
  }

  next();
};

module.exports = { authenticate, authorize, validateSastraDomain };
