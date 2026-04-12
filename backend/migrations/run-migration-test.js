// Demo migration test — creates a throwaway table, verifies it, then drops it.
// Proves the DB connection and DDL pipeline work before running real migrations.
// Usage (from backend/ folder):
//   node migrations/run-migration-test.js

const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
  ssl: { rejectUnauthorized: false },
});

async function runTest() {
  const client = await pool.connect();
  try {
    console.log('Connected to database:', process.env.DB_NAME, 'at', process.env.DB_HOST);

    // Step 1: Create demo table
    await client.query(`
      CREATE TABLE IF NOT EXISTS _migration_test (
        id   SERIAL PRIMARY KEY,
        note TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✓ Created table _migration_test');

    // Step 2: Insert a row
    await client.query(`INSERT INTO _migration_test (note) VALUES ('migration test ok')`);
    console.log('✓ Inserted test row');

    // Step 3: Read it back
    const result = await client.query(`SELECT * FROM _migration_test`);
    console.log('✓ Read back:', result.rows[0]);

    console.log('\nMigration pipeline works. Safe to run run-migration-017.js');
    console.log('Table _migration_test left in DB — check it in Supabase dashboard, then delete manually.');
    process.exit(0);
  } catch (error) {
    console.error('Test failed:', error.message);
    process.exit(1);
  } finally {
    client.release();
  }
}

runTest();
