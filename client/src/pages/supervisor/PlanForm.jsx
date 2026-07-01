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
  { value: 'on_time', label: 'שעתי-משימתי — רואה רק המשימה הקרובה, מקבל התראה כשמגיע הזמן' },
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
    alert_threshold_minutes: 30, notify_on_completion: false, allow_replacement: true,
    relationship_type: 'family', supervisor_label: 'הורה', monitored_label: 'ילד',
  });
  const [items, setItems] = useState([]);
  const [newItem, setNewItem] = useState({ day_of_week: 0, specific_date: '', scheduled_time: '', item_name: '', quantity: '', mode: 'weekly' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [duplicateDay, setDuplicateDay] = useState(0);
  const [editItem, setEditItem] = useState(null); // { id, scheduled_time, item_name, quantity }
  const [applyDialog, setApplyDialog] = useState(null); // { fromDate, toDate }
  const [ocrDialog, setOcrDialog] = useState(null); // null | 'loading' | { meals, selectedDays, checked }
  const [ocrImporting, setOcrImporting] = useState(false);

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
          allow_replacement: p.allow_replacement ?? true,
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

  async function handleOcrUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setOcrDialog('loading');
    setError('');
    try {
      const formData = new FormData();
      formData.append('image', file);
      const { data } = await api.post('/ocr/scan', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const meals = data.meals || [];
      // מבנה checked: Set של מפתחות "mealIndex-itemIndex"
      const checked = new Set();
      meals.forEach((meal, mi) => meal.items.forEach((_, ii) => checked.add(`${mi}-${ii}`)));
      setOcrDialog({ meals, selectedDays: [0,1,2,3,4,5,6], checked });
    } catch (err) {
      setError(err.response?.data?.error || 'שגיאה בניתוח התמונה');
      setOcrDialog(null);
    }
  }

  async function importOcrItems() {
    if (!ocrDialog || ocrDialog === 'loading' || ocrImporting) return;
    const { meals, selectedDays, checked } = ocrDialog;
    setOcrImporting(true);
    try {
      for (const day of selectedDays) {
        for (let mi = 0; mi < meals.length; mi++) {
          const meal = meals[mi];
          for (let ii = 0; ii < meal.items.length; ii++) {
            if (!checked.has(`${mi}-${ii}`)) continue;
            const item = meal.items[ii];
            await api.post(`/plans/${id}/items`, {
              scheduled_time: meal.time,
              item_name: item.item_name,
              quantity: item.quantity || null,
              day_of_week: day,
            });
          }
        }
      }
      const { data } = await api.get(`/plans/${id}/items`);
      setItems(data);
      setOcrDialog(null);
    } catch (err) {
      setError('שגיאה בייבוא — ' + (err.response?.data?.error || err.message));
    } finally {
      setOcrImporting(false);
    }
  }

  async function confirmSaveEdit() {
    if (!editItem || !applyDialog) return;
    try {
      const { data } = await api.put(`/plans/${id}/items/${editItem.id}`, {
        scheduled_time: editItem.scheduled_time,
        item_name: editItem.item_name,
        quantity: editItem.quantity || null,
        apply_from_date: applyDialog.fromDate || null,
        apply_to_date: applyDialog.toDate || null,
      });
      setItems(prev => prev.map(i => i.id === editItem.id ? data : i));
      setEditItem(null);
      setApplyDialog(null);
    } catch (err) {
      setError(err.response?.data?.error || 'שגיאה בשמירה');
      setApplyDialog(null);
    }
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
                {monitored.map(m => <option key={m.id} value={m.id}>{m.display_name}{m.is_pending ? ' ⏳' : ''}</option>)}
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
              <label>התראת אי-ביצוע — כמה דקות אחרי השעה הנקבעת</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="number" min="1" max="1440" value={plan.alert_threshold_minutes}
                  onChange={e => setPlan(p => ({ ...p, alert_threshold_minutes: parseInt(e.target.value) }))}
                  style={{ width: 80 }} />
                <span style={{ color: 'var(--gray-600)', fontSize: '0.85rem' }}>דקות (אם לא דווח — תשלח אליך התראה)</span>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <Toggle
                checked={!!plan.photo_required}
                onChange={v => setPlan(p => ({ ...p, photo_required: v }))}
                label="חובת צילום בסימון ביצוע"
                sub="המשתתף חייב לצלם לפני שמסמן ביצוע"
              />
              <Toggle
                checked={!!plan.notify_on_completion}
                onChange={v => setPlan(p => ({ ...p, notify_on_completion: v }))}
                label="קבל התראה על כל ביצוע"
                sub="תקבל Push כשהמשתתף מסמן משימה כבוצעה"
              />
              <Toggle
                checked={plan.allow_replacement !== false}
                onChange={v => setPlan(p => ({ ...p, allow_replacement: v }))}
                label="אפשר החלפה בדיווח"
                sub="המשתתף יכול לדווח שאכל משהו אחר במקום הפריט"
              />
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h2 style={{ fontWeight: 700, fontSize: '1rem', marginBottom: 0 }}>שורות תפריט</h2>
              <label style={{
                display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer',
                background: 'var(--green)', color: '#fff', borderRadius: 8,
                padding: '7px 14px', fontSize: '0.85rem', fontWeight: 600,
              }}>
                📷 יבוא מתמונה
                <input type="file" accept="image/*" capture="environment"
                  style={{ display: 'none' }} onChange={handleOcrUpload} />
              </label>
            </div>

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
                  editItem?.id === item.id ? (
                    <div key={item.id} style={{ padding: '10px 12px', background: 'var(--gray-50)', borderBottom: '1px solid var(--gray-200)' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr', gap: 8, marginBottom: 8 }}>
                        <input type="time" value={editItem.scheduled_time}
                          onChange={e => setEditItem(p => ({ ...p, scheduled_time: e.target.value }))}
                          style={{ fontSize: '0.9rem' }} />
                        <input value={editItem.item_name}
                          onChange={e => setEditItem(p => ({ ...p, item_name: e.target.value }))}
                          placeholder="שם הפריט" style={{ fontSize: '0.9rem' }} />
                      </div>
                      <input value={editItem.quantity || ''} placeholder="כמות (רשות)"
                        onChange={e => setEditItem(p => ({ ...p, quantity: e.target.value }))}
                        style={{ fontSize: '0.9rem', width: '100%', marginBottom: 8, boxSizing: 'border-box' }} />
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button type="button" className="btn btn-primary btn-sm"
                          onClick={() => setApplyDialog({ fromDate: today(), toDate: '' })}>שמור</button>
                        <button type="button" className="btn btn-ghost btn-sm"
                          onClick={() => setEditItem(null)}>ביטול</button>
                      </div>
                    </div>
                  ) : (
                    <div key={item.id} className="plan-row">
                      <span className="plan-row-time">{formatTime(item.scheduled_time)}</span>
                      <div className="plan-row-info">
                        <div className="plan-row-name">{item.item_name}</div>
                        {item.quantity && <div className="plan-row-qty">{item.quantity}</div>}
                      </div>
                      <button type="button" className="btn btn-ghost btn-sm"
                        onClick={() => setEditItem({
                          id: item.id,
                          scheduled_time: item.scheduled_time?.slice(0, 5) || '',
                          item_name: item.item_name,
                          quantity: item.quantity || '',
                        })}>ערוך</button>
                      <button type="button" className="btn btn-ghost btn-sm" style={{ color: 'var(--red)' }}
                        onClick={() => deleteItem(item.id)}>מחק</button>
                    </div>
                  )
                ))}
              </div>
            ))}
          </>
        )}
      </div>

      {/* דיאלוג OCR */}
      {ocrDialog && (
        <div className="action-sheet">
          <div className="action-sheet-bg" onClick={() => !ocrImporting && setOcrDialog(null)} />
          <div className="action-sheet-content" style={{ maxHeight: '85vh', overflowY: 'auto' }}>

            {ocrDialog === 'loading' ? (
              <div style={{ textAlign: 'center', padding: '32px 0' }}>
                <div className="spinner" />
                <p style={{ marginTop: 16, color: 'var(--gray-600)', fontSize: '0.9rem' }}>
                  Claude מנתח את התמונה...
                </p>
              </div>
            ) : (
              <>
                <h2 className="action-sheet-title">תוצאות ניתוח תמונה</h2>

                {/* בחירת ימים */}
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--gray-600)', marginBottom: 8 }}>
                    החל לימים:
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {['א','ב','ג','ד','ה','ו','ש'].map((d, i) => {
                      const sel = ocrDialog.selectedDays?.includes(i);
                      return (
                        <button key={i} type="button"
                          onClick={() => setOcrDialog(prev => ({
                            ...prev,
                            selectedDays: sel
                              ? prev.selectedDays.filter(x => x !== i)
                              : [...prev.selectedDays, i],
                          }))}
                          style={{
                            width: 36, height: 36, borderRadius: '50%', border: 'none',
                            background: sel ? 'var(--green)' : 'var(--gray-200)',
                            color: sel ? '#fff' : 'var(--gray-600)',
                            fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer',
                          }}>
                          {d}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* רשימת ארוחות שנחלצו */}
                {ocrDialog.meals?.map((meal, mi) => (
                  <div key={mi} style={{ marginBottom: 12 }}>
                    <div style={{
                      fontWeight: 700, fontSize: '0.85rem', color: 'var(--green)',
                      marginBottom: 6, borderBottom: '1px solid var(--gray-200)', paddingBottom: 4,
                    }}>
                      🕐 {meal.time}
                    </div>
                    {meal.items.map((item, ii) => {
                      const key = `${mi}-${ii}`;
                      const isChecked = ocrDialog.checked?.has(key);
                      return (
                        <div key={ii} style={{
                          display: 'flex', alignItems: 'center', gap: 10,
                          padding: '6px 4px', opacity: isChecked ? 1 : 0.45,
                        }}>
                          <input type="checkbox" checked={!!isChecked}
                            onChange={() => setOcrDialog(prev => {
                              const next = new Set(prev.checked);
                              next.has(key) ? next.delete(key) : next.add(key);
                              return { ...prev, checked: next };
                            })}
                            style={{ width: 18, height: 18, flexShrink: 0, cursor: 'pointer' }} />
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: '0.88rem', fontWeight: 600 }}>{item.item_name}</div>
                            {item.quantity && (
                              <div style={{ fontSize: '0.74rem', color: 'var(--gray-600)' }}>{item.quantity}</div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}

                <div style={{ display: 'flex', gap: 8, marginTop: 16, position: 'sticky', bottom: 0, background: '#fff', paddingTop: 8 }}>
                  <button className="btn btn-primary" style={{ flex: 1 }}
                    disabled={ocrImporting || !ocrDialog.selectedDays?.length || !ocrDialog.checked?.size}
                    onClick={importOcrItems}>
                    {ocrImporting
                      ? 'מייבא...'
                      : `הוסף לתפריט (${ocrDialog.checked?.size || 0} פריטים × ${ocrDialog.selectedDays?.length || 0} ימים)`}
                  </button>
                  <button className="btn btn-ghost" style={{ flex: 0.4 }}
                    disabled={ocrImporting} onClick={() => setOcrDialog(null)}>
                    ביטול
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* דיאלוג: מאיזה תאריך להחיל שינויים */}
      {applyDialog && (
        <div className="action-sheet">
          <div className="action-sheet-bg" onClick={() => setApplyDialog(null)} />
          <div className="action-sheet-content">
            <h2 className="action-sheet-title">החל שינויים מתאריך</h2>
            <p style={{ color: 'var(--gray-600)', fontSize: '0.85rem', marginBottom: 16 }}>
              ביצועים ממתינים בטווח שתבחר יימחקו ויטענו מחדש עם הנתונים המעודכנים.
            </p>
            <div className="form-group">
              <label>מתאריך</label>
              <input type="date" value={applyDialog.fromDate}
                onChange={e => setApplyDialog(p => ({ ...p, fromDate: e.target.value }))} />
            </div>
            <div className="form-group">
              <label>עד תאריך <span style={{ color: 'var(--gray-400)', fontWeight: 400 }}>(ריק = עד סוף הלוח)</span></label>
              <input type="date" value={applyDialog.toDate || ''}
                onChange={e => setApplyDialog(p => ({ ...p, toDate: e.target.value || '' }))} />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-primary" style={{ flex: 1 }}
                onClick={confirmSaveEdit}>אשר ושמור</button>
              <button className="btn btn-ghost" style={{ flex: 1 }}
                onClick={() => setApplyDialog(null)}>ביטול</button>
            </div>
          </div>
        </div>
      )}
    </SupervisorLayout>
  );
}

function Toggle({ checked, onChange, label, sub }) {
  return (
    <div
      onClick={() => onChange(!checked)}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 0',
        cursor: 'pointer',
        borderBottom: '1px solid var(--gray-100)',
      }}
    >
      <div style={{ flex: 1, paddingLeft: 12 }}>
        <div style={{ fontWeight: 500, fontSize: '0.9rem' }}>{label}</div>
        {sub && <div style={{ fontSize: '0.78rem', color: 'var(--gray-500)', marginTop: 2 }}>{sub}</div>}
      </div>
      <div style={{
        width: 44,
        height: 26,
        borderRadius: 13,
        background: checked ? 'var(--green)' : 'var(--gray-300)',
        position: 'relative',
        flexShrink: 0,
        transition: 'background 0.2s',
      }}>
        <div style={{
          width: 20,
          height: 20,
          borderRadius: '50%',
          background: '#fff',
          position: 'absolute',
          top: 3,
          right: checked ? 3 : 21,
          transition: 'right 0.2s',
          boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
        }} />
      </div>
    </div>
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
