const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const crypto = require('crypto');
const pool = require('../db');
console.log('🔥 OAUTH-DYNAMIC ROUTES LOADING...');

// Helper function to generate teacher ID from name
const generateTeacherID = (fullName) => {
  const hash = crypto.createHash('sha256').update(fullName.toLowerCase()).digest('hex');
  return hash.substring(0, 12); // First 12 characters
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
      callbackURL: process.env.GOOGLE_CALLBACK_URL_EDU || "/auth/google/callback/edu"
    };
  } else if (domain === 'sastra.ac.in') {
    return {
      clientID: process.env.GOOGLE_CLIENT_ID_ACIN,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET_ACIN,
      callbackURL: process.env.GOOGLE_CALLBACK_URL_ACIN || "/auth/google/callback/acin"
    };
  }
  throw new Error(`Unsupported domain: ${domain}`);
};

// OAuth strategy handler
const oauthHandler = async (accessToken, refreshToken, profile, done) => {
  try {
    const email = profile.emails[0].value;
    const fullName = profile.displayName;
    let role = null;
    let userId = null;

    // Determine role based on email domain
    if (email.endsWith('@sastra.edu')) {
      role = 'teacher';
      userId = generateTeacherID(fullName);
    } else if (email.endsWith('@sastra.ac.in') && /^\d+@/.test(email)) {
      role = 'student';
      userId = extractStudentID(email);
    } else {
      return done(null, false, { message: 'Access denied. Only SASTRA emails allowed.' });
    }

    if (!userId) {
      return done(null, false, { message: 'Invalid email format for role.' });
    }

    // Check if user already exists
    const existingUser = await pool.query(
      'SELECT * FROM users WHERE email = $1',
      [email]
    );

    if (existingUser.rows.length > 0) {
      // Update existing user's information
      // Update existing user's information
      const updateQuery = `
        UPDATE users 
        SET full_name = $1
        WHERE email = $2 
        RETURNING *
      `;
      const updatedUser = await pool.query(updateQuery, [fullName, email]);

      return done(null, updatedUser.rows[0]);
    } else {
      // Create new user
      // Create new user
      const insertQuery = `
        INSERT INTO users (id, email, full_name, role)
        VALUES ($1, $2, $3, $4)
        RETURNING *
      `;
      const newUser = await pool.query(insertQuery, [
        userId,
        email,
        fullName,
        role
      ]);

      return done(null, newUser.rows[0]);
    }
  } catch (error) {
    console.error('OAuth2 Strategy Error:', error);
    return done(error, null);
  }
};

// Configure Google OAuth2 Strategies for both domains
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
    done(error, null);
  }
});

// Export configuration getter and passport
module.exports = {
  passport,
  getOAuthConfig
};

