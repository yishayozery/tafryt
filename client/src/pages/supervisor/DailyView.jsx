import { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import api from '../../api/client';
import { SupervisorLayout, StatusBadge } from '../../components/Layout';
import PlanStats from '../../components/PlanStats';

export default function DailyView() {
  const { id } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
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

  const visible = items.filter(i => i.status !== 'cancelled');
  const doneItems = visible.filter(i => i.status === 'done' || i.status === 'replaced');
  const missedItems = visible.filter(i => i.status === 'missed');
  const pendingCount = visible.filter(i => !i.status || i.status === 'pending').length;
  const total = visible.length;

  const deltas = doneItems.map(i => calcDelta(i, date)).filter(d => d !== null);
  const avgDelta = deltas.length ? Math.round(deltas.reduce((a, b) => a + b, 0) / deltas.length) : null;

  return (
    <SupervisorLayout title={plan?.name || 'לוז יומי'} back={`/supervisor/plans/${id}`}>
      <div className="page">
        <PlanStats planId={id} />

        {/* ניווט תאריך */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <button className="btn btn-ghost" onClick={() => changeDate(-1)}>←</button>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontWeight: 700 }}>{formatDateHe(date)}</div>
            {total > 0 && (
              <div style={{ fontSize: '0.8rem', color: 'var(--gray-600)' }}>
                {doneItems.length}/{total} בוצעו
              </div>
            )}
          </div>
          <button className="btn btn-ghost" onClick={() => changeDate(1)}>→</button>
        </div>

        {/* Progress bar */}
        {total > 0 && (
          <div style={{ background: 'var(--gray-100)', borderRadius: 8, height: 6, marginBottom: 14, overflow: 'hidden' }}>
            <div style={{ background: 'var(--green)', height: '100%', width: `${(doneItems.length / total) * 100}%`, transition: 'width 0.3s' }} />
          </div>
        )}

        {/* Stats row */}
        {total > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginBottom: 18 }}>
            {[
              { label: 'בוצעו', value: `${doneItems.length}/${total}`, color: 'var(--green)' },
              { label: 'פוספסו', value: missedItems.length, color: missedItems.length > 0 ? 'var(--red)' : 'var(--gray-400)' },
              { label: 'ממתינות', value: pendingCount, color: 'var(--gray-600)' },
              {
                label: 'ממוצע איחור',
                value: avgDelta === null ? '—' : avgDelta <= 0 ? 'בזמן ✓' : `+${avgDelta}דק׳`,
                color: avgDelta === null ? 'var(--gray-400)' : avgDelta <= 0 ? 'var(--green)' : avgDelta <= 20 ? 'var(--orange)' : 'var(--red)',
              },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ textAlign: 'center', padding: '8px 4px', background: 'var(--gray-50)', borderRadius: 8 }}>
                <div style={{ fontSize: '0.95rem', fontWeight: 700, color }}>{value}</div>
                <div style={{ fontSize: '0.62rem', color: 'var(--gray-600)', marginTop: 2, lineHeight: 1.2 }}>{label}</div>
              </div>
            ))}
          </div>
        )}

        {loading && <div className="spinner" />}

        {!loading && visible.length === 0 && (
          <div className="empty-state"><p>אין משימות לתאריך זה</p></div>
        )}

        {visible.map(item => {
          const isCompleted = item.status === 'done' || item.status === 'replaced';
          const isMissed = item.status === 'missed';
          const delta = isCompleted ? calcDelta(item, date) : null;

          return (
            <div key={item.plan_item_id || item.completion_id} style={{
              padding: '10px 12px', marginBottom: 8, background: '#fff',
              borderRadius: 10, border: '1px solid var(--gray-200)',
              opacity: isMissed ? 0.6 : 1,
            }}>
              {/* Row 1: time / name / badge */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{
                  fontWeight: 700, color: 'var(--green)', fontSize: '0.85rem',
                  flexShrink: 0, minWidth: 40,
                }}>
                  {formatTime(item.scheduled_time)}
                </span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: '0.9rem', lineHeight: 1.3 }}>{item.item_name}</div>
                  {item.quantity && !/^אפ׳/.test(item.quantity || '') && (
                    <div style={{ fontSize: '0.74rem', color: 'var(--gray-600)', marginTop: 1 }}>{item.quantity}</div>
                  )}
                </div>
                <StatusBadge status={item.status || 'pending'} />
              </div>

              {/* Row 2: timing comparison */}
              {isCompleted && item.completed_at && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  marginTop: 7, paddingRight: 48,
                  paddingTop: 6, borderTop: '1px solid var(--gray-100)',
                }}>
                  <span style={{ fontSize: '0.74rem', color: 'var(--gray-600)' }}>
                    יעד {formatTime(item.scheduled_time)} → דווח {formatActualTime(item.completed_at)}
                  </span>
                  {delta !== null && (
                    <span style={{
                      fontSize: '0.7rem', fontWeight: 700,
                      color: delta <= 0 ? '#2d6a4f' : delta <= 20 ? '#e07b39' : '#d62839',
                      background: delta <= 0 ? '#2d6a4f18' : delta <= 20 ? '#e07b3918' : '#d6283918',
                      padding: '2px 8px', borderRadius: 12, flexShrink: 0,
                    }}>
                      {delta < 0 ? `מוקדם ${Math.abs(delta)}דק׳` : delta === 0 ? 'בדיוק' : `+${delta}דק׳`}
                    </span>
                  )}
                </div>
              )}

              {/* replaced_with */}
              {item.status === 'replaced' && item.replaced_with && (
                <div style={{ fontSize: '0.78rem', color: 'var(--orange)', marginTop: 5, paddingRight: 48 }}>
                  הוחלף ב: {item.replaced_with}
                </div>
              )}

              {/* photo */}
              {item.photo_url && (
                <a href={item.photo_url} target="_blank" rel="noopener noreferrer"
                  style={{ fontSize: '0.78rem', color: 'var(--green)', marginTop: 4, display: 'block', paddingRight: 48 }}>
                  📷 צפה בתמונה
                </a>
              )}
            </div>
          );
        })}
      </div>
    </SupervisorLayout>
  );
}

function today() { return new Date().toISOString().slice(0, 10); }
function formatTime(t) { return t ? t.slice(0, 5) : ''; }
function formatActualTime(completedAt) {
  if (!completedAt) return '';
  return new Date(completedAt).toLocaleTimeString('he-IL', {
    hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jerusalem',
  });
}
function calcDelta(item, date) {
  if (!item.completed_at || !item.scheduled_time || !date) return null;
  const scheduled = new Date(`${date}T${item.scheduled_time.slice(0, 5)}:00`);
  const actual = new Date(item.completed_at);
  return Math.round((actual - scheduled) / 60000);
}
function formatDateHe(d) {
  return new Date(d + 'T12:00:00').toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' });
}
