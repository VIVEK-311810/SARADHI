const { default: rateLimit, ipKeyGenerator } = require('express-rate-limit');

// General API rate limiter — 300 requests per 15 minutes per IP
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' }
});

// Strict limiter for AI endpoints — HuggingFace calls are expensive
const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'AI query limit reached. Please wait a minute before sending another query.' }
});

// Per-student AI rate limiter — keyed by user ID (not IP) to handle university NAT
const aiStudentLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id || ipKeyGenerator(req),
  message: { error: 'Please wait before sending another query.' }
});

// Auth limiter — prevent brute force on login endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many authentication attempts, please try again later.' }
});

module.exports = { apiLimiter, aiLimiter, aiStudentLimiter, authLimiter };
