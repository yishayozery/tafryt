import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../hooks/useAuth';

export default function JoinPage() {
  const { token } = useParams();
  const { login } = useAuth();
  const navigate = useNavigate();
  const [info, setInfo] = useState(null);
  const [form, setForm] = useState({ username: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api.get(`/auth/invite-info/${token}`)
      .then(r => { setInfo(r.data); setLoading(false); })
      .catch(err => {
        const status = err.response?.status;
        if (status === 410) {
          // טוקן כבר נוצל — מעבירים לכניסה
          navigate('/login', { replace: true });
        } else {
          setError(err.response?.data?.error || 'קישור לא תקין');
          setLoading(false);
        }
      });
  }, [token]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (form.password.length < 8) return setError('הסיסמה חייבת להכיל לפחות 8 תווים');
    setSubmitting(true);
    try {
      const { data } = await api.post(`/auth/join/${token}`, form);
      login(data.token, data.user);
      navigate('/my-tasks', { replace: true });
    } catch (err) {
      setError(err.response?.data?.error || 'שגיאה בהרשמה');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <div className="auth-page"><div className="spinner" /></div>;

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">
          <h1>🥗 תפריט מבוקר</h1>
          <p>הגדרת חשבון</p>
        </div>
        {error && <div className="alert alert-error">{error}</div>}
        {info && (
          <>
            <div className="alert alert-info" style={{ marginBottom: 20 }}>
              שלום <strong>{info.display_name}</strong>! בחר שם משתמש וסיסמה כדי להתחבר למערכת.
            </div>
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>שם משתמש</label>
                <input
                  value={form.username}
                  onChange={e => setForm(p => ({ ...p, username: e.target.value }))}
                  placeholder="בחר שם משתמש"
                  required
                />
              </div>
              <div className="form-group">
                <label>סיסמה (לפחות 8 תווים)</label>
                <input
                  type="password"
                  value={form.password}
                  onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                  placeholder="בחר סיסמה חזקה"
                  required
                />
              </div>
              <button type="submit" className="btn btn-primary btn-full" disabled={submitting}>
                {submitting ? 'מגדיר חשבון...' : 'כניסה למערכת'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
