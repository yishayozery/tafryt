// הרץ פעם אחת בפרודקשן כדי ליצור את הטבלאות
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pool } = require('./db');

async function setup() {
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  try {
    await pool.query(sql);
    console.log('✅ Schema נוצר בהצלחה');
  } catch (err) {
    console.error('❌ שגיאה:', err.message);
  } finally {
    await pool.end();
  }
}

setup();
