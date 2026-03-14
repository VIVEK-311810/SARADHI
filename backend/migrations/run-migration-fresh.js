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
    console.log('Starting fresh migration...');

    // Drop existing tables
    console.log('Dropping existing tables...');
    const dropSQL = fs.readFileSync(path.join(__dirname, 'drop_and_recreate.sql'), 'utf8');
    await pool.query(dropSQL);
    console.log('✓ Existing tables dropped');

    // Create new schema
    console.log('Creating new schema...');
    const migrationSQL = fs.readFileSync(path.join(__dirname, '001_transcription_schema.sql'), 'utf8');
    await pool.query(migrationSQL);
    console.log('✓ Migration completed successfully');

    // Verify tables
    const result = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name IN ('transcription_sessions', 'transcripts')
    `);

    console.log('\nCreated tables:');
    result.rows.forEach(row => console.log(`  - ${row.table_name}`));

    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

runMigration();
