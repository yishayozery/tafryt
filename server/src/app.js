require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const authRouter = require('./routes/auth');
const usersRouter = require('./routes/users');
const plansRouter = require('./routes/plans');
const planItemsRouter = require('./routes/planItems');
const completionsRouter = require('./routes/completions');
const statsRouter = require('./routes/stats');
const adminRouter = require('./routes/admin');
const cronRouter = require('./routes/cron');
const ocrRouter = require('./routes/ocr');

const app = express();
const IS_PROD = process.env.NODE_ENV === 'production';

const allowedOrigins = [
  process.env.CLIENT_URL,
  'http://localhost:5173',
  'http://localhost:3001',
].filter(Boolean);

app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.some(o => origin.startsWith(o))) return cb(null, true);
    cb(null, true); // permissive for now — tighten in prod if needed
  },
}));
app.use(express.json());

// uploads — רק בסביבה לא-serverless
if (!process.env.VERCEL) {
  const uploadsDir = path.join(__dirname, '../uploads');
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
  app.use('/uploads', express.static(uploadsDir));
}

app.use('/api/auth', authRouter);
app.use('/api/users', usersRouter);
app.use('/api/plans', plansRouter);
app.use('/api/plans/:planId/items', planItemsRouter);
app.use('/api/plans/:planId/completions', completionsRouter);
app.use('/api/plans/:planId/stats', statsRouter);
app.use('/api/admin', adminRouter);
app.use('/api/cron', cronRouter);
app.use('/api/ocr', ocrRouter);

app.get('/api/vapid-public-key', (req, res) => {
  res.json({ key: process.env.VAPID_PUBLIC_KEY });
});

app.get('/api/health', (req, res) => res.json({ ok: true }));

// בפרודקשן מחוץ ל-Vercel — שרת את הפרונטאנד הבנוי
if (IS_PROD && !process.env.VERCEL) {
  const clientDist = path.join(__dirname, '../../client/dist');
  app.use(express.static(clientDist));
  app.get('*', (req, res) => res.sendFile(path.join(clientDist, 'index.html')));
}

module.exports = app;
