import { useState, useEffect } from 'react';
import api from '../../api/client';
import { SupervisorLayout } from '../../components/Layout';

const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://tafryt-kappa.vercel.app';

export default function MonitoredList() {
  const [monitored, setMonitored] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteForm, setInviteForm] = useState({ monitored_display_name: '', monitored_phone: '' });
  const [phoneError, setPhoneError] = useState('');
  const [inviteLink, setInviteLink] = useState('');
  const [invitePhone, setInvitePhone] = useState('');
  const [copied, setCopied] = useState(false);
  const [inviteError, setInviteError] = useState('');
  const [resetLinks, setResetLinks] = useState({});

  useEffect(() => {
    load();
  }, []);

  function load() {
    setLoading(true);
    api.get('/users/monitored').then(r => { setMonitored(r.data); setLoading(false); });
  }

  function validatePhone(phone) {
    const digits = phone.replace(/\D/g, '');
    if (!/^05\d{8}$/.test(digits)) return 'מספר נייד לא תקין (10 ספרות, מתחיל ב-05)';
    return '';
  }

  async function createInvite(e) {
    e.preventDefault();
    const err = validatePhone(inviteForm.monitored_phone);
    if (err) { setPhoneError(err); return; }
    setPhoneError('');
    setInviteError('');
    try {
      const { data } = await api.post('/auth/invite', inviteForm);
      setInviteLink(data.link);
      setInvitePhone(inviteForm.monitored_phone);
      load();
    } catch (e) {
      setInviteError(e.response?.data?.error || 'שגיאה ביצירת הקישור');
    }
  }

  async function createReset(monitoredId) {
    const { data } = await api.post('/auth/reset-link', { monitored_id: monitoredId });
    setResetLinks(p => ({ ...p, [monitoredId]: data.link }));
  }

  function inviteLinkForPending(m) {
    return `${BASE_URL}/join/${m.invite_token}`;
  }

  function whatsappLink(phone, link) {
    const digits = phone.replace(/\D/g, '');
    const il = digits.startsWith('972') ? digits : '972' + digits.replace(/^0/, '');
    const text = encodeURIComponent(`שלום! קישור לכניסה למערכת התפריט המבוקר:\n${link}`);
    return `https://wa.me/${il}?text=${text}`;
  }

  function copyLink(link) {
    const text = `שלום! קישור לכניסה למערכת התפריט המבוקר:\n${link}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function closeInvite() {
    setShowInvite(false);
    setInviteLink('');
    setInvitePhone('');
    setInviteForm({ monitored_display_name: '', monitored_phone: '' });
    setPhoneError('');
    setInviteError('');
  }

  return (
    <SupervisorLayout title="מבוקרים">
      <div className="page">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h1 className="page-title" style={{ marginBottom: 0 }}>מבוקרים</h1>
          <button className="btn btn-primary btn-sm" onClick={() => setShowInvite(true)}>+ הזמן</button>
        </div>

        {loading && <div className="spinner" />}

        {!loading && monitored.length === 0 && (
          <div className="empty-state">
            <p style={{ fontSize: '2rem', marginBottom: 8 }}>👥</p>
            <p>אין מבוקרים עדיין</p>
            <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => setShowInvite(true)}>
              הזמן מבוקר ראשון
            </button>
          </div>
        )}

        {monitored.map((m, i) => {
          const isPending = m.status === 'pending_invite';
          const pendingLink = isPending ? inviteLinkForPending(m) : null;
          return (
            <div key={m.id || i} className="card" style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 700 }}>{m.display_name}</div>
                  {m.phone && <div style={{ color: 'var(--gray-600)', fontSize: '0.85rem' }}>{m.phone}</div>}
                  {isPending && (
                    <div style={{ fontSize: '0.75rem', color: 'var(--warning)', marginTop: 2 }}>
                      ⏳ ממתין להצטרפות
                    </div>
                  )}
                </div>
                {!isPending && (
                  <button className="btn btn-ghost btn-sm" onClick={() => createReset(m.id)}>
                    שחזור סיסמה
                  </button>
                )}
              </div>

              {/* כפתורי שליחה חוזרת להזמנה ממתינה */}
              {isPending && pendingLink && (
                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                  <a
                    className="btn btn-primary btn-sm"
                    href={whatsappLink(m.phone, pendingLink)}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ flex: 1, textAlign: 'center', textDecoration: 'none' }}
                  >
                    📲 שלח שוב
                  </a>
                  <button className="btn btn-secondary btn-sm" style={{ flex: 1 }} onClick={() => copyLink(pendingLink)}>
                    {copied ? '✓ הועתק!' : 'העתק קישור'}
                  </button>
                </div>
              )}

              {resetLinks[m.id] && (
                <div className="alert alert-info" style={{ marginTop: 12 }}>
                  <div style={{ fontSize: '0.8rem', wordBreak: 'break-all', marginBottom: 8 }}>{resetLinks[m.id]}</div>
                  <button className="btn btn-secondary btn-sm" onClick={() => copyLink(resetLinks[m.id])}>
                    העתק לשליחה בווטסאפ
                  </button>
                </div>
              )}
            </div>
          );
        })}

        {/* מודל הזמנה */}
        {showInvite && (
          <div className="action-sheet">
            <div className="action-sheet-bg" onClick={closeInvite} />
            <div className="action-sheet-content">
              <h2 className="action-sheet-title">הזמן מבוקר חדש</h2>
              {!inviteLink ? (
                <form onSubmit={createInvite}>
                  <div className="form-group">
                    <label>שם / כינוי</label>
                    <input
                      value={inviteForm.monitored_display_name}
                      onChange={e => setInviteForm(p => ({ ...p, monitored_display_name: e.target.value }))}
                      placeholder="שם פרטי או כינוי"
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>טלפון נייד</label>
                    <input
                      type="tel"
                      value={inviteForm.monitored_phone}
                      onChange={e => { setInviteForm(p => ({ ...p, monitored_phone: e.target.value })); setPhoneError(''); }}
                      placeholder="0501234567"
                      required
                    />
                    {phoneError && <div style={{ color: 'var(--danger)', fontSize: '0.8rem', marginTop: 4 }}>{phoneError}</div>}
                  </div>
                  {inviteError && <div className="alert alert-error" style={{ marginBottom: 12 }}>{inviteError}</div>}
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button type="button" className="btn btn-secondary btn-full" onClick={closeInvite}>ביטול</button>
                    <button type="submit" className="btn btn-primary btn-full">צור קישור</button>
                  </div>
                </form>
              ) : (
                <>
                  <div className="alert alert-success" style={{ marginBottom: 16 }}>
                    הקישור נוצר! שלח אותו בווטסאפ.
                  </div>
                  <a
                    className="btn btn-primary btn-full"
                    href={whatsappLink(invitePhone, inviteLink)}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ display: 'block', textAlign: 'center', textDecoration: 'none', marginBottom: 8 }}
                  >
                    📲 שלח בווטסאפ
                  </a>
                  <button className="btn btn-secondary btn-full" onClick={() => copyLink(inviteLink)}>
                    {copied ? '✓ הועתק!' : 'העתק קישור'}
                  </button>
                  <button className="btn btn-ghost btn-full" style={{ marginTop: 8 }} onClick={closeInvite}>
                    סגור
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </SupervisorLayout>
  );
}
