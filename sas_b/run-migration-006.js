require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function runMigration() {
  const sql = fs.readFileSync(
    path.join(__dirname, 'migrations', '006_performance_indexes.sql'),
    'utf8'
  );

  const client = await pool.connect();
  try {
    console.log('Running migration 006: Performance indexes...');
    await client.query(sql);
    console.log('✅ Migration 006 completed successfully');
  } catch (err) {
    console.error('❌ Migration 006 failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration();
