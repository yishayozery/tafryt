import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../hooks/useAuth';

export default function Register() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ display_name: '', username: '', password: '', phone: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (form.password.length < 8) {
      return setError('הסיסמה חייבת להכיל לפחות 8 תווים');
    }
    setLoading(true);
    try {
      const { data } = await api.post('/auth/register', form);
      login(data.token, data.user);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.error || 'שגיאה בהרשמה');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">
          <h1>🥗 תפריט מבוקר</h1>
          <p>הרשמה כמבקר</p>
        </div>
        {error && <div className="alert alert-error">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>שם / כינוי</label>
            <input
              value={form.display_name}
              onChange={e => setForm(p => ({ ...p, display_name: e.target.value }))}
              placeholder="שם פרטי או כינוי"
              required
            />
          </div>
          <div className="form-group">
            <label>שם משתמש</label>
            <input
              value={form.username}
              onChange={e => setForm(p => ({ ...p, username: e.target.value }))}
              placeholder="לדוגמה: avi123"
              autoComplete="username"
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
              autoComplete="new-password"
              required
            />
          </div>
          <div className="form-group">
            <label>מספר טלפון (לא חובה)</label>
            <input
              type="tel"
              value={form.phone}
              onChange={e => setForm(p => ({ ...p, phone: e.target.value }))}
              placeholder="050-0000000"
            />
          </div>
          <button type="submit" className="btn btn-primary btn-full" disabled={loading}>
            {loading ? 'נרשם...' : 'הרשמה'}
          </button>
        </form>
        <hr className="divider" />
        <p style={{ textAlign: 'center', fontSize: '0.9rem', color: 'var(--gray-600)' }}>
          יש לך חשבון? <Link to="/login">כניסה</Link>
        </p>
      </div>
    </div>
  );
}
