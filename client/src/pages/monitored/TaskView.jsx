import { useState, useEffect, useRef } from 'react';
import api from '../../api/client';
import { useAuth } from '../../hooks/useAuth';
import { usePush } from '../../hooks/usePush';
import { MonitoredLayout, StatusBadge } from '../../components/Layout';

export default function TaskView() {
  const { user } = useAuth();
  const { permission, requestPermission } = usePush();
  const [plans, setPlans] = useState([]);
  const [allItems, setAllItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeItem, setActiveItem] = useState(null);
  const [replaceText, setReplaceText] = useState('');
  const [photo, setPhoto] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [sheetMode, setSheetMode] = useState('main');
  const photoRef = useRef();

  const today = new Date().toISOString().slice(0, 10);
  const now = new Date();
  const currentTime = now.toTimeString().slice(0, 5);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    setError('');
    try {
      const { data: plansData } = await api.get('/plans/my');
      setPlans(plansData);

      const results = [];
      for (const plan of plansData) {
        if (plan.visibility_mode === 'weekly') {
          const weekStart = getWeekStart(today);
          const { data } = await api.get(`/plans/${plan.id}/completions/week?start_date=${weekStart}`);
          data.forEach(i => results.push({ ...i, plan }));
        } else {
          const { data } = await api.get(`/plans/${plan.id}/completions/by-date?date=${today}`);
          data.forEach(i => results.push({ ...i, plan }));
        }
      }

      const ensurePromises = results.map(async (item) => {
        if (!item.completion_id) {
          try {
            const { data } = await api.post(`/plans/${item.plan.id}/completions/ensure`, {
              plan_item_id: item.id,
              date: item.date || today,
            });
            return { ...item, completion_id: data.id, status: data.status };
          } catch {
            return item;
          }
        }
        return item;
      });
      const resolved = await Promise.all(ensurePromises);
      setAllItems(resolved);
    } catch (err) {
      setError('שגיאה בטעינת הנתונים — נסה לרענן');
    } finally {
      setLoading(false);
    }
  }

  function visibleItems(items) {
    return items.filter(i => {
      if (i.plan.visibility_mode !== 'on_time') return true;
      const t = i.scheduled_time?.slice(0, 5);
      return t <= currentTime || i.status === 'done' || i.status === 'replaced';
    });
  }

  async function submitDone(item) {
    if (!item.completion_id) return;
    setSubmitting(true);
    setError('');
    try {
      const formData = new FormData();
      if (photo) formData.append('photo', photo);
      const { data } = await api.post(
        `/plans/${item.plan.id}/completions/${item.completion_id}/done`,
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } }
      );
      updateItem(item, data);
      closeSheet();
    } catch (err) {
      setError(err.response?.data?.error || 'שגיאה');
    } finally {
      setSubmitting(false);
    }
  }

  async function submitReplace(item) {
    if (!replaceText.trim() || !item.completion_id) return;
    setSubmitting(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('replaced_with', replaceText);
      if (photo) formData.append('photo', photo);
      const { data } = await api.post(
        `/plans/${item.plan.id}/completions/${item.completion_id}/replace`,
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } }
      );
      updateItem(item, data);
      closeSheet();
    } catch (err) {
      setError(err.response?.data?.error || 'שגיאה');
    } finally {
      setSubmitting(false);
    }
  }

  function updateItem(item, data) {
    setAllItems(prev => prev.map(i =>
      i.completion_id === item.completion_id
        ? { ...i, status: data.status, replaced_with: data.replaced_with, photo_url: data.photo_url }
        : i
    ));
  }

  function openSheet(item) {
    setActiveItem(item);
    setSheetMode('main');
    setReplaceText('');
    setPhoto(null);
    setError('');
  }

  function closeSheet() {
    setActiveItem(null);
    setReplaceText('');
    setPhoto(null);
    setError('');
  }

  // group visible items by date+time slot
  const visible = visibleItems(allItems);
  const grouped = {};
  for (const item of visible) {
    const dateKey = item.date || today;
    const timeKey = item.scheduled_time?.slice(0, 5) || '00:00';
    const key = `${dateKey}__${timeKey}`;
    if (!grouped[key]) grouped[key] = { date: dateKey, time: timeKey, items: [] };
    grouped[key].items.push(item);
  }
  const slots = Object.values(grouped).sort((a, b) =>
    (a.date + a.time).localeCompare(b.date + b.time)
  );

  const showPlanLabel = plans.length > 1;

  return (
    <MonitoredLayout title="התפריט שלי">
      <div className="page">
        {permission !== 'granted' && (
          <div className="push-banner">
            <p>הפעל התראות כדי לקבל תזכורות לארוחות</p>
            <button className="btn btn-primary btn-sm" onClick={requestPermission}>הפעל</button>
          </div>
        )}

        <div style={{ marginBottom: 16 }}>
          <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>שלום, {user?.display_name} 👋</div>
          <div style={{ color: 'var(--gray-600)', fontSize: '0.85rem' }}>
            {new Date().toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' })}
          </div>
        </div>

        {error && (
          <div className="alert alert-error" style={{ marginBottom: 16 }}>
            {error}
            <button className="btn btn-ghost btn-sm" style={{ marginRight: 8 }} onClick={loadData}>רענן</button>
          </div>
        )}

        {loading && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
            <div className="spinner" />
          </div>
        )}

        {!loading && !error && slots.length === 0 && (
          <div className="empty-state">
            <p style={{ fontSize: '2rem', marginBottom: 8 }}>🥗</p>
            <p>אין משימות להיום</p>
          </div>
        )}

        {!loading && !error && slots.length > 0 && (
          <>
            {/* Column headers */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 8,
              padding: '6px 12px',
              marginBottom: 8,
              background: 'var(--gray-100)',
              borderRadius: 8,
              fontSize: '0.78rem',
              fontWeight: 700,
              color: 'var(--gray-600)',
            }}>
              <div>תכנון</div>
              <div>ביצוע</div>
            </div>

            {slots.map(slot => {
              const dateLabel = slot.date !== today
                ? new Date(slot.date + 'T12:00:00').toLocaleDateString('he-IL', { weekday: 'short', day: 'numeric', month: 'numeric' })
                : null;

              return (
                <div key={`${slot.date}__${slot.time}`} style={{ marginBottom: 16 }}>
                  {/* Time slot header */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, paddingRight: 4 }}>
                    <span style={{ fontWeight: 700, color: 'var(--green)', fontSize: '0.95rem' }}>{slot.time}</span>
                    {dateLabel && <span style={{ fontSize: '0.75rem', color: 'var(--gray-400)' }}>{dateLabel}</span>}
                  </div>

                  {slot.items.map((item, idx) => {
                    const isCompleted = item.status === 'done' || item.status === 'replaced';
                    const isMissed = item.status === 'missed';

                    return (
                      <div key={item.completion_id || idx} style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr',
                        gap: 8,
                        padding: '8px 12px',
                        marginBottom: 4,
                        background: isMissed ? 'var(--gray-50)' : 'var(--white)',
                        borderRadius: 8,
                        border: '1px solid var(--gray-200)',
                        opacity: isMissed ? 0.55 : 1,
                        alignItems: 'center',
                      }}>
                        {/* תכנון */}
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                          <span style={{ fontSize: '1.4rem', lineHeight: 1, flexShrink: 0, marginTop: 1 }}>
                            {foodEmoji(item.item_name)}
                          </span>
                          <div>
                            <div style={{ fontWeight: 600, fontSize: '0.9rem', lineHeight: 1.3 }}>{item.item_name}</div>
                            {item.quantity && (
                              <div style={{ fontSize: '0.75rem', color: 'var(--gray-500)', marginTop: 2 }}>{item.quantity}</div>
                            )}
                            {showPlanLabel && (
                              <div style={{ fontSize: '0.7rem', color: 'var(--green)', marginTop: 2 }}>{item.plan.name}</div>
                            )}
                          </div>
                        </div>

                        {/* ביצוע */}
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
                          {isCompleted ? (
                            <>
                              <StatusBadge status={item.status} />
                              {item.status === 'replaced' && item.replaced_with && (
                                <div style={{ fontSize: '0.75rem', color: 'var(--orange)' }}>
                                  במקום: {item.replaced_with}
                                </div>
                              )}
                              {item.photo_url && (
                                <img src={item.photo_url} alt="תמונה"
                                  style={{ width: 40, height: 40, borderRadius: 4, objectFit: 'cover', marginTop: 2 }} />
                              )}
                            </>
                          ) : (
                            <button
                              className="btn btn-primary btn-sm"
                              onClick={() => openSheet(item)}
                              style={{ fontSize: '0.8rem', padding: '4px 12px' }}
                            >
                              דווח
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </>
        )}

        {/* Action Sheet */}
        {activeItem && (
          <div className="action-sheet">
            <div className="action-sheet-bg" onClick={closeSheet} />
            <div className="action-sheet-content">
              {error && <div className="alert alert-error" style={{ marginBottom: 12 }}>{error}</div>}

              {sheetMode === 'main' ? (
                <>
                  <h2 className="action-sheet-title">{activeItem.item_name}</h2>
                  {activeItem.quantity && (
                    <p style={{ color: 'var(--gray-600)', marginBottom: 16 }}>כמות: {activeItem.quantity}</p>
                  )}
                  {activeItem.plan.photo_required && (
                    <div className="alert alert-info" style={{ marginBottom: 12 }}>צילום חובה לדיווח</div>
                  )}
                  <div className="form-group">
                    <label>{activeItem.plan.photo_required ? 'תמונה (חובה)' : 'תמונה (רשות)'}</label>
                    <input type="file" accept="image/*" capture="environment" ref={photoRef}
                      onChange={e => setPhoto(e.target.files[0])} />
                    {photo && <div style={{ fontSize: '0.8rem', color: 'var(--green)', marginTop: 4 }}>✓ {photo.name}</div>}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <button className="btn btn-primary btn-full" disabled={submitting}
                      onClick={() => submitDone(activeItem)}>
                      ✓ {submitting ? 'שולח...' : 'אכלתי!'}
                    </button>
                    {activeItem.plan.allow_replacement !== false && (
                      <button className="btn btn-secondary btn-full" onClick={() => setSheetMode('replace')}>
                        החלפתי במשהו אחר
                      </button>
                    )}
                    <button className="btn btn-ghost btn-full" onClick={closeSheet}>ביטול</button>
                  </div>
                </>
              ) : (
                <>
                  <h2 className="action-sheet-title">מה אכלת במקום?</h2>
                  <p style={{ color: 'var(--gray-600)', marginBottom: 12, fontSize: '0.9rem' }}>
                    במקום: <strong>{activeItem.item_name}</strong>
                  </p>
                  <div className="form-group">
                    <label>מה אכלת בפועל</label>
                    <input value={replaceText} onChange={e => setReplaceText(e.target.value)}
                      placeholder="לדוגמה: קוטג׳, בננה, לחם מלא..." autoFocus />
                  </div>
                  {activeItem.plan.photo_required && (
                    <div className="form-group">
                      <label>תמונה (חובה)</label>
                      <input type="file" accept="image/*" capture="environment"
                        onChange={e => setPhoto(e.target.files[0])} />
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-secondary btn-full" onClick={() => setSheetMode('main')}>חזרה</button>
                    <button className="btn btn-primary btn-full" disabled={submitting || !replaceText.trim()}
                      onClick={() => submitReplace(activeItem)}>
                      {submitting ? 'שולח...' : 'שמור'}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </MonitoredLayout>
  );
}

function getWeekStart(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  const day = d.getDay();
  d.setDate(d.getDate() - day);
  return d.toISOString().slice(0, 10);
}

const FOOD_EMOJIS = [
  { keys: ['ביצה', 'ביצים'], emoji: '🥚' },
  { keys: ['גבינה'], emoji: '🧀' },
  { keys: ['חלב'], emoji: '🥛' },
  { keys: ['יוגורט'], emoji: '🫙' },
  { keys: ['לחם', 'פרוסה', 'לחמנייה', 'פיתה', 'טוסט'], emoji: '🍞' },
  { keys: ['אורז'], emoji: '🍚' },
  { keys: ['פסטה', 'ספגטי', 'מקרוני'], emoji: '🍝' },
  { keys: ['עוף', 'חזה'], emoji: '🍗' },
  { keys: ['בשר', 'סטייק', 'קציצה', 'המבורגר'], emoji: '🥩' },
  { keys: ['דג', 'טונה', 'סלמון'], emoji: '🐟' },
  { keys: ['ירק', 'סלט', 'מלפפון', 'עגבנייה', 'גזר', 'פלפל', 'חסה'], emoji: '🥗' },
  { keys: ['פרי', 'תפוח', 'בננה', 'תפוז', 'ענבים', 'אבטיח', 'מנגו'], emoji: '🍎' },
  { keys: ['תפוח'], emoji: '🍎' },
  { keys: ['בננה'], emoji: '🍌' },
  { keys: ['תפוז', 'מיץ תפוזים'], emoji: '🍊' },
  { keys: ['מרק'], emoji: '🍲' },
  { keys: ['שוקולד', 'ממתק', 'עוגיה', 'ביסקוויט', 'עוגה'], emoji: '🍪' },
  { keys: ['שיבולת שועל', 'דגני', 'גרנולה'], emoji: '🥣' },
  { keys: ['אגוז', 'שקד', 'בוטן'], emoji: '🥜' },
  { keys: ['מים', 'נוזל'], emoji: '💧' },
  { keys: ['מיץ'], emoji: '🧃' },
  { keys: ['שייק', 'סמות\'י'], emoji: '🥤' },
  { keys: ['קוטג'], emoji: '🥛' },
  { keys: ['חומוס', 'טחינה'], emoji: '🫘' },
  { keys: ['בטטה', 'תפוח אדמה'], emoji: '🥔' },
  { keys: ['אבוקדו'], emoji: '🥑' },
  { keys: ['ביצת', 'חביתה', 'שקשוקה'], emoji: '🍳' },
  { keys: ['פיצה'], emoji: '🍕' },
  { keys: ['כריך', 'סנדוויץ'], emoji: '🥪' },
];

function foodEmoji(name) {
  if (!name) return '🍽️';
  const lower = name.toLowerCase();
  for (const { keys, emoji } of FOOD_EMOJIS) {
    if (keys.some(k => lower.includes(k))) return emoji;
  }
  return '🍽️';
}
