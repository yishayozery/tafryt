require('dotenv').config();
const { pool } = require('./db');

async function migrate() {
  await pool.query(`
    ALTER TABLE plans
      ADD COLUMN IF NOT EXISTS relationship_type TEXT NOT NULL DEFAULT 'family',
      ADD COLUMN IF NOT EXISTS supervisor_label TEXT NOT NULL DEFAULT 'הורה',
      ADD COLUMN IF NOT EXISTS monitored_label TEXT NOT NULL DEFAULT 'ילד'
  `);
  console.log('Migration OK');
  await pool.end();
}

migrate().catch(e => { console.error(e.message); process.exit(1); });
