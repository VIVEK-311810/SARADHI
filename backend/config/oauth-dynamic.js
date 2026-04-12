const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const crypto = require('crypto');
require('dotenv').config();
const pool = require('../db');

// Use a dedicated secret for OAuth state so a compromise of JWT_SECRET
// does not also break CSRF protection on the OAuth flow.
const STATE_SECRET = process.env.OAUTH_STATE_SECRET || process.env.SESSION_SECRET || process.env.JWT_SECRET;
if (!process.env.OAUTH_STATE_SECRET) {
  const logger = require('../logger');
  logger.warn('OAUTH_STATE_SECRET not set — falling back to SESSION_SECRET/JWT_SECRET. Set a dedicated OAUTH_STATE_SECRET in .env for defence-in-depth.');
}
const STATE_TTL_MS  = 10 * 60 * 1000; // 10 minutes — enough for any OAuth round-trip

/**
 * Generate a self-verifying, time-limited OAuth state token.
 * Format: <hex-nonce>.<timestamp-ms>.<hmac-sha256>
 * No session or cookie required — the token proves its own authenticity.
 */
function generateOAuthState() {
  const nonce     = crypto.randomBytes(16).toString('hex');
  const timestamp = Date.now().toString();
  const payload   = `${nonce}.${timestamp}`;
  const sig       = crypto.createHmac('sha256', STATE_SECRET).update(payload).digest('hex');
  return `${payload}.${sig}`;
}

/**
 * Verify a state token returned by Google.
 * Returns true only when signature is valid AND token is within TTL.
 */
function verifyOAuthState(state) {
  if (!state || typeof state !== 'string') return false;
  const parts = state.split('.');
  if (parts.length !== 3) return false;
  const [nonce, timestamp, sig] = parts;
  // Verify HMAC
  const payload     = `${nonce}.${timestamp}`;
  const expected    = crypto.createHmac('sha256', STATE_SECRET).update(payload).digest('hex');
  const sigBuf      = Buffer.from(sig,      'hex');
  const expectedBuf = Buffer.from(expected, 'hex');
  if (sigBuf.length !== expectedBuf.length) return false;
  if (!crypto.timingSafeEqual(sigBuf, expectedBuf)) return false;
  // Verify TTL
  const age = Date.now() - parseInt(timestamp, 10);
  if (age < 0 || age > STATE_TTL_MS) return false;
  return true;
}

const logger = require('../logger');

logger.info('OAuth-dynamic config loading', {
  eduClientId: process.env.GOOGLE_CLIENT_ID_EDU ? 'configured' : 'MISSING',
  acinClientId: process.env.GOOGLE_CLIENT_ID_ACIN ? 'configured' : 'MISSING'
});

// Helper function to generate a collision-free teacher ID from Google sub + email
// Uses SHA-256 of sub (globally unique Google ID) — NOT just the display name
const generateTeacherID = (googleSub, email) => {
  // Use Google's unique subject identifier — guaranteed globally unique per account
  const hash = crypto.createHash('sha256')
    .update(`${googleSub}:${email.toLowerCase()}`)
    .digest('hex');
  return hash.substring(0, 24); // 24 hex chars = 96 bits — collision-resistant at enterprise scale
};

// Helper function to extract student ID from email
const extractStudentID = (email) => {
  const match = email.match(/^(\d+)@sastra\.ac\.in$/);
  return match ? match[1] : null;
};

// Dynamic OAuth configuration based on domain
const getOAuthConfig = (domain) => {
  if (domain === 'sastra.edu') {
    return {
      clientID: process.env.GOOGLE_CLIENT_ID_EDU,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET_EDU,
      callbackURL: process.env.GOOGLE_CALLBACK_URL_EDU
    };
  } else if (domain === 'sastra.ac.in') {
    return {
      clientID: process.env.GOOGLE_CLIENT_ID_ACIN,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET_ACIN,
      callbackURL: process.env.GOOGLE_CALLBACK_URL_ACIN
    };
  }
  throw new Error(`Unsupported domain: ${domain}`);
};

// OAuth strategy handler
const oauthHandler = async (accessToken, refreshToken, profile, done) => {
  try {
    const email = profile.emails?.[0]?.value;
    const fullName = profile.displayName;
    const googleSub = profile.id; // Google's globally unique subject identifier

    if (!email || !googleSub) {
      logger.warn('OAuth: missing email or sub in profile');
      return done(null, false, { message: 'Could not retrieve email from Google account.' });
    }

    let role = null;
    let userId = null;

    // Determine role based on email domain
    if (email.endsWith('.sastra.edu') || email.endsWith('@sastra.edu')) {
      role = 'teacher';
      // Use Google sub + email for collision-free ID generation
      userId = generateTeacherID(googleSub, email);
    } else if (email.endsWith('@sastra.ac.in') && /^\d+@/.test(email)) {
      role = 'student';
      userId = extractStudentID(email);
    } else {
      logger.warn('OAuth: access denied for non-SASTRA email domain');
      return done(null, false, { message: 'Access denied. Only SASTRA emails allowed.' });
    }

    if (!userId) {
      logger.warn('OAuth: invalid email format for role', { role });
      return done(null, false, { message: 'Invalid email format for role.' });
    }

    // Upsert user — handles both new and returning users atomically
    const upsertQuery = `
      INSERT INTO users (id, email, full_name, role)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (email) DO UPDATE SET
        full_name = EXCLUDED.full_name,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `;
    const result = await pool.query(upsertQuery, [userId, email, fullName, role]);
    logger.info('OAuth login successful', { role, userId: result.rows[0].id });
    return done(null, result.rows[0]);
  } catch (error) {
    logger.error('OAuth2 Strategy Error', { error: error.message });
    return done(error, null);
  }
};

// Configure Google OAuth2 Strategies for both domains
logger.info('Configuring OAuth strategies');

// Strategy for @sastra.edu domain
const eduConfig = getOAuthConfig('sastra.edu');
passport.use('google-edu', new GoogleStrategy({
  clientID: eduConfig.clientID,
  clientSecret: eduConfig.clientSecret,
  callbackURL: eduConfig.callbackURL
}, oauthHandler));

// Strategy for @sastra.ac.in domain
const acinConfig = getOAuthConfig('sastra.ac.in');
passport.use('google-acin', new GoogleStrategy({
  clientID: acinConfig.clientID,
  clientSecret: acinConfig.clientSecret,
  callbackURL: acinConfig.callbackURL
}, oauthHandler));

// Unified SSO strategy — role auto-detected from email domain
// Uses EDU credentials; requires https://sas-edu-ai-b.onrender.com/auth/google/callback
// to be added to the EDU app's Authorized redirect URIs in Google Cloud Console
passport.use('google-sso', new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID_EDU,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET_EDU,
  callbackURL: process.env.GOOGLE_CALLBACK_URL || 'https://sas-edu-ai-b.onrender.com/auth/google/callback'
}, oauthHandler));

// Serialize user for session
passport.serializeUser((user, done) => {
  done(null, user.id);
});

// Deserialize user from session
passport.deserializeUser(async (id, done) => {
  try {
    const result = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
    done(null, result.rows[0]);
  } catch (error) {
    logger.error('Deserialize error', { error: error.message });
    done(error, null);
  }
});

logger.info('OAuth strategies configured successfully');

// Export configuration getter and passport
module.exports = {
  passport,
  getOAuthConfig,
  generateOAuthState,
  verifyOAuthState
};
