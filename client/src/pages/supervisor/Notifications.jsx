import { useState, useEffect } from 'react';
import { usePush } from '../../hooks/usePush';
import { SupervisorLayout } from '../../components/Layout';
import api from '../../api/client';

export default function Notifications() {
  const { permission, requestPermission } = usePush();
  const [testStatus, setTestStatus] = useState(null); // null | 'sending' | 'ok' | 'error'
  const [cronStatus, setCronStatus] = useState(null);
  const [subSaved, setSubSaved] = useState(null); // null | true | false

  useEffect(() => {
    // בדיקת מצב cron
    api.get('/cron/status').then(r => setCronStatus(r.data)).catch(() => {});
    // בדיקה אם ה-subscription נשמר בשרת
    api.get('/users/me').then(r => setSubSaved(!!r.data.push_subscription)).catch(() => {});
  }, []);

  async function sendTestPush() {
    setTestStatus('sending');
    try {
      await api.post('/cron/test-push');
      setTestStatus('ok');
    } catch (err) {
      setTestStatus('error:' + (err.response?.data?.error || err.message));
    }
  }

  async function handleEnable() {
    const result = await requestPermission();
    if (result === 'granted') {
      setSubSaved(true);
    }
  }

  const isOk = permission === 'granted' && subSaved;

  return (
    <SupervisorLayout title="התראות">
      <div className="page">

        {/* סטטוס כולל */}
        <div style={{
          padding: '14px 16px', borderRadius: 12, marginBottom: 20,
          background: isOk ? '#d4edda' : '#fff3cd',
          border: `1px solid ${isOk ? '#c3e6cb' : '#ffeaa7'}`,
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <span style={{ fontSize: '1.5rem' }}>{isOk ? '✅' : '⚠️'}</span>
          <div>
            <div style={{ fontWeight: 700, fontSize: '0.95rem', color: isOk ? '#155724' : '#856404' }}>
              {isOk ? 'התראות מוגדרות ופעילות' : 'יש להגדיר התראות'}
            </div>
            <div style={{ fontSize: '0.8rem', color: isOk ? '#155724' : '#856404', marginTop: 2 }}>
              {isOk ? 'תקבל התראה כשמבוקר לא מדווח בזמן' : 'בצע את הצעדים הבאים כדי לקבל התראות'}
            </div>
          </div>
        </div>

        {/* צעד 1 — הרשאת דפדפן */}
        <StepCard
          num="1"
          title="הרשאת התראות בדפדפן"
          done={permission === 'granted'}
          fail={permission === 'denied'}
        >
          {permission === 'granted' && <div className="alert alert-success">הרשאה ניתנה ✓</div>}
          {permission === 'denied' && (
            <div className="alert alert-error">
              חסום — יש להפעיל ידנית: הגדרות הדפדפן ← אתר זה ← התראות ← אפשר
            </div>
          )}
          {permission === 'default' && (
            <button className="btn btn-primary btn-full" onClick={handleEnable}>
              הפעל התראות
            </button>
          )}
        </StepCard>

        {/* צעד 2 — subscription נשמר */}
        <StepCard
          num="2"
          title="רישום בשרת"
          done={subSaved === true}
          fail={subSaved === false && permission === 'granted'}
        >
          {subSaved === true && <div className="alert alert-success">ה-subscription נשמר בשרת ✓</div>}
          {subSaved === false && permission === 'granted' && (
            <>
              <div className="alert alert-error" style={{ marginBottom: 8 }}>הרישום לא הושלם</div>
              <button className="btn btn-primary btn-full" onClick={handleEnable}>הרשם מחדש</button>
            </>
          )}
          {(subSaved === null || permission !== 'granted') && (
            <div style={{ color: 'var(--gray-500)', fontSize: '0.85rem' }}>ממתין להרשאה...</div>
          )}
        </StepCard>

        {/* צעד 3 — בדיקת שליחה */}
        <StepCard num="3" title="בדיקת שליחת התראה" done={testStatus === 'ok'}>
          <button
            className="btn btn-secondary btn-full"
            onClick={sendTestPush}
            disabled={testStatus === 'sending' || !isOk}
          >
            {testStatus === 'sending' ? 'שולח...' : '📳 שלח התראת בדיקה'}
          </button>
          {testStatus === 'ok' && (
            <div className="alert alert-success" style={{ marginTop: 8 }}>
              נשלחה! אם לא הגיעה — בדוק שה-PWA מותקן ב-Home Screen (iOS)
            </div>
          )}
          {testStatus?.startsWith('error:') && (
            <div className="alert alert-error" style={{ marginTop: 8 }}>
              שגיאה: {testStatus.slice(6)}
            </div>
          )}
        </StepCard>

        {/* מצב Cron */}
        <div className="card" style={{ marginTop: 8 }}>
          <h2 style={{ fontWeight: 700, marginBottom: 10, fontSize: '0.95rem' }}>מצב הסריקה האוטומטית</h2>
          {cronStatus ? (
            <div style={{ fontSize: '0.85rem', display: 'flex', flexDirection: 'column', gap: 6 }}>
              <Row label="היום בוצעו" value={cronStatus.done_today} color="var(--green)" />
              <Row label="פוספסו" value={cronStatus.missed_today} color="var(--red)" />
              <Row label="ממתינות" value={cronStatus.pending_today} color="var(--gray-600)" />
              <div style={{ marginTop: 6, fontSize: '0.75rem', color: 'var(--gray-400)' }}>
                הסריקה רצה כל דקה דרך cron-job.org
              </div>
            </div>
          ) : (
            <div style={{ color: 'var(--gray-400)', fontSize: '0.85rem' }}>טוען...</div>
          )}
        </div>

        {/* הסבר */}
        <div className="card" style={{ marginTop: 8, fontSize: '0.82rem', color: 'var(--gray-600)', lineHeight: 1.7 }}>
          <strong>איך זה עובד?</strong>
          <ul style={{ paddingRight: 18, marginTop: 6 }}>
            <li>כל דקה: סריקה אוטומטית של כל הפריטים שלא דווחו</li>
            <li>אם עבר זמן ההמתנה שהוגדר בלוח — ישלח Push</li>
            <li>ב-iOS: ה-PWA חייב להיות מותקן ב-Home Screen</li>
            <li>ב-Android: עובד גם בדפדפן Chrome רגיל</li>
          </ul>
        </div>

      </div>
    </SupervisorLayout>
  );
}

function StepCard({ num, title, done, fail, children }) {
  return (
    <div style={{
      border: `1px solid ${done ? '#c3e6cb' : fail ? '#f5c6cb' : 'var(--gray-200)'}`,
      borderRadius: 12, padding: '14px 16px', marginBottom: 10,
      background: done ? '#f0fff4' : fail ? '#fff5f5' : '#fff',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <span style={{
          width: 26, height: 26, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: done ? 'var(--green)' : fail ? 'var(--red)' : 'var(--gray-300)',
          color: '#fff', fontWeight: 700, fontSize: '0.8rem', flexShrink: 0,
        }}>{done ? '✓' : fail ? '✗' : num}</span>
        <span style={{ fontWeight: 700, fontSize: '0.92rem' }}>{title}</span>
      </div>
      {children}
    </div>
  );
}

function Row({ label, value, color }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
      <span>{label}</span>
      <span style={{ fontWeight: 700, color }}>{value ?? '—'}</span>
    </div>
  );
}
