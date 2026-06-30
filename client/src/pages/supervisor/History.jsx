import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import api from '../../api/client';
import { SupervisorLayout, StatusBadge } from '../../components/Layout';

export default function History() {
  const { id } = useParams();
  const [plan, setPlan] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState(weekAgo());
  const [to, setTo] = useState(today());

  useEffect(() => {
    api.get(`/plans/${id}`).then(r => setPlan(r.data));
  }, [id]);

  useEffect(() => {
    setLoading(true);
    api.get(`/plans/${id}/completions/history?from=${from}&to=${to}`)
      .then(r => { setItems(r.data); setLoading(false); });
  }, [id, from, to]);

  const grouped = groupByDate(items);

  return (
    <SupervisorLayout title="היסטוריה" back={`/supervisor/plans/${id}`}>
      <div className="page">
        <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
            <label>מ</label>
            <input type="date" value={from} onChange={e => setFrom(e.target.value)} />
          </div>
          <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
            <label>עד</label>
            <input type="date" value={to} onChange={e => setTo(e.target.value)} />
          </div>
        </div>

        {loading && <div className="spinner" />}

        {!loading && items.length === 0 && (
          <div className="empty-state"><p>אין נתונים לתקופה זו</p></div>
        )}

        {grouped.map(([date, dayItems]) => (
          <div key={date} className="time-group">
            <div className="time-group-header">{formatDateHe(date)}</div>
            {dayItems.map((item, i) => (
              <div key={i} className="plan-row">
                <span className="plan-row-time">{item.scheduled_time?.slice(0, 5)}</span>
                <div className="plan-row-info">
                  <div className="plan-row-name">{item.item_name}</div>
                  {item.quantity && <div className="plan-row-qty">{item.quantity}</div>}
                  {item.status === 'replaced' && item.replaced_with && (
                    <div style={{ fontSize: '0.8rem', color: 'var(--orange)', marginTop: 4 }}>הוחלף ב: {item.replaced_with}</div>
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
        ))}
      </div>
    </SupervisorLayout>
  );
}

function today() { return new Date().toISOString().slice(0, 10); }
function weekAgo() {
  const d = new Date(); d.setDate(d.getDate() - 7);
  return d.toISOString().slice(0, 10);
}
function formatDateHe(d) {
  return new Date(d + 'T12:00:00').toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' });
}
function groupByDate(items) {
  const g = {};
  for (const i of items) {
    const k = i.date?.slice(0, 10) || '?';
    if (!g[k]) g[k] = [];
    g[k].push(i);
  }
  return Object.entries(g).sort(([a], [b]) => b.localeCompare(a));
}
