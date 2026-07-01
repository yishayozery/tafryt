import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api/client';
import { useAuth } from '../../hooks/useAuth';
import { SupervisorLayout, StatusBadge } from '../../components/Layout';

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pushMsg, setPushMsg] = useState('');

  useEffect(() => {
    api.get('/plans').then(r => { setPlans(r.data); setLoading(false); });
  }, []);

  async function testPush() {
    try {
      await api.post('/cron/test-push');
      setPushMsg('✓ התראה נשלחה — בדוק את הדפדפן');
    } catch (err) {
      setPushMsg('✗ ' + (err.response?.data?.error || 'שגיאה בשליחה'));
    }
    setTimeout(() => setPushMsg(''), 4000);
  }

  const today = new Date().toISOString().slice(0, 10);

  return (
    <SupervisorLayout title="לוחות בקרה">
      <div className="page">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h1 className="page-title" style={{ marginBottom: 0 }}>שלום, {user?.display_name} 👋</h1>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-ghost btn-sm" onClick={testPush} title="בדוק שהתראות עובדות">
              🔔
            </button>
            <button className="btn btn-primary btn-sm" onClick={() => navigate('/supervisor/plans/new')}>
              + לוח חדש
            </button>
          </div>
        </div>
        {pushMsg && (
          <div className={`alert ${pushMsg.startsWith('✓') ? 'alert-success' : 'alert-error'}`} style={{ marginBottom: 12 }}>
            {pushMsg}
          </div>
        )}

        {loading && <div className="spinner" />}

        {!loading && plans.length === 0 && (
          <div className="empty-state">
            <p style={{ fontSize: '2rem', marginBottom: 8 }}>📋</p>
            <p>אין לוחות בקרה עדיין</p>
            <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => navigate('/supervisor/plans/new')}>
              צור לוח ראשון
            </button>
          </div>
        )}

        {plans.map(plan => (
          <div key={plan.id} className="card" style={{ marginBottom: 12, cursor: 'pointer' }}
            onClick={() => navigate(`/supervisor/plans/${plan.id}`)}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: '1.05rem' }}>{plan.name}</div>
                <div style={{ color: 'var(--gray-600)', fontSize: '0.85rem', marginTop: 4 }}>
                  {plan.monitored_name} • {formatDate(plan.start_date)} – {formatDate(plan.end_date)}
                </div>
              </div>
              <span style={{ color: 'var(--gray-400)', fontSize: '1.2rem' }}>←</span>
            </div>
            <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
              <button className="btn btn-secondary btn-sm"
                onClick={e => { e.stopPropagation(); navigate(`/supervisor/plans/${plan.id}/daily?date=${today}`); }}>
                לוז יומי
              </button>
              <button className="btn btn-ghost btn-sm"
                onClick={e => { e.stopPropagation(); navigate(`/supervisor/plans/${plan.id}/history`); }}>
                היסטוריה
              </button>
            </div>
          </div>
        ))}
      </div>
    </SupervisorLayout>
  );
}

function formatDate(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric', year: '2-digit' });
}
