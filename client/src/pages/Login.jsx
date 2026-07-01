import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../hooks/useAuth';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ username: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { data } = await api.post('/auth/login', form);
      login(data.token, data.user);
      if (data.user.is_admin) navigate('/admin', { replace: true });
      else if (data.user.is_monitored) navigate('/my-tasks', { replace: true });
      else navigate('/supervisor', { replace: true });
    } catch (err) {
      const d = err.response?.data;
      const msg = typeof d?.error === 'string' ? d.error : d?.message || d?.error?.message || 'שגיאה בכניסה';
      const status = err.response?.status;
      setError(status ? `${msg} (${status})` : msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">
          <h1>🥗 תפריט מבוקר</h1>
          <p>כניסה למערכת</p>
        </div>
        {error && <div className="alert alert-error">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>שם משתמש</label>
            <input
              value={form.username}
              onChange={e => setForm(p => ({ ...p, username: e.target.value }))}
              placeholder="הכנס שם משתמש"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck="false"
              inputMode="text"
              required
            />
          </div>
          <div className="form-group">
            <label>סיסמה</label>
            <div style={{ position: 'relative' }}>
              <input
                type={showPassword ? 'text' : 'password'}
                value={form.password}
                onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                placeholder="הכנס סיסמה"
                autoComplete="current-password"
                required
                style={{ paddingLeft: 40, width: '100%', boxSizing: 'border-box' }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(v => !v)}
                style={{
                  position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer',
                  fontSize: '1.1rem', color: 'var(--gray-500)', padding: 0,
                }}
                tabIndex={-1}
              >
                {showPassword ? '🙈' : '👁️'}
              </button>
            </div>
          </div>
          <button type="submit" className="btn btn-primary btn-full" disabled={loading}>
            {loading ? 'נכנס...' : 'כניסה'}
          </button>
        </form>
        <hr className="divider" />
        <p style={{ textAlign: 'center', fontSize: '0.9rem', color: 'var(--gray-600)' }}>
          משתמש חדש? <Link to="/register">הרשמה</Link>
        </p>
      </div>
    </div>
  );
}
