require('dotenv').config();
const fs = require('fs');
const path = require('path');
const pool = require('./db');

async function run() {
  const sql = fs.readFileSync(
    path.join(__dirname, 'migrations', '014_confidence_rating.sql'),
    'utf8'
  );
  console.log('Running migration 014…');
  await pool.query(sql);
  console.log('Migration 014 complete.');
  await pool.end();
}

run().catch(err => { console.error(err); process.exit(1); });
