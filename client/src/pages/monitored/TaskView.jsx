import { useState, useEffect, useRef } from 'react';
import api from '../../api/client';
import { useAuth } from '../../hooks/useAuth';
import { usePush } from '../../hooks/usePush';
import { MonitoredLayout, StatusBadge } from '../../components/Layout';

const DAY_LABELS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

export default function TaskView() {
  const { user } = useAuth();
  const { permission, requestPermission } = usePush();
  const [plans, setPlans] = useState([]);
  const [allItems, setAllItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeItem, setActiveItem] = useState(null); // item that action sheet is open for
  const [replaceText, setReplaceText] = useState('');
  const [photo, setPhoto] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const photoRef = useRef();

  const today = new Date().toISOString().slice(0, 10);
  const now = new Date();
  const currentTime = now.toTimeString().slice(0, 5);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
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

    // ensure completions exist
    const ensurePromises = results.map(async (item) => {
      if (!item.completion_id) {
        const { data } = await api.post(`/plans/${item.plan.id}/completions/ensure`, {
          plan_item_id: item.id,
          date: item.date || today,
        });
        return { ...item, completion_id: data.id, status: data.status };
      }
      return item;
    });
    const resolved = await Promise.all(ensurePromises);
    setAllItems(resolved);
    setLoading(false);
  }

  function visibleItems(plan, items) {
    const planItems = items.filter(i => i.plan.id === plan.id);
    if (plan.visibility_mode === 'on_time') {
      return planItems.filter(i => {
        const t = i.scheduled_time?.slice(0, 5);
        return t <= currentTime || i.status === 'done' || i.status === 'replaced';
      });
    }
    return planItems;
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
      i.completion_id === item.completion_id ? { ...i, status: data.status, replaced_with: data.replaced_with, photo_url: data.photo_url } : i
    ));
  }

  function openSheet(item) {
    setActiveItem(item);
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

  const [sheetMode, setSheetMode] = useState('main'); // main | replace

  function openReplace() { setSheetMode('replace'); }
  function openMain(item) { setSheetMode('main'); openSheet(item); }

  // Group all items chronologically across plans
  const sortedItems = [...allItems].sort((a, b) => {
    const ta = (a.date || today) + (a.scheduled_time || '');
    const tb = (b.date || today) + (b.scheduled_time || '');
    return ta.localeCompare(tb);
  });

  return (
    <MonitoredLayout title="התפריט שלי">
      <div className="page">
        {/* Push prompt */}
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

        {loading && <div className="spinner" />}

        {!loading && sortedItems.length === 0 && (
          <div className="empty-state">
            <p style={{ fontSize: '2rem', marginBottom: 8 }}>🥗</p>
            <p>אין משימות להיום</p>
          </div>
        )}

        {sortedItems.map((item, idx) => {
          // show plan name if multiple plans
          const showPlanLabel = plans.length > 1;
          const isCompleted = item.status === 'done' || item.status === 'replaced';
          const isMissed = item.status === 'missed';
          const dateLabel = item.date && item.date !== today
            ? new Date(item.date + 'T12:00:00').toLocaleDateString('he-IL', { weekday: 'short', day: 'numeric', month: 'numeric' })
            : null;

          return (
            <div key={`${item.completion_id || idx}`}
              className="plan-row"
              style={{ opacity: isMissed ? 0.55 : 1 }}>
              <div>
                <div className="plan-row-time">{item.scheduled_time?.slice(0, 5)}</div>
                {dateLabel && <div style={{ fontSize: '0.7rem', color: 'var(--gray-400)' }}>{dateLabel}</div>}
              </div>
              <div className="plan-row-info">
                <div className="plan-row-name">{item.item_name}</div>
                {item.quantity && <div className="plan-row-qty">{item.quantity}</div>}
                {showPlanLabel && (
                  <div style={{ fontSize: '0.75rem', color: 'var(--green)', marginTop: 2 }}>{item.plan.name}</div>
                )}
                {item.status === 'replaced' && item.replaced_with && (
                  <div style={{ fontSize: '0.8rem', color: 'var(--orange)', marginTop: 4 }}>הוחלף ב: {item.replaced_with}</div>
                )}
              </div>
              <div className="plan-row-actions">
                {isCompleted ? (
                  <StatusBadge status={item.status} />
                ) : (
                  <button className="btn btn-primary btn-sm"
                    onClick={() => { openMain(item); setSheetMode('main'); }}>
                    דווח
                  </button>
                )}
              </div>
            </div>
          );
        })}

        {/* Action Sheet */}
        {activeItem && (
          <div className="action-sheet">
            <div className="action-sheet-bg" onClick={closeSheet} />
            <div className="action-sheet-content">
              {error && <div className="alert alert-error" style={{ marginBottom: 12 }}>{error}</div>}

              {sheetMode === 'main' ? (
                <>
                  <h2 className="action-sheet-title">{activeItem.item_name}</h2>
                  {activeItem.quantity && <p style={{ color: 'var(--gray-600)', marginBottom: 16 }}>כמות: {activeItem.quantity}</p>}

                  {activeItem.plan.photo_required && (
                    <div className="alert alert-info" style={{ marginBottom: 12 }}>
                      צילום חובה לדיווח
                    </div>
                  )}

                  {/* photo upload */}
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
                    <button className="btn btn-secondary btn-full" onClick={() => { setSheetMode('replace'); }}>
                      החלפתי משהו אחר
                    </button>
                    <button className="btn btn-ghost btn-full" onClick={closeSheet}>ביטול</button>
                  </div>
                </>
              ) : (
                <>
                  <h2 className="action-sheet-title">מה אכלת במקום?</h2>
                  <div className="form-group">
                    <label>פריט חלופי</label>
                    <input value={replaceText} onChange={e => setReplaceText(e.target.value)}
                      placeholder="תאר מה אכלת בפועל" autoFocus />
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
