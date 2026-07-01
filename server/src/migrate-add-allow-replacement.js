require('dotenv').config();
const { pool } = require('./db');

async function run() {
  const client = await pool.connect();
  try {
    await client.query(`
      ALTER TABLE plans
        ADD COLUMN IF NOT EXISTS allow_replacement BOOLEAN NOT NULL DEFAULT true
    `);
    console.log('✅ עמודה allow_replacement נוספה');
  } catch (e) {
    console.error('❌', e.message);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
