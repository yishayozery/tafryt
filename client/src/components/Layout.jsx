import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useState, useEffect } from 'react';

const DAYS = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'];

export function Navbar({ title, back }) {
  const navigate = useNavigate();
  return (
    <nav className="navbar">
      {back ? (
        <button className="navbar-back" onClick={() => navigate(back)}>
          ← חזרה
        </button>
      ) : <span />}
      <span className="navbar-title">{title}</span>
      <span style={{ width: 64 }} />
    </nav>
  );
}

export function SupervisorLayout({ children, title, back }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { logout, user } = useAuth();
  const [hasMonitoredPlans, setHasMonitoredPlans] = useState(false);

  useEffect(() => {
    import('../api/client').then(({ default: api }) => {
      api.get('/plans/my').then(r => setHasMonitoredPlans(r.data.length > 0)).catch(() => {});
    });
  }, []);

  const tabs = [
    { path: '/supervisor', label: 'ראשי', icon: HomeIcon },
    { path: '/supervisor/monitored', label: 'מבוקרים', icon: UsersIcon },
    { path: '/supervisor/notifications', label: 'התראות', icon: BellIcon },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <nav className="navbar">
        {back ? (
          <button className="navbar-back" onClick={() => navigate(back)}>← חזרה</button>
        ) : (
          <button className="navbar-back" onClick={logout} style={{ fontSize: '0.8rem' }}>יציאה</button>
        )}
        <span className="navbar-title">{title || 'תפריט מבוקר'}</span>
        <span style={{ width: 64 }} />
      </nav>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {children}
      </div>
      <nav className="bottom-tabs">
        {tabs.map((t) => {
          const active = location.pathname === t.path;
          return (
            <button key={t.path} className={`tab-item ${active ? 'active' : ''}`} onClick={() => navigate(t.path)}>
              <t.icon />
              {t.label}
            </button>
          );
        })}
        {hasMonitoredPlans && (
          <button className="tab-item" onClick={() => navigate('/my-tasks')}>
            <UserIcon />
            שלי
          </button>
        )}
        {user?.is_admin && (
          <button className="tab-item" onClick={() => navigate('/admin')}
            style={{ color: '#6f42c1' }}>
            <AdminIcon />
            אדמין
          </button>
        )}
      </nav>
    </div>
  );
}

export function MonitoredLayout({ children, title, back }) {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const [hasSupervisorPlans, setHasSupervisorPlans] = useState(false);

  useEffect(() => {
    import('../api/client').then(({ default: api }) => {
      api.get('/plans').then(r => setHasSupervisorPlans(r.data.length > 0)).catch(() => {});
    });
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <nav className="navbar">
        {back ? (
          <button className="navbar-back" onClick={() => navigate(back)}>← חזרה</button>
        ) : (
          <button className="navbar-back" onClick={logout} style={{ fontSize: '0.8rem' }}>יציאה</button>
        )}
        <span className="navbar-title">{title || 'התפריט שלי'}</span>
        {hasSupervisorPlans ? (
          <button className="navbar-back" onClick={() => navigate('/supervisor')} style={{ fontSize: '0.8rem' }}>
            ניהול
          </button>
        ) : <span style={{ width: 64 }} />}
      </nav>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {children}
      </div>
    </div>
  );
}

export function StatusBadge({ status }) {
  const map = {
    done: { label: 'בוצע', cls: 'badge-done' },
    pending: { label: 'ממתין', cls: 'badge-pending' },
    missed: { label: 'פוספס', cls: 'badge-missed' },
    replaced: { label: 'הוחלף', cls: 'badge-replaced' },
  };
  const s = map[status] || map.pending;
  return <span className={`badge ${s.cls}`}>{s.label}</span>;
}

export function dayName(dow) {
  return ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'][dow] ?? '';
}

export function formatTime(t) {
  if (!t) return '';
  return t.slice(0, 5);
}

function UserIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>;
}
function AdminIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>;
}
function HomeIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>;
}
function UsersIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>;
}
function BellIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>;
}
