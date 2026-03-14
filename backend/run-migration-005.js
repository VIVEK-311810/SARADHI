require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

async function runMigration() {
  const client = await pool.connect();
  try {
    const sql = fs.readFileSync(
      path.join(__dirname, 'migrations', '005_production_hardening.sql'),
      'utf8'
    );
    console.log('Running migration 005: Production hardening...');
    await client.query(sql);
    console.log('Migration 005 completed successfully.');
    console.log('  - Added polls.ends_at column');
    console.log('  - Created idx_polls_active_ends index');
    console.log('  - Created idx_poll_responses_student index');
    console.log('  - Created idx_sessions_teacher index');
    console.log('  - Created idx_student_points_student index');
    console.log('  - Created idx_resources_session_id index');
    console.log('  - Created idx_poll_responses_poll_id index');
    console.log('  - Created idx_session_participants_student index');
  } catch (error) {
    console.error('Migration 005 failed:', error.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration();
