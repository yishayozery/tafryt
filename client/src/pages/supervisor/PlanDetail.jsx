import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../../api/client';
import { SupervisorLayout, StatusBadge, formatTime } from '../../components/Layout';
import PlanStats from '../../components/PlanStats';

const VISIBILITY_LABELS = {
  daily: 'יומי',
  weekly: 'שבוע קדימה',
  on_time: 'שעתי-משימתי',
};

export default function PlanDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get(`/plans/${id}`).then(r => { setPlan(r.data); setLoading(false); });
  }, [id]);

  async function deletePlan() {
    if (!confirm('האם למחוק את הלוח?')) return;
    await api.delete(`/plans/${id}`);
    navigate('/supervisor');
  }

  const today = new Date().toISOString().slice(0, 10);

  if (loading) return <SupervisorLayout title="..."><div className="spinner" /></SupervisorLayout>;

  return (
    <SupervisorLayout title={plan.name} back="/supervisor">
      <div className="page">
        <PlanStats planId={id} />
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontWeight: 700, fontSize: '1.1rem' }}>{plan.name}</span>
            <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/supervisor/plans/${id}/edit`)}>עריכה</button>
          </div>
          <div style={{ color: 'var(--gray-600)', fontSize: '0.85rem', display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span>מבוקר: <strong>{plan.monitored_name}</strong></span>
            <span>תאריכים: {fmtDate(plan.start_date)} – {fmtDate(plan.end_date)}</span>
            <span>חשיפה: {VISIBILITY_LABELS[plan.visibility_mode]}</span>
            <span>התראה לאחר: {plan.alert_threshold_minutes} דקות</span>
            {plan.photo_required && <span>📷 צילום חובה</span>}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
          <button className="btn btn-primary btn-full"
            onClick={() => navigate(`/supervisor/plans/${id}/daily?date=${today}`)}>
            לוז יומי של היום
          </button>
          <button className="btn btn-secondary btn-full"
            onClick={() => navigate(`/supervisor/plans/${id}/history`)}>
            היסטוריה
          </button>
          <button className="btn btn-secondary btn-full"
            onClick={() => navigate(`/supervisor/plans/${id}/edit`)}>
            ערוך שורות תפריט
          </button>
        </div>

        <button className="btn btn-ghost btn-sm" style={{ color: 'var(--red)' }} onClick={deletePlan}>
          מחק לוח
        </button>
      </div>
    </SupervisorLayout>
  );
}

function fmtDate(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric', year: '2-digit' });
}
