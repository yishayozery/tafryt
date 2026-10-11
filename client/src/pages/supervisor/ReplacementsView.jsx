import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import * as XLSX from 'xlsx';
import api from '../../api/client';
import { SupervisorLayout } from '../../components/Layout';

export default function ReplacementsView() {
  const { id } = useParams();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [plan, setPlan] = useState(null);
  const [from, setFrom] = useState(monthAgo());
  const [to, setTo] = useState(today());

  useEffect(() => {
    api.get(`/plans/${id}`).then(r => setPlan(r.data));
  }, [id]);

  useEffect(() => {
    setLoading(true);
    api.get(`/plans/${id}/completions/replacements?from=${from}&to=${to}`)
      .then(r => { setRows(r.data); setLoading(false); });
  }, [id, from, to]);

  function calDiff(r) {
    if (r.calories == null || r.replacement_calories == null) return null;
    return r.replacement_calories - r.calories;
  }

  function exportExcel() {
    const data = rows.map(r => {
      const diff = calDiff(r);
      return {
        'תאריך': r.date?.slice(0, 10),
        'שעה מתוכננת': r.scheduled_time?.slice(0, 5),
        'שם פריט': r.item_name,
        'קל\' מקורי': r.calories ?? '',
        'כמות': r.quantity || '',
        'הוחלף ב': r.replaced_with,
        'קל\' בפועל': r.replacement_calories ?? '',
        'הפרש קל\'': diff != null ? (diff >= 0 ? `+${diff}` : String(diff)) : '',
        'זמן דיווח': r.completed_at ? formatTime(r.completed_at) : '',
      };
    });
    const ws = XLSX.utils.json_to_sheet(data);
    ws['!cols'] = [{ wch: 12 }, { wch: 10 }, { wch: 20 }, { wch: 12 }, { wch: 20 }, { wch: 12 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'החלפות');
    XLSX.writeFile(wb, `החלפות_${plan?.name || id}_${from}_${to}.xlsx`);
  }

  function exportWhatsApp() {
    if (!rows.length) return;
    const lines = [`*החלפות — ${plan?.name || ''}*`, `${from} עד ${to}`, ''];
    for (const r of rows) {
      const diff = calDiff(r);
      const diffStr = diff != null ? ` (${diff >= 0 ? '+' : ''}${diff} קל׳)` : '';
      lines.push(`📅 ${r.date?.slice(0, 10)} | ⏰ ${r.scheduled_time?.slice(0, 5)}`);
      lines.push(`❌ ${r.item_name}${r.calories ? ` — ${r.calories} קל׳` : ''}${r.quantity ? ` (${r.quantity})` : ''}`);
      lines.push(`✅ ${r.replaced_with}${r.replacement_calories ? ` — ${r.replacement_calories} קל׳` : ''}${diffStr}`);
      lines.push('');
    }
    const text = lines.join('\n');
    if (navigator.share) {
      navigator.share({ text }).catch(() => navigator.clipboard?.writeText(text));
    } else {
      navigator.clipboard?.writeText(text);
      alert('הטקסט הועתק — הדבק בוואטסאפ');
    }
  }

  return (
    <SupervisorLayout title="טבלת החלפות" back={`/supervisor/plans/${id}`}>
      <div className="page">
        {/* פילטר תאריכים */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
            <label>מ</label>
            <input type="date" value={from} onChange={e => setFrom(e.target.value)} />
          </div>
          <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
            <label>עד</label>
            <input type="date" value={to} onChange={e => setTo(e.target.value)} />
          </div>
        </div>

        {/* כפתורי יצוא */}
        {!loading && rows.length > 0 && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <button onClick={exportWhatsApp} className="btn btn-secondary" style={{ flex: 1 }}>
              📱 וואטסאפ
            </button>
            <button onClick={exportExcel} className="btn btn-secondary" style={{ flex: 1 }}>
              📊 אקסל
            </button>
          </div>
        )}

        {loading && <div className="spinner" />}

        {!loading && rows.length === 0 && (
          <div className="empty-state">
            <p>אין החלפות בתקופה זו</p>
          </div>
        )}

        {/* סיכום קלוריות */}
        {!loading && rows.length > 0 && (() => {
          const withCal = rows.filter(r => r.calories != null && r.replacement_calories != null);
          if (!withCal.length) return null;
          const totalPlanned  = withCal.reduce((s, r) => s + r.calories, 0);
          const totalActual   = withCal.reduce((s, r) => s + r.replacement_calories, 0);
          const totalDiff     = totalActual - totalPlanned;
          const diffColor = totalDiff > 0 ? 'var(--red, #e53e3e)' : totalDiff < 0 ? 'var(--green)' : 'var(--gray-600)';
          return (
            <div style={{ background: 'var(--gray-50)', border: '1px solid var(--gray-200)', borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: '0.85rem', display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'center' }}>
              <span>מתוכנן: <b>{totalPlanned} קל׳</b></span>
              <span>בפועל: <b>{totalActual} קל׳</b></span>
              <span>הפרש: <b style={{ color: diffColor }}>{totalDiff >= 0 ? '+' : ''}{totalDiff} קל׳</b></span>
              <span style={{ color: 'var(--gray-400)', fontSize: '0.75rem' }}>* מוערך</span>
            </div>
          );
        })()}

        {/* טבלה */}
        {!loading && rows.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ background: 'var(--gray-100)', textAlign: 'right' }}>
                  {['תאריך', 'שעה', 'פריט', 'קל׳', 'הוחלף ב', 'קל׳ בפועל', 'הפרש'].map(h => (
                    <th key={h} style={{ padding: '8px 10px', fontWeight: 700, borderBottom: '2px solid var(--gray-200)', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const diff = calDiff(r);
                  const diffColor = diff == null ? 'inherit' : diff > 0 ? 'var(--red, #e53e3e)' : diff < 0 ? 'var(--green)' : 'var(--gray-600)';
                  return (
                    <tr key={i} style={{ borderBottom: '1px solid var(--gray-100)', background: i % 2 === 0 ? '#fff' : 'var(--gray-50)' }}>
                      <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>{r.date?.slice(0, 10)}</td>
                      <td style={{ padding: '8px 10px', whiteSpace: 'nowrap', color: 'var(--green)', fontWeight: 700 }}>{r.scheduled_time?.slice(0, 5)}</td>
                      <td style={{ padding: '8px 10px' }}>{r.item_name}</td>
                      <td style={{ padding: '8px 10px', color: 'var(--gray-500)', fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                        {r.calories != null ? `~${r.calories} קל׳` : '—'}
                      </td>
                      <td style={{ padding: '8px 10px', color: 'var(--orange)', fontWeight: 600 }}>{r.replaced_with}</td>
                      <td style={{ padding: '8px 10px', fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                        {r.replacement_calories != null ? `~${r.replacement_calories} קל׳` : <span style={{ color: 'var(--gray-400)' }}>⏳</span>}
                      </td>
                      <td style={{ padding: '8px 10px', fontWeight: 700, whiteSpace: 'nowrap', color: diffColor }}>
                        {diff != null ? `${diff >= 0 ? '+' : ''}${diff}` : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div style={{ marginTop: 10, fontSize: '0.78rem', color: 'var(--gray-500)', textAlign: 'center' }}>
              סה״כ {rows.length} החלפות
            </div>
          </div>
        )}
      </div>
    </SupervisorLayout>
  );
}

function today() { return new Date().toISOString().slice(0, 10); }
function monthAgo() {
  const d = new Date(); d.setDate(d.getDate() - 30);
  return d.toISOString().slice(0, 10);
}
function formatTime(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jerusalem' });
}
