-- תפריט מבוקר — סכימת בסיס נתונים

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name TEXT NOT NULL,          -- שם פרטי / כינוי בלבד
  username TEXT UNIQUE NOT NULL,       -- שם משתמש לכניסה
  password_hash TEXT NOT NULL,
  phone TEXT,
  push_subscription JSONB,             -- Web Push subscription
  is_admin BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- קישור מבקר ↔ מבוקר (רבים לרבים)
CREATE TABLE IF NOT EXISTS supervision_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supervisor_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  monitored_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active',  -- active | revoked
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(supervisor_id, monitored_id)
);

-- טוקן הזמנה חד-פעמי
CREATE TABLE IF NOT EXISTS invite_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  supervisor_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  monitored_phone TEXT NOT NULL,
  monitored_display_name TEXT NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- טוקן איפוס סיסמה
CREATE TABLE IF NOT EXISTS reset_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- לוח בקרה (תפריט)
CREATE TABLE IF NOT EXISTS plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supervisor_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  monitored_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'meal',    -- meal | medication | water | custom
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  visibility_mode TEXT NOT NULL DEFAULT 'daily',  -- daily | weekly | on_time
  photo_required BOOLEAN NOT NULL DEFAULT FALSE,
  alert_threshold_minutes INTEGER NOT NULL DEFAULT 30,
  notify_on_completion BOOLEAN NOT NULL DEFAULT FALSE,  -- אופציונלי למבקר
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- שורת תפריט (תבנית)
CREATE TABLE IF NOT EXISTS plan_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  -- שבועי: day_of_week = 0 (ראשון) עד 6 (שבת), specific_date = NULL
  -- ספציפי: specific_date = תאריך, day_of_week = NULL
  day_of_week INTEGER,                  -- 0=ראשון ... 6=שבת
  specific_date DATE,                   -- תאריך בודד
  scheduled_time TIME NOT NULL,
  item_name TEXT NOT NULL,
  quantity TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CHECK (
    (day_of_week IS NOT NULL AND specific_date IS NULL) OR
    (day_of_week IS NULL AND specific_date IS NOT NULL)
  )
);

-- ביצוע יומי (מופע)
CREATE TABLE IF NOT EXISTS completions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_item_id UUID NOT NULL REFERENCES plan_items(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',  -- pending | done | replaced | missed
  replaced_with TEXT,
  photo_url TEXT,
  completed_at TIMESTAMPTZ,
  UNIQUE(plan_item_id, date)
);

-- התראות שנשלחו
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,   -- meal_reminder | missed_alert | completion_notify
  related_completion_id UUID REFERENCES completions(id),
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  channel TEXT NOT NULL DEFAULT 'push'
);

-- אינדקסים לביצועים
CREATE INDEX IF NOT EXISTS idx_plan_items_plan_id ON plan_items(plan_id);
CREATE INDEX IF NOT EXISTS idx_completions_plan_item_date ON completions(plan_item_id, date);
CREATE INDEX IF NOT EXISTS idx_plans_monitored ON plans(monitored_id);
CREATE INDEX IF NOT EXISTS idx_plans_supervisor ON plans(supervisor_id);
CREATE INDEX IF NOT EXISTS idx_supervision_links_supervisor ON supervision_links(supervisor_id);
CREATE INDEX IF NOT EXISTS idx_supervision_links_monitored ON supervision_links(monitored_id);
