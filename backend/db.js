const { Pool } = require('pg');
require('dotenv').config();

// Prefer DATABASE_URL (Supabase PgBouncer pooler, port 6543) when set.
// Falls back to individual DB_* vars for local dev without a pooler.
const usePoolerUrl = !!process.env.DATABASE_URL;

const isSupabase = usePoolerUrl
  ? process.env.DATABASE_URL.includes('supabase.com')
  : (process.env.DB_HOST || '').includes('supabase.com');

const sslConfig = isSupabase
  ? { rejectUnauthorized: false }
  : process.env.NODE_ENV === 'production'
    ? { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false' }
    : false;

const poolConfig = usePoolerUrl
  ? { connectionString: process.env.DATABASE_URL, ssl: sslConfig }
  : {
      user: process.env.DB_USER,
      host: process.env.DB_HOST,
      database: process.env.DB_NAME,
      password: process.env.DB_PASSWORD,
      port: process.env.DB_PORT,
      ssl: sslConfig,
    };

const pool = new Pool({
  ...poolConfig,
  max: parseInt(process.env.DB_POOL_MAX) || 20,  // Safe with PgBouncer in front (transaction mode)
  min: 0,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  process.stderr.write(`Unexpected error on idle DB client: ${err.message}\n`);
});

module.exports = pool;
