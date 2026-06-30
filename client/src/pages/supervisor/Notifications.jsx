import { usePush } from '../../hooks/usePush';
import { SupervisorLayout } from '../../components/Layout';

export default function Notifications() {
  const { permission, requestPermission } = usePush();

  return (
    <SupervisorLayout title="התראות">
      <div className="page">
        <h1 className="page-title">הגדרות התראות</h1>

        <div className="card">
          <h2 style={{ fontWeight: 700, marginBottom: 12, fontSize: '1rem' }}>התראות Push</h2>
          {permission === 'granted' ? (
            <div className="alert alert-success">התראות מופעלות ✓</div>
          ) : permission === 'denied' ? (
            <div className="alert alert-error">
              התראות חסומות — יש להפעיל ידנית בהגדרות הדפדפן
            </div>
          ) : (
            <>
              <p style={{ color: 'var(--gray-600)', marginBottom: 16, fontSize: '0.9rem' }}>
                הפעל התראות כדי לקבל עדכון כשמבוקר לא מדווח בזמן.
              </p>
              <button className="btn btn-primary btn-full" onClick={requestPermission}>
                הפעל התראות
              </button>
            </>
          )}
        </div>

        <div className="card" style={{ marginTop: 16 }}>
          <h2 style={{ fontWeight: 700, marginBottom: 12, fontSize: '1rem' }}>מה גורם להתראה?</h2>
          <ul style={{ color: 'var(--gray-700)', fontSize: '0.9rem', paddingRight: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <li>משימה לא דווחה לאחר זמן ההמתנה שהוגדר בכל לוח</li>
            <li>ביצוע בזמן אמת — אם הגדרת "התראה על ביצוע" בלוח</li>
          </ul>
        </div>
      </div>
    </SupervisorLayout>
  );
}
