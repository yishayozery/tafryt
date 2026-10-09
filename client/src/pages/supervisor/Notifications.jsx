import { useState, useEffect } from 'react';
import { usePush } from '../../hooks/usePush';
import { SupervisorLayout } from '../../components/Layout';
import api from '../../api/client';

export default function Notifications() {
  const { permission, requestPermission } = usePush();
  const [testStatus, setTestStatus] = useState(null);
  const [cronStatus, setCronStatus] = useState(null);
  const [subSaved, setSubSaved] = useState(null);
  const [tgLinked, setTgLinked] = useState(null);
  const [tgCode, setTgCode] = useState(null);
  const [tgBotUrl, setTgBotUrl] = useState(null);
  const [tgCopied, setTgCopied] = useState(false);

  useEffect(() => {
    api.get('/cron/status').then(r => setCronStatus(r.data)).catch(() => {});
    api.get('/users/me').then(r => setSubSaved(!!r.data.push_subscription)).catch(() => {});
    api.get('/telegram/status').then(r => setTgLinked(r.data.linked)).catch(() => {});
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
    if (result === 'granted') setSubSaved(true);
  }

  async function handleTgLink() {
    try {
      const { data } = await api.post('/telegram/link');
      setTgCode(data.code);
      setTgBotUrl(data.bot_url);
    } catch (err) {
      alert('שגיאה ביצירת קוד: ' + (err.response?.data?.error || err.message));
    }
  }

  async function handleTgUnlink() {
    await api.delete('/telegram/link');
    setTgLinked(false);
    setTgCode(null);
  }

  async function copyCode() {
    if (tgCode) {
      await navigator.clipboard.writeText(tgCode);
      setTgCopied(true);
      setTimeout(() => setTgCopied(false), 2000);
    }
  }

  const pushOk = permission === 'granted' && subSaved;

  return (
    <SupervisorLayout title="התראות">
      <div className="page">

        {/* ── טלגרם (ראשי) ── */}
        <div style={{ marginBottom: 8 }}>
          <div style={{
            padding: '14px 16px', borderRadius: 12, marginBottom: 10,
            background: tgLinked ? '#d4edda' : '#e8f4fd',
            border: `1px solid ${tgLinked ? '#c3e6cb' : '#bee5fd'}`,
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <span style={{ fontSize: '1.5rem' }}>{tgLinked ? '✅' : '📱'}</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: '0.95rem', color: tgLinked ? '#155724' : '#0c5460' }}>
                {tgLinked ? 'טלגרם מחובר ✓' : 'חבר טלגרם — מומלץ!'}
              </div>
              <div style={{ fontSize: '0.8rem', color: tgLinked ? '#155724' : '#0c5460', marginTop: 2 }}>
                {tgLinked
                  ? 'תקבל התראות בטלגרם — עובד על כל מכשיר'
                  : 'עובד על iOS ואנדרואיד ללא התקנה מיוחדת'}
              </div>
            </div>
          </div>

          {tgLinked ? (
            <button className="btn btn-secondary btn-full btn-sm" onClick={handleTgUnlink}>
              נתק טלגרם
            </button>
          ) : tgCode ? (
            <div className="card" style={{ marginTop: 6 }}>
              <div style={{ fontWeight: 700, marginBottom: 8, fontSize: '0.9rem' }}>קוד חיבור (תקף 10 דקות)</div>
              <div style={{
                fontSize: '2rem', letterSpacing: 6, fontWeight: 800,
                textAlign: 'center', color: 'var(--green)', padding: '10px 0',
              }}>
                {tgCode}
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <a href={tgBotUrl} target="_blank" rel="noreferrer"
                  className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }}>
                  פתח בוט
                </a>
                <button className="btn btn-secondary" style={{ flex: 1 }} onClick={copyCode}>
                  {tgCopied ? '✓ הועתק' : 'העתק קוד'}
                </button>
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--gray-500)', marginTop: 10, lineHeight: 1.6 }}>
                1. לחץ "פתח בוט" ← שלח /start<br />
                2. שלח את הקוד {tgCode} לבוט<br />
                3. קבל אישור חיבור
              </div>
            </div>
          ) : (
            <button className="btn btn-primary btn-full" onClick={handleTgLink}>
              📱 חבר טלגרם
            </button>
          )}
        </div>

        <hr className="divider" />

        {/* ── Push Notifications ── */}
        <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--gray-600)', marginBottom: 8 }}>
          התראות Push (iOS Home Screen)
        </div>

        <StepCard num="1" title="הרשאת התראות בדפדפן" done={permission === 'granted'} fail={permission === 'denied'}>
          {permission === 'granted' && <div className="alert alert-success">הרשאה ניתנה ✓</div>}
          {permission === 'denied' && (
            <div className="alert alert-error">
              חסום — הגדרות הדפדפן ← אתר זה ← התראות ← אפשר
            </div>
          )}
          {permission === 'default' && (
            <button className="btn btn-primary btn-full" onClick={handleEnable}>הפעל התראות</button>
          )}
        </StepCard>

        <StepCard num="2" title="רישום בשרת" done={subSaved === true} fail={subSaved === false && permission === 'granted'}>
          {subSaved === true && <div className="alert alert-success">נרשם בשרת ✓</div>}
          {subSaved === false && permission === 'granted' && (
            <><div className="alert alert-error" style={{ marginBottom: 8 }}>הרישום לא הושלם</div>
              <button className="btn btn-primary btn-full" onClick={handleEnable}>הרשם מחדש</button></>
          )}
          {(subSaved === null || permission !== 'granted') && (
            <div style={{ color: 'var(--gray-500)', fontSize: '0.85rem' }}>ממתין להרשאה...</div>
          )}
        </StepCard>

        <StepCard num="3" title="בדיקת שליחה" done={testStatus === 'ok'}>
          <button className="btn btn-secondary btn-full" onClick={sendTestPush}
            disabled={testStatus === 'sending' || !pushOk}>
            {testStatus === 'sending' ? 'שולח...' : '📳 שלח התראת בדיקה'}
          </button>
          {testStatus === 'ok' && (
            <div className="alert alert-success" style={{ marginTop: 8 }}>
              נשלחה! אם לא הגיעה — ודא שה-PWA מותקן ב-Home Screen (iOS)
            </div>
          )}
          {testStatus?.startsWith('error:') && (
            <div className="alert alert-error" style={{ marginTop: 8 }}>שגיאה: {testStatus.slice(6)}</div>
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
                סריקה כל דקה דרך cron-job.org
              </div>
            </div>
          ) : (
            <div style={{ color: 'var(--gray-400)', fontSize: '0.85rem' }}>טוען...</div>
          )}
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
