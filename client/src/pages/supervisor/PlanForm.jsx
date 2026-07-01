import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../../api/client';
import { SupervisorLayout, dayName, formatTime } from '../../components/Layout';

const DAYS = [0, 1, 2, 3, 4, 5, 6];
const DAY_LABELS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

const RELATIONSHIPS = [
  { value: 'family',    supervisor_label: 'הורה',    monitored_label: 'ילד' },
  { value: 'health',    supervisor_label: 'מטפל',    monitored_label: 'מטופל' },
  { value: 'coach',     supervisor_label: 'מאמן',    monitored_label: 'ספורטאי' },
  { value: 'education', supervisor_label: 'מורה',    monitored_label: 'תלמיד' },
  { value: 'custom',    supervisor_label: '',         monitored_label: '' },
];

const VISIBILITY = [
  { value: 'daily', label: 'יומי — רואה את כל משימות היום' },
  { value: 'weekly', label: 'שבוע קדימה — רואה שבוע שלם' },
  { value: 'on_time', label: 'שעתי-משימתי — רואה רק משימה שהגיע זמנה' },
];

export default function PlanForm() {
  const { id } = useParams();
  const isEdit = !!id;
  const navigate = useNavigate();

  const [monitored, setMonitored] = useState([]);
  const [plan, setPlan] = useState({
    monitored_id: '', name: '', type: 'meal',
    start_date: today(), end_date: '',
    visibility_mode: 'daily', photo_required: false,
    alert_threshold_minutes: 30, notify_on_completion: false,
    relationship_type: 'family', supervisor_label: 'הורה', monitored_label: 'ילד',
  });
  const [items, setItems] = useState([]);
  const [newItem, setNewItem] = useState({ day_of_week: 0, specific_date: '', scheduled_time: '', item_name: '', quantity: '', mode: 'weekly' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [duplicateDay, setDuplicateDay] = useState(0);

  useEffect(() => {
    api.get('/users/monitored').then(r => setMonitored(r.data));
    if (isEdit) {
      api.get(`/plans/${id}`).then(r => {
        const p = r.data;
        setPlan({
          monitored_id: p.monitored_id, name: p.name, type: p.type,
          start_date: p.start_date?.slice(0, 10), end_date: p.end_date?.slice(0, 10),
          visibility_mode: p.visibility_mode, photo_required: p.photo_required,
          alert_threshold_minutes: p.alert_threshold_minutes, notify_on_completion: p.notify_on_completion,
          relationship_type: p.relationship_type || 'family',
          supervisor_label: p.supervisor_label || 'הורה',
          monitored_label: p.monitored_label || 'ילד',
        });
      });
      api.get(`/plans/${id}/items`).then(r => setItems(r.data));
    }
  }, [id]);

  async function savePlan(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      let savedPlan;
      if (isEdit) {
        const { data } = await api.put(`/plans/${id}`, plan);
        savedPlan = data;
      } else {
        const { data } = await api.post('/plans', plan);
        savedPlan = data;
      }
      navigate(`/supervisor/plans/${savedPlan.id}`);
    } catch (err) {
      setError(err.response?.data?.error || 'שגיאה בשמירה');
    } finally {
      setLoading(false);
    }
  }

  async function addItem() {
    if (!newItem.scheduled_time || !newItem.item_name) return;
    const payload = {
      scheduled_time: newItem.scheduled_time,
      item_name: newItem.item_name,
      quantity: newItem.quantity || null,
      day_of_week: newItem.mode === 'weekly' ? parseInt(newItem.day_of_week) : null,
      specific_date: newItem.mode === 'specific' ? newItem.specific_date : null,
    };
    const planId = id;
    if (!planId) return;
    const { data } = await api.post(`/plans/${planId}/items`, payload);
    setItems(p => [...p, data]);
    setNewItem(p => ({ ...p, scheduled_time: '', item_name: '', quantity: '' }));
  }

  async function deleteItem(itemId) {
    await api.delete(`/plans/${id}/items/${itemId}`);
    setItems(p => p.filter(i => i.id !== itemId));
  }

  async function duplicateDayToWeek() {
    const { data } = await api.post(`/plans/${id}/items/duplicate-day`, { source_day: duplicateDay });
    api.get(`/plans/${id}/items`).then(r => setItems(r.data));
  }

  return (
    <SupervisorLayout title={isEdit ? 'עריכת לוח' : 'לוח חדש'} back="/supervisor">
      <div className="page">
        {error && <div className="alert alert-error">{error}</div>}

        <form onSubmit={savePlan}>
          <div className="card" style={{ marginBottom: 16 }}>
            <h2 style={{ fontWeight: 700, marginBottom: 16, fontSize: '1rem' }}>פרטי הלוח</h2>

            <div className="form-group">
              <label>שם הלוח</label>
              <input value={plan.name} onChange={e => setPlan(p => ({ ...p, name: e.target.value }))}
                placeholder='לדוגמה: "תפריט של דני"' required />
            </div>

            <div className="form-group">
              <label>משתתף</label>
              <select value={plan.monitored_id} onChange={e => setPlan(p => ({ ...p, monitored_id: e.target.value }))} required disabled={isEdit}>
                <option value="">בחר משתתף</option>
                {monitored.filter(m => m.id).map(m => <option key={m.id} value={m.id}>{m.display_name}</option>)}
              </select>
            </div>

            <div className="form-group">
              <label>סוג קשר</label>
              <select
                value={plan.relationship_type}
                onChange={e => {
                  const rel = RELATIONSHIPS.find(r => r.value === e.target.value);
                  setPlan(p => ({
                    ...p,
                    relationship_type: rel.value,
                    supervisor_label: rel.supervisor_label || p.supervisor_label,
                    monitored_label: rel.monitored_label || p.monitored_label,
                  }));
                }}
              >
                <option value="family">הורה / ילד</option>
                <option value="health">מטפל / מטופל</option>
                <option value="coach">מאמן / ספורטאי</option>
                <option value="education">מורה / תלמיד</option>
                <option value="custom">מותאם אישית</option>
              </select>
            </div>

            {plan.relationship_type === 'custom' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>תפקיד המנהל</label>
                  <input value={plan.supervisor_label}
                    onChange={e => setPlan(p => ({ ...p, supervisor_label: e.target.value }))}
                    placeholder='לדוגמה: "דיאטנית"' />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>תפקיד המשתתף</label>
                  <input value={plan.monitored_label}
                    onChange={e => setPlan(p => ({ ...p, monitored_label: e.target.value }))}
                    placeholder='לדוגמה: "מטופל"' />
                </div>
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>תאריך התחלה</label>
                <input type="date" value={plan.start_date} onChange={e => setPlan(p => ({ ...p, start_date: e.target.value }))} required />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>תאריך סיום</label>
                <input type="date" value={plan.end_date} onChange={e => setPlan(p => ({ ...p, end_date: e.target.value }))} required />
              </div>
            </div>
          </div>

          <div className="card" style={{ marginBottom: 16 }}>
            <h2 style={{ fontWeight: 700, marginBottom: 16, fontSize: '1rem' }}>הגדרות תצוגה והתראות</h2>

            <div className="form-group">
              <label>מצב חשיפה למבוקר</label>
              <select value={plan.visibility_mode} onChange={e => setPlan(p => ({ ...p, visibility_mode: e.target.value }))}>
                {VISIBILITY.map(v => <option key={v.value} value={v.value}>{v.label}</option>)}
              </select>
            </div>

            <div className="form-group">
              <label>זמן המתנה לפני התראת פספוס (דקות)</label>
              <input type="number" min="1" max="1440" value={plan.alert_threshold_minutes}
                onChange={e => setPlan(p => ({ ...p, alert_threshold_minutes: parseInt(e.target.value) }))} />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontWeight: 400, marginBottom: 0 }}>
                <input type="checkbox" checked={plan.photo_required}
                  onChange={e => setPlan(p => ({ ...p, photo_required: e.target.checked }))}
                  style={{ width: 18, height: 18 }} />
                <span>חובת צילום בסימון ביצוע</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontWeight: 400, marginBottom: 0 }}>
                <input type="checkbox" checked={plan.notify_on_completion}
                  onChange={e => setPlan(p => ({ ...p, notify_on_completion: e.target.checked }))}
                  style={{ width: 18, height: 18 }} />
                <span>התראה בזמן אמת על כל ביצוע</span>
              </label>
            </div>
          </div>

          <button type="submit" className="btn btn-primary btn-full" disabled={loading}>
            {loading ? 'שומר...' : (isEdit ? 'שמור שינויים' : 'צור לוח')}
          </button>
        </form>

        {/* שורות תפריט — רק בעריכה */}
        {isEdit && (
          <>
            <hr className="divider" />
            <h2 style={{ fontWeight: 700, marginBottom: 16, fontSize: '1rem' }}>שורות תפריט</h2>

            {/* הוספת שורה */}
            <div className="card" style={{ marginBottom: 16 }}>
              <h3 style={{ fontWeight: 600, marginBottom: 12, fontSize: '0.9rem' }}>הוסף שורה</h3>

              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                <button type="button" className={`btn btn-sm ${newItem.mode === 'weekly' ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setNewItem(p => ({ ...p, mode: 'weekly' }))}>שבועי</button>
                <button type="button" className={`btn btn-sm ${newItem.mode === 'specific' ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setNewItem(p => ({ ...p, mode: 'specific' }))}>תאריך ספציפי</button>
              </div>

              {newItem.mode === 'weekly' ? (
                <div className="form-group">
                  <label>יום בשבוע</label>
                  <div className="day-selector">
                    {DAYS.map(d => (
                      <button type="button" key={d} className={`day-btn ${newItem.day_of_week === d ? 'selected' : ''}`}
                        onClick={() => setNewItem(p => ({ ...p, day_of_week: d }))}>
                        {DAY_LABELS[d]}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="form-group">
                  <label>תאריך</label>
                  <input type="date" value={newItem.specific_date}
                    onChange={e => setNewItem(p => ({ ...p, specific_date: e.target.value }))} />
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>שעה</label>
                  <input type="time" value={newItem.scheduled_time}
                    onChange={e => setNewItem(p => ({ ...p, scheduled_time: e.target.value }))} />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>כמות</label>
                  <input value={newItem.quantity} onChange={e => setNewItem(p => ({ ...p, quantity: e.target.value }))}
                    placeholder='למשל: "כוס"' />
                </div>
              </div>
              <div className="form-group" style={{ marginTop: 12 }}>
                <label>פריט / מאכל</label>
                <input value={newItem.item_name} onChange={e => setNewItem(p => ({ ...p, item_name: e.target.value }))}
                  placeholder='לדוגמה: "יוגורט"' />
              </div>
              <button type="button" className="btn btn-primary btn-full" onClick={addItem}>+ הוסף שורה</button>
            </div>

            {/* שכפול יום */}
            <div className="card" style={{ marginBottom: 16 }}>
              <h3 style={{ fontWeight: 600, marginBottom: 12, fontSize: '0.9rem' }}>שכפל יום לכל השבוע</h3>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <select value={duplicateDay} onChange={e => setDuplicateDay(parseInt(e.target.value))} style={{ flex: 1 }}>
                  {DAYS.map(d => <option key={d} value={d}>{DAY_LABELS[d]}</option>)}
                </select>
                <button type="button" className="btn btn-secondary" onClick={duplicateDayToWeek}>שכפל</button>
              </div>
            </div>

            {/* רשימת שורות לפי יום */}
            {groupByDay(items).map(([dayKey, dayItems]) => (
              <div key={dayKey} className="time-group">
                <div className="time-group-header">{dayKey}</div>
                {dayItems.map(item => (
                  <div key={item.id} className="plan-row">
                    <span className="plan-row-time">{formatTime(item.scheduled_time)}</span>
                    <div className="plan-row-info">
                      <div className="plan-row-name">{item.item_name}</div>
                      {item.quantity && <div className="plan-row-qty">{item.quantity}</div>}
                    </div>
                    <button type="button" className="btn btn-ghost btn-sm" style={{ color: 'var(--red)' }}
                      onClick={() => deleteItem(item.id)}>מחק</button>
                  </div>
                ))}
              </div>
            ))}
          </>
        )}
      </div>
    </SupervisorLayout>
  );
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function groupByDay(items) {
  const DAY_LABELS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
  const groups = {};
  for (const item of items) {
    const key = item.day_of_week != null
      ? DAY_LABELS[item.day_of_week]
      : item.specific_date?.slice(0, 10) || '?';
    if (!groups[key]) groups[key] = [];
    groups[key].push(item);
  }
  return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b, 'he'));
}
