import { useState, useEffect } from 'react';
import api from '../../api/client';
import { SupervisorLayout } from '../../components/Layout';

export default function MonitoredList() {
  const [monitored, setMonitored] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteForm, setInviteForm] = useState({ monitored_display_name: '', monitored_phone: '' });
  const [inviteLink, setInviteLink] = useState('');
  const [copied, setCopied] = useState(false);
  const [resetLinks, setResetLinks] = useState({});

  useEffect(() => {
    api.get('/users/monitored').then(r => { setMonitored(r.data); setLoading(false); });
  }, []);

  async function createInvite(e) {
    e.preventDefault();
    const { data } = await api.post('/auth/invite', inviteForm);
    setInviteLink(data.link);
  }

  async function createReset(monitoredId) {
    const { data } = await api.post('/auth/reset-link', { monitored_id: monitoredId });
    setResetLinks(p => ({ ...p, [monitoredId]: data.link }));
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

        {monitored.map((m, i) => (
          <div key={m.id || i} className="card" style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 700 }}>{m.display_name}</div>
                {m.phone && <div style={{ color: 'var(--gray-600)', fontSize: '0.85rem' }}>{m.phone}</div>}
                {m.status === 'pending_invite' && (
                  <div style={{ fontSize: '0.75rem', color: 'var(--warning)', marginTop: 2 }}>
                    ⏳ ממתין להצטרפות
                  </div>
                )}
              </div>
              {m.status !== 'pending_invite' && (
                <button className="btn btn-ghost btn-sm" onClick={() => createReset(m.id)}>
                  שחזור סיסמה
                </button>
              )}
            </div>
            {resetLinks[m.id] && (
              <div className="alert alert-info" style={{ marginTop: 12 }}>
                <div style={{ fontSize: '0.8rem', wordBreak: 'break-all', marginBottom: 8 }}>{resetLinks[m.id]}</div>
                <button className="btn btn-secondary btn-sm" onClick={() => copyLink(resetLinks[m.id])}>
                  העתק לשליחה בווטסאפ
                </button>
              </div>
            )}
          </div>
        ))}

        {/* מודל הזמנה */}
        {showInvite && (
          <div className="action-sheet">
            <div className="action-sheet-bg" onClick={() => { setShowInvite(false); setInviteLink(''); }} />
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
                    <label>טלפון</label>
                    <input
                      type="tel"
                      value={inviteForm.monitored_phone}
                      onChange={e => setInviteForm(p => ({ ...p, monitored_phone: e.target.value }))}
                      placeholder="050-0000000"
                      required
                    />
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button type="button" className="btn btn-secondary btn-full" onClick={() => setShowInvite(false)}>ביטול</button>
                    <button type="submit" className="btn btn-primary btn-full">צור קישור</button>
                  </div>
                </form>
              ) : (
                <>
                  <div className="alert alert-success" style={{ marginBottom: 16 }}>
                    הקישור נוצר! שלח אותו למבוקר בווטסאפ.
                  </div>
                  <div style={{ background: 'var(--gray-100)', borderRadius: 8, padding: '12px', fontSize: '0.85rem', wordBreak: 'break-all', marginBottom: 16 }}>
                    {inviteLink}
                  </div>
                  <a
                    className="btn btn-primary btn-full"
                    href={whatsappLink(inviteForm.monitored_phone, inviteLink)}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ display: 'block', textAlign: 'center', textDecoration: 'none' }}
                  >
                    📲 שלח בווטסאפ
                  </a>
                  <button className="btn btn-secondary btn-full" style={{ marginTop: 8 }} onClick={() => copyLink(inviteLink)}>
                    {copied ? '✓ הועתק!' : 'העתק קישור'}
                  </button>
                  <button className="btn btn-secondary btn-full" style={{ marginTop: 8 }}
                    onClick={() => { setShowInvite(false); setInviteLink(''); setInviteForm({ monitored_display_name: '', monitored_phone: '' }); window.location.reload(); }}>
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
