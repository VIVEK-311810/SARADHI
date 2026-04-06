const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

async function runMigration() {
  try {
    console.log('Running migration 013: manual grading columns on poll_responses...');

    const sql = fs.readFileSync(
      path.join(__dirname, 'migrations', '013_manual_grading.sql'),
      'utf8'
    );
    await pool.query(sql);
    console.log('✓ Migration 013 completed successfully');

    const check = await pool.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'poll_responses'
        AND column_name IN ('teacher_feedback', 'graded_at', 'graded_by')
    `);
    check.rows.forEach(r => console.log(`  ✓ ${r.column_name} column added to poll_responses`));

    process.exit(0);
  } catch (error) {
    console.error('✗ Migration 013 failed:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigration();
