require('dotenv').config();
const { pool } = require('./db');

async function migrate() {
  await pool.query(`
    ALTER TABLE users
      ADD COLUMN IF NOT EXISTS is_pending BOOLEAN NOT NULL DEFAULT FALSE
  `);
  await pool.query(`
    ALTER TABLE invite_tokens
      ADD COLUMN IF NOT EXISTS monitored_user_id UUID REFERENCES users(id) ON DELETE SET NULL
  `);
  // username יכול להיות זמני לממתינים — מסיר את ה-UNIQUE אם צריך
  console.log('Migration OK');
  await pool.end();
}

migrate().catch(e => { console.error(e.message); process.exit(1); });
