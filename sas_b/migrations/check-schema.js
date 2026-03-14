const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

async function checkSchema() {
  try {
    console.log('Checking transcription_sessions schema...\n');

    // Check table structure
    const schemaQuery = `
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'transcription_sessions'
      ORDER BY ordinal_position
    `;
    const schemaResult = await pool.query(schemaQuery);

    console.log('Columns:');
    schemaResult.rows.forEach(row => {
      console.log(`  ${row.column_name}: ${row.data_type} (nullable: ${row.is_nullable})`);
    });

    // Check primary key
    const pkQuery = `
      SELECT a.attname
      FROM pg_index i
      JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
      WHERE i.indrelid = 'transcription_sessions'::regclass AND i.indisprimary
    `;
    const pkResult = await pool.query(pkQuery);

    console.log('\nPrimary Key:');
    pkResult.rows.forEach(row => console.log(`  ${row.attname}`));

    // Check existing sessions
    const sessionsQuery = `SELECT session_id, start_time FROM transcription_sessions ORDER BY start_time DESC LIMIT 5`;
    const sessionsResult = await pool.query(sessionsQuery);

    console.log('\nRecent sessions:');
    if (sessionsResult.rows.length === 0) {
      console.log('  (none)');
    } else {
      sessionsResult.rows.forEach(row => {
        console.log(`  ${row.session_id} - ${row.start_time}`);
      });
    }

    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

checkSchema();
