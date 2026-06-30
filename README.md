# תפריט מבוקר — MVP

## הרצה מקומית

### דרישות
- Node.js 18+
- PostgreSQL 14+

### הגדרת בסיס נתונים
```bash
createdb tafryt
psql tafryt < server/src/schema.sql
```

### הגדרת משתני סביבה
```bash
cd server
cp .env.example .env
# ערוך את .env עם פרטי ה-DB שלך
```

### יצירת VAPID keys (לפוש)
```bash
cd server
npx web-push generate-vapid-keys
# הכנס את הערכים ל-.env
```

### הרצת השרת
```bash
cd server
npm install
npm run dev
```

### הרצת הפרונטאנד
```bash
cd client
npm install
npm run dev
```

### טעינת נתוני דמו
```bash
cd server
npm run seed
```

האפליקציה תרוץ על:
- Frontend: http://localhost:5173
- Backend API: http://localhost:3001

## משתמשי דמו (אחרי seed)

| תפקיד | username | סיסמה |
|--------|----------|--------|
| מנהל מערכת | `platform_admin` | `Admin5678!` |
| מבקרת (אמא) | `demo_super` | `Demo1234!` |
| מבוקר (דני) | `demo_dan` | `Demo1234!` |
