const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function runMigration() {
  const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
  });

  try {
    console.log('🔌 Connecting to database...');
    const client = await pool.connect();
    console.log('✅ Connected to PostgreSQL database');

    const migrationPath = path.join(__dirname, 'migrations', '007_attendance_community.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

    console.log('📝 Running migration: 007_attendance_community.sql');

    await client.query(migrationSQL);

    console.log('✅ Migration 007 completed successfully!');
    console.log('');
    console.log('📊 Changes applied:');
    console.log('  - sessions.is_live column added (live class control)');
    console.log('  - session_participants.attendance_status column added');
    console.log('  - session_participants.attendance_marked_at column added');
    console.log('  - session_attendance_windows table created');
    console.log('  - community_tickets table created');
    console.log('  - community_replies table created');
    console.log('  - community_upvotes table created');
    console.log('  - Performance indexes added');

    client.release();
  } catch (error) {
    console.error('❌ Migration 007 failed:', error.message);
    console.error('');
    console.error('Full error:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigration();
