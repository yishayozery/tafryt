import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../api/client';

export default function ResetPage() {
  const { token } = useParams();
  const navigate = useNavigate();
  const [info, setInfo] = useState(null);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get(`/auth/reset-info/${token}`)
      .then(r => { setInfo(r.data); setLoading(false); })
      .catch(err => { setError(err.response?.data?.error || 'קישור לא תקין'); setLoading(false); });
  }, [token]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (password.length < 8) return setError('הסיסמה חייבת להכיל לפחות 8 תווים');
    try {
      await api.post(`/auth/reset/${token}`, { password });
      setSuccess(true);
    } catch (err) {
      setError(err.response?.data?.error || 'שגיאה');
    }
  }

  if (loading) return <div className="auth-page"><div className="spinner" /></div>;

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">
          <h1>🥗 תפריט מבוקר</h1>
          <p>איפוס סיסמה</p>
        </div>
        {error && <div className="alert alert-error">{error}</div>}
        {success ? (
          <>
            <div className="alert alert-success">הסיסמה אופסה בהצלחה!</div>
            <button className="btn btn-primary btn-full" onClick={() => navigate('/login')}>כניסה</button>
          </>
        ) : info && (
          <>
            <div className="alert alert-info" style={{ marginBottom: 20 }}>
              שם משתמש: <strong>{info.username}</strong>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>סיסמה חדשה (לפחות 8 תווים)</label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="הכנס סיסמה חדשה"
                  required
                />
              </div>
              <button type="submit" className="btn btn-primary btn-full">אפס סיסמה</button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
