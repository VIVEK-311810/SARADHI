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

    // Read migration file
    const migrationPath = path.join(__dirname, 'migrations', '003_gamification_schema.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

    console.log('📝 Running migration: 003_gamification_schema.sql');

    // Execute migration
    await client.query(migrationSQL);

    console.log('✅ Migration completed successfully!');
    console.log('');
    console.log('📊 Database changes:');
    console.log('  - Created student_points table');
    console.log('  - Created student_badges table');
    console.log('  - Created student_streaks table');
    console.log('  - Created indexes for performance');
    console.log('');
    console.log('🎯 Gamification system is now ready!');

    client.release();
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error('');
    console.error('Full error:', error);
  } finally {
    await pool.end();
  }
}

runMigration();
