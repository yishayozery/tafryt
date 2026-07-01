import { useState, useEffect, useRef } from 'react';
import api from '../../api/client';
import { useAuth } from '../../hooks/useAuth';
import { usePush } from '../../hooks/usePush';
import { MonitoredLayout, StatusBadge } from '../../components/Layout';

const OPTION_CONFIG = {
  'אפ׳ 1': { label: 'כמו בתפריט', emoji: '🍽️', color: '#2d6a4f' },
  'אפ׳ 2': { label: 'כמו צהריים',  emoji: '🍗',  color: '#e07b39' },
  'אפ׳ 3': { label: 'פיצה ושוקו',  emoji: '🍕',  color: '#9b5de5' },
};

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
  const [selectedOptions, setSelectedOptions] = useState({});
  const [pendingConfirm, setPendingConfirm] = useState(null); // {slotKey, optKey, planId, groups}
  const [optionLoading, setOptionLoading] = useState(false);
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

  function canEditCompletion(item) {
    if (!item.completed_at) return false;
    return (Date.now() - new Date(item.completed_at)) / 60000 <= 60;
  }

  async function confirmOption() {
    if (!pendingConfirm || optionLoading) return;
    const { slotKey, optKey, planId, groups } = pendingConfirm;
    setOptionLoading(true);
    try {
      // ביטול כל האפשרויות האחרות
      for (const [gKey, items] of Object.entries(groups)) {
        if (gKey === optKey) continue;
        for (const item of items) {
          if (item.completion_id && item.status !== 'done' && item.status !== 'replaced' && item.status !== 'cancelled') {
            await api.post(`/plans/${planId}/completions/${item.completion_id}/cancel`);
            setAllItems(prev => prev.map(i => i.completion_id === item.completion_id ? { ...i, status: 'cancelled' } : i));
          }
        }
      }
      // שחזור פריטים של האפשרות הנבחרת (אם שונו בעבר)
      for (const item of (groups[optKey] || [])) {
        if (item.completion_id && item.status === 'cancelled') {
          await api.post(`/plans/${planId}/completions/${item.completion_id}/reactivate`);
          setAllItems(prev => prev.map(i => i.completion_id === item.completion_id ? { ...i, status: 'pending' } : i));
        }
      }
      setSelectedOptions(prev => ({ ...prev, [slotKey]: optKey }));
      setPendingConfirm(null);
    } catch {
      setError('שגיאה בבחירת האפשרות — נסה שוב');
    } finally {
      setOptionLoading(false);
    }
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
              const slotKey = `${slot.date}__${slot.time}`;
              const dateLabel = slot.date !== today
                ? new Date(slot.date + 'T12:00:00').toLocaleDateString('he-IL', { weekday: 'short', day: 'numeric', month: 'numeric' })
                : null;

              // זיהוי slot עם אפשרויות (כגון ערב)
              const isOptionSlot = slot.items.some(i => /^אפ׳\s*\d+/.test(i.quantity || ''));

              if (isOptionSlot) {
                const groups = {};
                for (const item of slot.items) {
                  const match = (item.quantity || '').match(/^(אפ׳\s*\d+)/);
                  const key = match ? match[1].replace(/\s+/, ' ') : 'other';
                  if (!groups[key]) groups[key] = [];
                  groups[key].push(item);
                }

                // Detect confirmed selection from DB state
                const anyGroupAllCancelled = Object.values(groups).some(items =>
                  items.every(i => i.status === 'cancelled')
                );
                const confirmedOpt = anyGroupAllCancelled
                  ? Object.keys(groups).find(gKey => !groups[gKey].every(i => i.status === 'cancelled'))
                  : null;
                const selectedOpt = selectedOptions[slotKey] ?? confirmedOpt ?? null;

                const planId = slot.items[0]?.plan?.id;
                const isPending = pendingConfirm?.slotKey === slotKey;
                const pendingOpt = isPending ? pendingConfirm.optKey : null;
                const canChange = selectedOpt
                  ? !(groups[selectedOpt] || []).some(i => i.status === 'done' || i.status === 'replaced')
                  : false;
                const mode = isPending ? 'selecting' : (selectedOpt ? 'confirmed' : 'selecting');

                return (
                  <div key={slotKey} style={{ marginBottom: 20 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, paddingRight: 4 }}>
                      <span style={{ fontWeight: 700, color: 'var(--green)', fontSize: '0.95rem' }}>{slot.time}</span>
                      {dateLabel && <span style={{ fontSize: '0.75rem', color: 'var(--gray-400)' }}>{dateLabel}</span>}
                      <span style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--gray-800)' }}>ארוחת ערב</span>
                    </div>

                    <div style={{ background: 'var(--gray-50)', borderRadius: 14, padding: 12, border: '1px solid var(--gray-200)' }}>
                      <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--gray-600)', marginBottom: 10, textAlign: 'center' }}>
                        {mode === 'confirmed' ? 'אפשרות ערב' : 'בחר אפשרות לערב'}
                      </div>

                      {mode === 'selecting' && (
                        <>
                          {Object.entries(groups).map(([optKey]) => {
                            const cfg = OPTION_CONFIG[optKey] || { label: optKey, emoji: '🍴', color: 'var(--green)' };
                            const isPendingThis = pendingOpt === optKey;
                            return (
                              <div key={optKey} style={{ marginBottom: 8 }}>
                                <button
                                  onClick={() => setPendingConfirm({ slotKey, optKey, planId, groups })}
                                  style={{
                                    width: '100%', padding: '12px 14px',
                                    border: `2px solid ${isPendingThis ? cfg.color : 'var(--gray-200)'}`,
                                    borderRadius: 10,
                                    background: isPendingThis ? `${cfg.color}12` : '#fff',
                                    display: 'flex', alignItems: 'center', gap: 10,
                                    cursor: 'pointer', transition: 'all 0.15s',
                                  }}
                                >
                                  <span style={{ fontSize: '1.5rem', lineHeight: 1, flexShrink: 0 }}>{cfg.emoji}</span>
                                  <span style={{ flex: 1, textAlign: 'right', fontWeight: 700, fontSize: '0.95rem', color: isPendingThis ? cfg.color : 'var(--gray-800)' }}>
                                    {cfg.label}
                                  </span>
                                  <span style={{
                                    width: 22, height: 22, borderRadius: '50%',
                                    border: `2.5px solid ${isPendingThis ? cfg.color : 'var(--gray-400)'}`,
                                    background: isPendingThis ? cfg.color : 'transparent',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    flexShrink: 0, transition: 'all 0.15s',
                                  }}>
                                    {isPendingThis && <span style={{ color: '#fff', fontSize: '0.65rem', fontWeight: 900 }}>✓</span>}
                                  </span>
                                </button>
                              </div>
                            );
                          })}

                          {isPending && pendingOpt && (() => {
                            const cfg = OPTION_CONFIG[pendingOpt] || { label: pendingOpt, emoji: '🍴', color: 'var(--green)' };
                            return (
                              <div style={{
                                marginTop: 4, padding: '12px 14px', borderRadius: 12,
                                background: `${cfg.color}10`, border: `2px solid ${cfg.color}`,
                              }}>
                                <div style={{ fontWeight: 700, fontSize: '0.9rem', color: cfg.color, marginBottom: 4 }}>
                                  {cfg.emoji} {cfg.label} — לאשר?
                                </div>
                                <div style={{ fontSize: '0.78rem', color: 'var(--gray-600)', marginBottom: 10, lineHeight: 1.5 }}>
                                  {(pendingConfirm.groups[pendingOpt] || []).map(i => i.item_name).join(' · ')}
                                </div>
                                <div style={{ display: 'flex', gap: 8 }}>
                                  <button onClick={confirmOption} disabled={optionLoading} style={{
                                    flex: 1, padding: '9px 0', borderRadius: 8, border: 'none',
                                    background: cfg.color, color: '#fff', fontWeight: 700, fontSize: '0.9rem',
                                    cursor: optionLoading ? 'wait' : 'pointer',
                                  }}>
                                    {optionLoading ? '...' : 'אישור'}
                                  </button>
                                  <button onClick={() => setPendingConfirm(null)} disabled={optionLoading} style={{
                                    flex: 1, padding: '9px 0', borderRadius: 8,
                                    border: '1.5px solid var(--gray-300)', background: '#fff',
                                    fontWeight: 600, fontSize: '0.9rem', cursor: 'pointer', color: 'var(--gray-600)',
                                  }}>
                                    ביטול
                                  </button>
                                </div>
                              </div>
                            );
                          })()}
                        </>
                      )}

                      {mode === 'confirmed' && Object.entries(groups).map(([optKey, optItems]) => {
                        const cfg = OPTION_CONFIG[optKey] || { label: optKey, emoji: '🍴', color: 'var(--green)' };
                        const isSelected = selectedOpt === optKey;

                        if (isSelected) {
                          return (
                            <div key={optKey} style={{ marginBottom: 8 }}>
                              <div style={{
                                padding: '10px 14px',
                                border: `2px solid ${cfg.color}`, borderRadius: '10px 10px 0 0',
                                background: `${cfg.color}12`, display: 'flex', alignItems: 'center', gap: 10,
                              }}>
                                <span style={{ fontSize: '1.5rem', lineHeight: 1, flexShrink: 0 }}>{cfg.emoji}</span>
                                <span style={{ flex: 1, textAlign: 'right', fontWeight: 700, fontSize: '0.95rem', color: cfg.color }}>
                                  {cfg.label}
                                </span>
                                <span style={{
                                  fontSize: '0.72rem', fontWeight: 700, color: '#fff',
                                  background: cfg.color, borderRadius: 20, padding: '2px 8px', flexShrink: 0,
                                }}>נבחר ✓</span>
                              </div>
                              <div style={{
                                border: `2px solid ${cfg.color}`, borderTop: 'none',
                                borderRadius: '0 0 10px 10px', background: '#fff', overflow: 'hidden',
                              }}>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, padding: '5px 12px', background: `${cfg.color}10`, fontSize: '0.72rem', fontWeight: 700, color: cfg.color }}>
                                  <div>תכנון</div><div>ביצוע</div>
                                </div>
                                {optItems.map((item, idx) => {
                                  const isCompleted = item.status === 'done' || item.status === 'replaced';
                                  return (
                                    <div key={item.completion_id || idx} style={{
                                      display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8,
                                      padding: '9px 12px', borderTop: '1px solid var(--gray-100)', alignItems: 'center',
                                    }}>
                                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 7 }}>
                                        <span style={{ fontSize: '1.25rem', lineHeight: 1, flexShrink: 0 }}>{foodEmoji(item.item_name)}</span>
                                        <div style={{ fontWeight: 600, fontSize: '0.85rem', lineHeight: 1.35 }}>{item.item_name}</div>
                                      </div>
                                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                        {isCompleted ? (
                                          <>
                                            <StatusBadge status={item.status} />
                                            {canEditCompletion(item) && (
                                              <button className="btn btn-ghost btn-sm" onClick={() => openSheet(item)}
                                                style={{ fontSize: '0.72rem', padding: '2px 8px', color: 'var(--gray-600)' }}>
                                                ✏️ ערוך
                                              </button>
                                            )}
                                            {item.status === 'replaced' && item.replaced_with && (
                                              <div style={{ fontSize: '0.72rem', color: 'var(--orange)' }}>במקום: {item.replaced_with}</div>
                                            )}
                                          </>
                                        ) : (
                                          <button className="btn btn-primary btn-sm" onClick={() => openSheet(item)}
                                            style={{ fontSize: '0.8rem', padding: '4px 12px', background: cfg.color }}>
                                            דווח
                                          </button>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        }

                        return (
                          <div key={optKey} style={{ marginBottom: 6 }}>
                            <div style={{
                              padding: '9px 14px', border: '1.5px solid var(--gray-200)',
                              borderRadius: 10, background: 'var(--gray-100)',
                              display: 'flex', alignItems: 'center', gap: 10, opacity: 0.65,
                            }}>
                              <span style={{ fontSize: '1.4rem', lineHeight: 1, flexShrink: 0, filter: 'grayscale(1)' }}>{cfg.emoji}</span>
                              <span style={{ flex: 1, textAlign: 'right', fontWeight: 600, fontSize: '0.9rem', color: 'var(--gray-600)' }}>
                                {cfg.label}
                              </span>
                              {canChange ? (
                                <button
                                  onClick={() => setPendingConfirm({ slotKey, optKey, planId, groups })}
                                  style={{
                                    fontSize: '0.72rem', fontWeight: 700, color: cfg.color,
                                    background: 'transparent', border: `1.5px solid ${cfg.color}`,
                                    borderRadius: 16, padding: '3px 8px', cursor: 'pointer',
                                    opacity: 1, flexShrink: 0,
                                  }}
                                >
                                  שנה
                                </button>
                              ) : (
                                <span style={{ fontSize: '0.72rem', color: 'var(--gray-400)', fontWeight: 600, flexShrink: 0 }}>לא נבחר</span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              }

              // רנדור רגיל — לא slot של אפשרויות
              return (
                <div key={slotKey} style={{ marginBottom: 16 }}>
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
                        background: isMissed ? 'var(--gray-50)' : '#fff',
                        borderRadius: 8,
                        border: '1px solid var(--gray-200)',
                        opacity: isMissed ? 0.55 : 1,
                        alignItems: 'center',
                      }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                          <span style={{ fontSize: '1.4rem', lineHeight: 1, flexShrink: 0, marginTop: 1 }}>
                            {foodEmoji(item.item_name)}
                          </span>
                          <div>
                            <div style={{ fontWeight: 600, fontSize: '0.9rem', lineHeight: 1.3 }}>{item.item_name}</div>
                            {item.quantity && (
                              <div style={{ fontSize: '0.75rem', color: 'var(--gray-600)', marginTop: 2 }}>{item.quantity}</div>
                            )}
                            {showPlanLabel && (
                              <div style={{ fontSize: '0.7rem', color: 'var(--green)', marginTop: 2 }}>{item.plan.name}</div>
                            )}
                          </div>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
                          {isCompleted ? (
                            <>
                              <StatusBadge status={item.status} />
                              {canEditCompletion(item) && (
                                <button className="btn btn-ghost btn-sm" onClick={() => openSheet(item)}
                                  style={{ fontSize: '0.72rem', padding: '2px 8px', color: 'var(--gray-600)' }}>
                                  ✏️ ערוך
                                </button>
                              )}
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
