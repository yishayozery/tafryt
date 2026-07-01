import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useState, useEffect, Component } from 'react';
import api from './api/client';
import { AuthProvider, useAuth } from './hooks/useAuth';

class ErrorBoundary extends Component {
  state = { error: null };
  static getDerivedStateFromError(e) { return { error: e }; }
  render() {
    if (this.state.error) return (
      <div style={{ padding: 32, textAlign: 'center', direction: 'rtl' }}>
        <p style={{ fontSize: '2rem', marginBottom: 8 }}>⚠️</p>
        <p style={{ marginBottom: 16, color: '#666' }}>משהו השתבש. נסה לרענן.</p>
        <button onClick={() => window.location.reload()}
          style={{ padding: '10px 24px', background: '#2d6a4f', color: '#fff', border: 'none', borderRadius: 8, fontSize: '1rem', cursor: 'pointer' }}>
          רענן דף
        </button>
        <details style={{ marginTop: 16, fontSize: '0.75rem', color: '#999' }}>
          <summary>פרטים</summary>
          <pre style={{ textAlign: 'left', whiteSpace: 'pre-wrap' }}>{this.state.error?.message}</pre>
        </details>
      </div>
    );
    return this.props.children;
  }
}

import Login from './pages/Login';
import Register from './pages/Register';
import JoinPage from './pages/JoinPage';
import ResetPage from './pages/ResetPage';

import Dashboard from './pages/supervisor/Dashboard';
import MonitoredList from './pages/supervisor/MonitoredList';
import PlanForm from './pages/supervisor/PlanForm';
import PlanDetail from './pages/supervisor/PlanDetail';
import DailyView from './pages/supervisor/DailyView';
import History from './pages/supervisor/History';
import Notifications from './pages/supervisor/Notifications';

import TaskView from './pages/monitored/TaskView';
import AdminDashboard from './pages/admin/AdminDashboard';

function RootRedirect() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  // המבוקר מנותב לתצוגת המשימות, המבקר לדשבורד
  // בפשטות — כולם הולכים לדשבורד, שמחליט לפי context
  return <Navigate to="/supervisor" replace />;
}

function RequireAuth({ children }) {
  // קריאה ישירה מ-localStorage כדי לא להסתמך על עדכון context אסינכרוני
  let user = null;
  try { user = JSON.parse(localStorage.getItem('user')); } catch {}
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  return (
    <ErrorBoundary>
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* ציבורי */}
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/join/:token" element={<JoinPage />} />
          <Route path="/reset/:token" element={<ResetPage />} />

          {/* מבקר */}
          <Route path="/supervisor" element={<RequireAuth><Dashboard /></RequireAuth>} />
          <Route path="/supervisor/monitored" element={<RequireAuth><MonitoredList /></RequireAuth>} />
          <Route path="/supervisor/notifications" element={<RequireAuth><Notifications /></RequireAuth>} />
          <Route path="/supervisor/plans/new" element={<RequireAuth><PlanForm /></RequireAuth>} />
          <Route path="/supervisor/plans/:id" element={<RequireAuth><PlanDetail /></RequireAuth>} />
          <Route path="/supervisor/plans/:id/edit" element={<RequireAuth><PlanForm /></RequireAuth>} />
          <Route path="/supervisor/plans/:id/daily" element={<RequireAuth><DailyView /></RequireAuth>} />
          <Route path="/supervisor/plans/:id/history" element={<RequireAuth><History /></RequireAuth>} />

          {/* מבוקר */}
          <Route path="/my-tasks" element={<RequireAuth><TaskView /></RequireAuth>} />

          {/* אדמין */}
          <Route path="/admin" element={<RequireAuth><AdminDashboard /></RequireAuth>} />

          {/* ברירת מחדל */}
          <Route path="/" element={<SmartRedirect />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
    </ErrorBoundary>
  );
}

function SmartRedirect() {
  const [dest, setDest] = useState(null);

  useEffect(() => {
    // קריאה ישירה מ-localStorage כדי לא להסתמך על עדכון context אסינכרוני
    let user = null;
    try { user = JSON.parse(localStorage.getItem('user')); } catch {}
    if (!user) { setDest('/login'); return; }
    if (user.is_admin) { setDest('/admin'); return; }

    Promise.all([
      api.get('/users/monitored').catch(() => ({ data: [] })),
      api.get('/users/supervisors').catch(() => ({ data: [] })),
    ]).then(([supervisingRes, supervisedByRes]) => {
      const iAmSupervised = supervisedByRes.data.length > 0;
      const iSupervise = supervisingRes.data.length > 0;
      setDest(iAmSupervised && !iSupervise ? '/my-tasks' : '/supervisor');
    });
  }, []);

  if (!dest) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
      <div className="spinner" />
    </div>
  );
  return <Navigate to={dest} replace />;
}
