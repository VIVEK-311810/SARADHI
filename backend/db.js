const { Pool } = require('pg');
require('dotenv').config();

// Supabase connection pooler (port 6543) requires SSL with rejectUnauthorized: false.
// The host check ensures local dev without SSL still works.
const isSupabase = (process.env.DB_HOST || '').includes('supabase.com');
const sslConfig = isSupabase
  ? { rejectUnauthorized: false }
  : process.env.NODE_ENV === 'production'
    ? { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false' }
    : false;

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
  max: parseInt(process.env.DB_POOL_MAX) || 5,   // Low: Supabase free-tier pooler saturates fast
  min: 0,                                          // Never hold idle connections — Supabase kills them
  idleTimeoutMillis: 10000,                        // Release idle connections in 10s before Supabase cuts them
  connectionTimeoutMillis: 20000,                  // Give Supabase pooler time on cold start
  ssl: sslConfig
});

pool.on('error', (err) => {
  process.stderr.write(`Unexpected error on idle DB client: ${err.message}\n`);
});

module.exports = pool;
