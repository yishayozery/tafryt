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

  const visibleItems = items.filter(i => i.status !== 'cancelled');
  const grouped = groupByDate(visibleItems);

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
            {dayItems.map((item, i) => {
              const isCompleted = item.status === 'done' || item.status === 'replaced';
              const delta = calcDelta(item);
              return (
                <div key={i} style={{
                  padding: '10px 12px', marginBottom: 4, background: '#fff',
                  borderRadius: 8, border: '1px solid var(--gray-200)',
                  opacity: item.status === 'missed' ? 0.6 : 1,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontWeight: 700, color: 'var(--green)', fontSize: '0.85rem', flexShrink: 0, minWidth: 38 }}>
                      {item.scheduled_time?.slice(0, 5)}
                    </span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: '0.88rem' }}>{item.item_name}</div>
                      {item.quantity && !/^אפ׳/.test(item.quantity || '') && (
                        <div style={{ fontSize: '0.75rem', color: 'var(--gray-600)' }}>{item.quantity}</div>
                      )}
                    </div>
                    <StatusBadge status={item.status || 'pending'} />
                  </div>
                  {isCompleted && item.completed_at && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 5, paddingRight: 46 }}>
                      <span style={{ fontSize: '0.75rem', color: 'var(--gray-600)' }}>
                        דווח: {formatTime(item.completed_at)}
                      </span>
                      {delta !== null && (
                        <span style={{
                          fontSize: '0.7rem', fontWeight: 700,
                          color: delta <= 0 ? '#2d6a4f' : delta <= 20 ? '#e07b39' : '#d62839',
                          background: delta <= 0 ? '#2d6a4f18' : delta <= 20 ? '#e07b3918' : '#d6283918',
                          padding: '1px 6px', borderRadius: 10,
                        }}>
                          {delta < 0 ? `מוקדם ${Math.abs(delta)}דק׳` : delta === 0 ? 'בדיוק בזמן' : `+${delta}דק׳`}
                        </span>
                      )}
                    </div>
                  )}
                  {item.status === 'replaced' && item.replaced_with && (
                    <div style={{ fontSize: '0.78rem', color: 'var(--orange)', marginTop: 4, paddingRight: 46 }}>
                      הוחלף ב: {item.replaced_with}
                    </div>
                  )}
                  {item.photo_url && (
                    <a href={item.photo_url} target="_blank" rel="noopener noreferrer"
                      style={{ fontSize: '0.78rem', color: 'var(--green)', marginTop: 4, display: 'block', paddingRight: 46 }}>
                      📷 צפה בתמונה
                    </a>
                  )}
                </div>
              );
            })}
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
function formatTime(completedAt) {
  if (!completedAt) return '';
  return new Date(completedAt).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jerusalem' });
}
function calcDelta(item) {
  if (!item.completed_at || !item.scheduled_time || !item.date) return null;
  const scheduled = new Date(`${item.date.slice(0,10)}T${item.scheduled_time.slice(0,5)}:00`);
  const actual = new Date(item.completed_at);
  return Math.round((actual - scheduled) / 60000);
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
