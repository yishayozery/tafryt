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
const { startMissedItemsJob, startReminderJob } = require('./jobs/missedItems');

const app = express();
const IS_PROD = process.env.NODE_ENV === 'production';

app.use(cors({ origin: process.env.CLIENT_URL || '*' }));
app.use(express.json());

// תיקיית uploads — ודא שקיימת
const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
app.use('/uploads', express.static(uploadsDir));

// API routes
app.use('/api/auth', authRouter);
app.use('/api/users', usersRouter);
app.use('/api/plans', plansRouter);
app.use('/api/plans/:planId/items', planItemsRouter);
app.use('/api/plans/:planId/completions', completionsRouter);
app.use('/api/plans/:planId/stats', statsRouter);
app.use('/api/admin', adminRouter);

app.get('/api/vapid-public-key', (req, res) => {
  res.json({ key: process.env.VAPID_PUBLIC_KEY });
});

app.get('/api/health', (req, res) => res.json({ ok: true }));

// בפרודקשן — שרת את הפרונטאנד הבנוי
if (IS_PROD) {
  const clientDist = path.join(__dirname, '../../client/dist');
  app.use(express.static(clientDist));
  app.get('*', (req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

startMissedItemsJob();
startReminderJob();

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
