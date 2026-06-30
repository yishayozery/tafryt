import { useState, useEffect } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import api from '../../api/client';
import { SupervisorLayout, StatusBadge } from '../../components/Layout';
import PlanStats from '../../components/PlanStats';

export default function DailyView() {
  const { id } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const [date, setDate] = useState(searchParams.get('date') || today());
  const [plan, setPlan] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get(`/plans/${id}`).then(r => setPlan(r.data));
  }, [id]);

  useEffect(() => {
    setLoading(true);
    api.get(`/plans/${id}/completions/by-date?date=${date}`)
      .then(r => { setItems(r.data); setLoading(false); });
  }, [id, date]);

  function changeDate(delta) {
    const d = new Date(date);
    d.setDate(d.getDate() + delta);
    const nd = d.toISOString().slice(0, 10);
    setDate(nd);
    setSearchParams({ date: nd });
  }

  const done = items.filter(i => i.status === 'done' || i.status === 'replaced').length;
  const total = items.length;

  return (
    <SupervisorLayout title={plan?.name || 'לוז יומי'} back={`/supervisor/plans/${id}`}>
      <div className="page">
        <PlanStats planId={id} />
        {/* date navigator */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <button className="btn btn-ghost" onClick={() => changeDate(-1)}>←</button>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontWeight: 700 }}>{formatDateHe(date)}</div>
            {total > 0 && <div style={{ fontSize: '0.8rem', color: 'var(--gray-600)' }}>{done}/{total} בוצעו</div>}
          </div>
          <button className="btn btn-ghost" onClick={() => changeDate(1)}>→</button>
        </div>

        {total > 0 && (
          <div style={{ background: 'var(--gray-100)', borderRadius: 8, height: 6, marginBottom: 20, overflow: 'hidden' }}>
            <div style={{ background: 'var(--green)', height: '100%', width: `${(done / total) * 100}%`, transition: 'width 0.3s' }} />
          </div>
        )}

        {loading && <div className="spinner" />}

        {!loading && items.length === 0 && (
          <div className="empty-state">
            <p>אין משימות לתאריך זה</p>
          </div>
        )}

        {items.map(item => (
          <div key={item.plan_item_id} className="plan-row" style={{ opacity: item.status === 'missed' ? 0.6 : 1 }}>
            <span className="plan-row-time">{formatTime(item.scheduled_time)}</span>
            <div className="plan-row-info">
              <div className="plan-row-name">{item.item_name}</div>
              {item.quantity && <div className="plan-row-qty">{item.quantity}</div>}
              {item.status === 'replaced' && item.replaced_with && (
                <div style={{ fontSize: '0.8rem', color: 'var(--orange)', marginTop: 4 }}>
                  הוחלף ב: {item.replaced_with}
                </div>
              )}
              {item.photo_url && (
                <a href={item.photo_url} target="_blank" rel="noopener noreferrer"
                  style={{ fontSize: '0.8rem', color: 'var(--green)', marginTop: 4, display: 'block' }}>
                  📷 צפה בתמונה
                </a>
              )}
            </div>
            <StatusBadge status={item.status || 'pending'} />
          </div>
        ))}
      </div>
    </SupervisorLayout>
  );
}

function today() { return new Date().toISOString().slice(0, 10); }
function formatTime(t) { return t ? t.slice(0, 5) : ''; }
function formatDateHe(d) {
  return new Date(d + 'T12:00:00').toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' });
}
