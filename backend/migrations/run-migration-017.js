// Runs 017_db_hardening.sql against the Supabase database.
// Usage (from backend/ folder):
//   node migrations/run-migration-017.js

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
  ssl: { rejectUnauthorized: false },
});

// Split SQL into individual statements, handling DO $$ blocks correctly
function splitStatements(sql) {
  const statements = [];
  let current = '';
  let inDollarBlock = false;

  for (const line of sql.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith('--') || trimmed === '') {
      current += line + '\n';
      continue;
    }
    current += line + '\n';
    if (trimmed.includes('$$')) {
      inDollarBlock = !inDollarBlock;
    }
    if (!inDollarBlock && trimmed.endsWith(';')) {
      const stmt = current.trim();
      if (stmt && !stmt.startsWith('--')) statements.push(stmt);
      current = '';
    }
  }
  if (current.trim()) statements.push(current.trim());
  return statements.filter(s => s.replace(/--.*$/gm, '').trim());
}

async function runMigration() {
  const client = await pool.connect();
  let passed = 0;
  let failed = 0;

  try {
    console.log('Running migration 017_db_hardening.sql...\n');

    // Step 0: Check for duplicate student_badges and dedup if needed
    const dupCheck = await client.query(`
      SELECT student_id, badge_type, session_id, COUNT(*) as cnt
      FROM student_badges
      GROUP BY student_id, badge_type, session_id
      HAVING COUNT(*) > 1
    `);

    if (dupCheck.rows.length > 0) {
      console.log(`Found ${dupCheck.rows.length} duplicate badge group(s) — deduplicating...`);
      await client.query(`
        DELETE FROM student_badges
        WHERE id NOT IN (
          SELECT MIN(id)
          FROM student_badges
          GROUP BY student_id, badge_type, session_id
        )
      `);
      console.log('✓ Duplicates removed\n');
    } else {
      console.log('✓ No duplicate badges found\n');
    }

    // Step 1: Run each SQL statement independently
    const sql = fs.readFileSync(path.join(__dirname, '017_db_hardening.sql'), 'utf8');
    const statements = splitStatements(sql);

    for (const stmt of statements) {
      // Extract a short label from the statement
      const label = stmt.replace(/\s+/g, ' ').slice(0, 80).trim();
      try {
        await client.query(stmt);
        console.log(`✓ ${label}`);
        passed++;
      } catch (err) {
        console.error(`✗ ${label}`);
        console.error(`  → ${err.message}\n`);
        failed++;
      }
    }

    console.log(`\nDone — ${passed} succeeded, ${failed} failed.`);

    if (failed === 0) {
      console.log('\nNext step — validate constraints off-peak in Supabase SQL editor:');
      console.log('  ALTER TABLE student_points      VALIDATE CONSTRAINT fk_student_points_student;');
      console.log('  ALTER TABLE student_badges      VALIDATE CONSTRAINT fk_student_badges_student;');
      console.log('  ALTER TABLE student_streaks     VALIDATE CONSTRAINT fk_student_streaks_student;');
      console.log('  ALTER TABLE student_xp          VALIDATE CONSTRAINT fk_student_xp_student;');
      console.log('  ALTER TABLE session_streaks     VALIDATE CONSTRAINT fk_session_streaks_student;');
      console.log('  ALTER TABLE session_summaries   VALIDATE CONSTRAINT fk_session_summaries_student;');
      console.log('  ALTER TABLE competition_answers VALIDATE CONSTRAINT fk_competition_answers_poll;');
    }

    process.exit(failed > 0 ? 1 : 0);
  } catch (error) {
    console.error('Unexpected error:', error.message);
    process.exit(1);
  } finally {
    client.release();
  }
}

runMigration();
