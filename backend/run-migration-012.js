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
    console.log('Running migration 012: content_type on resource_chunks...');

    const sql = fs.readFileSync(
      path.join(__dirname, 'migrations', '012_content_type_chunks.sql'),
      'utf8'
    );
    await pool.query(sql);
    console.log('✓ Migration 012 completed successfully');

    const check = await pool.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'resource_chunks'
        AND column_name = 'content_type'
    `);
    if (check.rows.length > 0) {
      console.log('  ✓ content_type column added to resource_chunks');
    }

    process.exit(0);
  } catch (error) {
    console.error('✗ Migration 012 failed:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigration();
