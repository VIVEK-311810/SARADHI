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
    console.log('Running migration 011: Rich Question Types...');

    const sql = fs.readFileSync(
      path.join(__dirname, 'migrations', '011_rich_question_types.sql'),
      'utf8'
    );
    await pool.query(sql);
    console.log('✓ Migration 011 completed successfully');

    // Verify new columns exist
    const check = await pool.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'polls'
        AND column_name IN ('question_type','question_latex','options_metadata','solution_steps','subject_tag','marks')
      ORDER BY column_name
    `);
    console.log('\nNew columns on polls table:');
    check.rows.forEach(r => console.log(`  ✓ ${r.column_name}`));

    const clusterCheck = await pool.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'poll_clusters'
    `);
    if (clusterCheck.rows.length > 0) {
      console.log('  ✓ poll_clusters table created');
    }

    process.exit(0);
  } catch (error) {
    console.error('✗ Migration 011 failed:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigration();
