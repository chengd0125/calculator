import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api.js';
import { TOKEN_KEY, USER_KEY } from '../storage.js';

export default function LoginPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ username: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleLogin(e) {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const res = await api.post('/auth/login', form);
      sessionStorage.setItem(TOKEN_KEY, res.data.token);
      sessionStorage.setItem(USER_KEY,  JSON.stringify(res.data.user));
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.message || '登入失敗，請稍後再試');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo">
          <span className="icon">📦</span>
          <h1>批發商業務管理系統</h1>
          <p>Wholesale Management System</p>
        </div>

        <form onSubmit={handleLogin} className="login-form">
          {error && <div className="alert alert-error">⚠️ {error}</div>}

          <div className="form-group">
            <label>帳號</label>
            <input
              type="text" placeholder="請輸入帳號"
              value={form.username}
              onChange={e => setForm({ ...form, username: e.target.value })}
              autoFocus required
            />
          </div>
          <div className="form-group">
            <label>密碼</label>
            <input
              type="password" placeholder="請輸入密碼"
              value={form.password}
              onChange={e => setForm({ ...form, password: e.target.value })}
              required
            />
          </div>

          <button className="btn btn-primary btn-lg login-btn" disabled={loading}>
            {loading ? <><span className="spinner" /> 登入中...</> : '🔐 登入系統'}
          </button>
        </form>
      </div>
    </div>
  );
}
