import { useState, useEffect } from 'react';
import api from '../api/client';

const DAY_SHORT = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'];

export default function PlanStats({ planId }) {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    if (!planId) return;
    api.get(`/plans/${planId}/stats`)
      .then(r => setStats(r.data))
      .catch(() => {});
  }, [planId]);

  if (!stats) return null;

  const todayDone = stats.today.done + stats.today.replaced;
  const todayTotal = stats.today.total || 1;
  const todayPct = Math.round((todayDone / todayTotal) * 100);

  const weekDone = stats.week.done + stats.week.replaced;
  const weekTotal = weekDone + stats.week.pending + stats.week.missed;
  const weekPct = weekTotal > 0 ? Math.round((weekDone / weekTotal) * 100) : 0;

  return (
    <div style={{ marginBottom: 20 }}>
      {/* כרטיסי KPI */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 12 }}>
        <KpiCard label="היום" value={`${todayDone}/${stats.today.total}`} sub={`${todayPct}%`} color={pctColor(todayPct)} />
        <KpiCard label="שבוע" value={`${weekPct}%`} sub={`${weekDone}/${weekTotal}`} color={pctColor(weekPct)} />
        <KpiCard label="רצף" value={`${stats.streak}`} sub="ימים" color="var(--orange)" />
      </div>

      {/* גרף עמודות שבועי */}
      {stats.daily.length > 0 && (
        <div style={{ background: '#fff', borderRadius: 12, padding: '14px 16px', boxShadow: 'var(--shadow)' }}>
          <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--gray-600)', marginBottom: 10 }}>7 ימים אחרונים</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 56 }}>
            {stats.daily.map((day) => {
              const pct = day.total > 0 ? (day.completed / day.total) : 0;
              const d = new Date(day.date + 'T12:00:00');
              return (
                <div key={day.date} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                  <div style={{ width: '100%', background: 'var(--gray-100)', borderRadius: 4, height: 44, position: 'relative', overflow: 'hidden' }}>
                    <div style={{
                      position: 'absolute', bottom: 0, width: '100%',
                      height: `${pct * 100}%`,
                      background: pct >= 0.8 ? 'var(--green)' : pct >= 0.5 ? 'var(--orange)' : 'var(--red)',
                      transition: 'height 0.4s',
                    }} />
                  </div>
                  <div style={{ fontSize: '0.65rem', color: 'var(--gray-600)' }}>{DAY_SHORT[d.getDay()]}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* פירוט שבוע */}
      {weekTotal > 0 && (
        <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
          <StatChip label="בוצע" count={stats.week.done} color="#155724" bg="#d4edda" />
          <StatChip label="הוחלף" count={stats.week.replaced} color="#0c5460" bg="#d1ecf1" />
          <StatChip label="פוספס" count={stats.week.missed} color="#721c24" bg="#f8d7da" />
        </div>
      )}
    </div>
  );
}

function KpiCard({ label, value, sub, color }) {
  return (
    <div style={{ background: '#fff', borderRadius: 12, padding: '12px 10px', boxShadow: 'var(--shadow)', textAlign: 'center' }}>
      <div style={{ fontSize: '0.72rem', color: 'var(--gray-600)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: '1.4rem', fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: '0.72rem', color: 'var(--gray-400)', marginTop: 2 }}>{sub}</div>
    </div>
  );
}

function StatChip({ label, count, color, bg }) {
  if (!count) return null;
  return (
    <span style={{ background: bg, color, borderRadius: 20, padding: '3px 10px', fontSize: '0.78rem', fontWeight: 600 }}>
      {label} {count}
    </span>
  );
}

function pctColor(pct) {
  if (pct >= 80) return 'var(--green)';
  if (pct >= 50) return 'var(--orange)';
  return 'var(--red)';
}
