import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import api from './api/client';
import { AuthProvider, useAuth } from './hooks/useAuth';

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
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  return (
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
          <Route path="/" element={<RequireAuth><SmartRedirect /></RequireAuth>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

function SmartRedirect() {
  const { user } = useAuth();
  const [dest, setDest] = useState(null);

  useEffect(() => {
    if (user?.is_admin) { setDest('/admin'); return; }
    Promise.all([
      api.get('/users/monitored').catch(() => ({ data: [] })),
      api.get('/plans/my').catch(() => ({ data: [] })),
    ]).then(([supervisorRes, monitoredRes]) => {
      const isMonitored = monitoredRes.data.length > 0;
      if (isMonitored && supervisorRes.data.length === 0) {
        setDest('/my-tasks');
      } else {
        setDest('/supervisor');
      }
    });
  }, []);

  if (!dest) return <div className="spinner" />;
  return <Navigate to={dest} replace />;
}
