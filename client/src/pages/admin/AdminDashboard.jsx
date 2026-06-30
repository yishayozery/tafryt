import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api/client';
import { useAuth } from '../../hooks/useAuth';

export default function AdminDashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [summary, setSummary] = useState(null);
  const [users, setUsers] = useState([]);
  const [plans, setPlans] = useState([]);
  const [tab, setTab] = useState('summary'); // summary | users | plans
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.is_admin) { navigate('/'); return; }
    Promise.all([
      api.get('/admin/summary'),
      api.get('/admin/users'),
      api.get('/admin/plans'),
    ]).then(([s, u, p]) => {
      setSummary(s.data);
      setUsers(u.data);
      setPlans(p.data);
      setLoading(false);
    });
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Navbar */}
      <nav className="navbar" style={{ background: '#1a1a2e' }}>
        <button className="navbar-back" onClick={logout} style={{ fontSize: '0.8rem' }}>יציאה</button>
        <span className="navbar-title">🔧 ניהול פלטפורמה</span>
        <span style={{ width: 64 }} />
      </nav>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        <div className="page">
          {loading && <div className="spinner" />}

          {!loading && summary && (
            <>
              {/* טאבים */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
                {[['summary','סיכום'],['users','משתמשים'],['plans','לוחות']].map(([k,l]) => (
                  <button key={k} className={`btn btn-sm ${tab===k?'btn-primary':'btn-secondary'}`}
                    onClick={() => setTab(k)}>{l}</button>
                ))}
              </div>

              {tab === 'summary' && <SummaryTab summary={summary} />}
              {tab === 'users' && <UsersTab users={users} setUsers={setUsers} />}
              {tab === 'plans' && <PlansTab plans={plans} />}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function SummaryTab({ summary }) {
  const { users, plans, completions, monitored_active } = summary;
  const totalDone = completions.done + completions.replaced;
  const totalAll = totalDone + completions.missed + completions.pending;
  const pct = totalAll > 0 ? Math.round((totalDone / totalAll) * 100) : 0;

  return (
    <>
      <h2 style={{ fontWeight: 700, marginBottom: 16 }}>סיכום פלטפורמה</h2>

      {/* KPI Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
        <KpiBox label="משתמשים" main={users.total} sub={`${users.new_week} חדשים השבוע`} color="var(--green)" />
        <KpiBox label="לוחות פעילים" main={plans.active} sub={`${plans.total} סה"כ`} color="var(--orange)" />
        <KpiBox label="מבוקרים פעילים" main={monitored_active} sub="כרגע בתקופת לוח" color="#6f42c1" />
        <KpiBox label="ביצוע כולל" main={`${pct}%`} sub={`${totalDone}/${totalAll} משימות`} color={pct>=80?'var(--green)':pct>=50?'var(--orange)':'var(--red)'} />
      </div>

      {/* פירוט ביצועים */}
      <div className="card">
        <h3 style={{ fontWeight: 700, marginBottom: 16, fontSize: '1rem' }}>כל הזמנים — ביצועים</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <StatRow label="בוצע" count={completions.done} total={totalAll} color="#28a745" />
          <StatRow label="הוחלף" count={completions.replaced} total={totalAll} color="#17a2b8" />
          <StatRow label="פוספס" count={completions.missed} total={totalAll} color="#dc3545" />
          <StatRow label="ממתין" count={completions.pending} total={totalAll} color="#ffc107" />
        </div>
        <div style={{ marginTop: 12, fontSize: '0.8rem', color: 'var(--gray-600)' }}>
          היום: {completions.today} ביצועים נרשמו
        </div>
      </div>
    </>
  );
}

function UsersTab({ users, setUsers }) {
  async function toggleAdmin(u) {
    await api.patch(`/admin/users/${u.id}/admin`, { is_admin: !u.is_admin });
    setUsers(prev => prev.map(x => x.id === u.id ? { ...x, is_admin: !x.is_admin } : x));
  }

  return (
    <>
      <h2 style={{ fontWeight: 700, marginBottom: 16 }}>משתמשים ({users.length})</h2>
      {users.map(u => (
        <div key={u.id} className="card" style={{ marginBottom: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontWeight: 700 }}>{u.display_name}
                {u.is_admin && <span className="badge" style={{ background: '#e8d5ff', color: '#6f42c1', marginRight: 8 }}>אדמין</span>}
              </div>
              <div style={{ color: 'var(--gray-600)', fontSize: '0.8rem' }}>@{u.username}</div>
            </div>
            <button className="btn btn-ghost btn-sm" style={{ fontSize: '0.75rem', color: u.is_admin ? 'var(--red)' : 'var(--green)' }}
              onClick={() => toggleAdmin(u)}>
              {u.is_admin ? 'הסר אדמין' : 'הפוך אדמין'}
            </button>
          </div>
          <div style={{ marginTop: 8, display: 'flex', gap: 12, fontSize: '0.78rem', color: 'var(--gray-600)' }}>
            <span>מפקח על: {u.supervising}</span>
            <span>מפוקח ע"י: {u.monitored_by}</span>
            <span>לוחות שיצר: {u.plans_created}</span>
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--gray-400)', marginTop: 4 }}>
            נרשם: {new Date(u.created_at).toLocaleDateString('he-IL')}
          </div>
        </div>
      ))}
    </>
  );
}

function PlansTab({ plans }) {
  const active = plans.filter(p => {
    const t = new Date().toISOString().slice(0, 10);
    return p.start_date?.slice(0,10) <= t && p.end_date?.slice(0,10) >= t;
  });

  return (
    <>
      <h2 style={{ fontWeight: 700, marginBottom: 4 }}>לוחות ({plans.length})</h2>
      <div style={{ fontSize: '0.85rem', color: 'var(--gray-600)', marginBottom: 16 }}>{active.length} פעילים כרגע</div>
      {plans.map(p => {
        const totalComp = p.done_count + p.missed_count;
        const pct = totalComp > 0 ? Math.round((p.done_count / totalComp) * 100) : null;
        const isActive = p.start_date?.slice(0,10) <= new Date().toISOString().slice(0,10)
          && p.end_date?.slice(0,10) >= new Date().toISOString().slice(0,10);
        return (
          <div key={p.id} className="card" style={{ marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ fontWeight: 700 }}>{p.name}</div>
              {isActive && <span className="badge badge-done">פעיל</span>}
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--gray-600)', marginTop: 4 }}>
              {p.supervisor_name} → {p.monitored_name}
            </div>
            <div style={{ fontSize: '0.78rem', color: 'var(--gray-400)', marginTop: 2 }}>
              {fmtDate(p.start_date)} – {fmtDate(p.end_date)} • {p.items_count} שורות
            </div>
            {pct !== null && (
              <div style={{ marginTop: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: 3 }}>
                  <span>ביצוע כולל</span>
                  <span style={{ fontWeight: 700, color: pct>=80?'var(--green)':pct>=50?'var(--orange)':'var(--red)' }}>{pct}%</span>
                </div>
                <div style={{ background: 'var(--gray-200)', borderRadius: 4, height: 4, overflow: 'hidden' }}>
                  <div style={{ background: pct>=80?'var(--green)':pct>=50?'var(--orange)':'var(--red)', height: '100%', width: `${pct}%` }} />
                </div>
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}

function KpiBox({ label, main, sub, color }) {
  return (
    <div className="card" style={{ textAlign: 'center' }}>
      <div style={{ fontSize: '0.78rem', color: 'var(--gray-600)', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: '2rem', fontWeight: 800, color, lineHeight: 1 }}>{main}</div>
      <div style={{ fontSize: '0.75rem', color: 'var(--gray-400)', marginTop: 4 }}>{sub}</div>
    </div>
  );
}

function StatRow({ label, count, total, color }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: '0.85rem' }}>
        <span>{label}</span>
        <span style={{ fontWeight: 700 }}>{count} <span style={{ color: 'var(--gray-400)', fontWeight: 400 }}>({pct}%)</span></span>
      </div>
      <div style={{ background: 'var(--gray-100)', borderRadius: 4, height: 6, overflow: 'hidden' }}>
        <div style={{ background: color, height: '100%', width: `${pct}%` }} />
      </div>
    </div>
  );
}

function fmtDate(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric', year: '2-digit' });
}
