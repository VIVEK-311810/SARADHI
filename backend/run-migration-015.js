require('dotenv').config();
const fs = require('fs');
const path = require('path');
const pool = require('./db');

async function run() {
  const sql = fs.readFileSync(
    path.join(__dirname, 'migrations', '015_session_lock_proctoring_summary.sql'),
    'utf8'
  );
  console.log('Running migration 015…');
  await pool.query(sql);
  console.log('Migration 015 complete.');
  await pool.end();
}

run().catch(err => { console.error(err); process.exit(1); });
