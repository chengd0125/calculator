import { useState, useEffect } from 'react';
import api from '../api.js';

const ROLE_LABELS = { admin: '管理員', sales: '業務', warehouse: '倉庫' };

function fmt(dt) {
  if (!dt) return '-';
  const d = new Date(dt);
  return d.toLocaleDateString('zh-TW') + ' ' +
    d.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export default function LoginHistoryPage() {
  const [list,       setList]       = useState([]);
  const [employees,  setEmployees]  = useState([]);
  const [loading,    setLoading]    = useState(false);
  const [filter,     setFilter]     = useState({ employeeId: '', dateFrom: '', dateTo: '' });

  useEffect(() => {
    api.get('/employees').then(r => setEmployees(r.data)).catch(() => {});
    load({});
  }, []);

  async function load(f) {
    setLoading(true);
    try {
      const params = {};
      if (f.employeeId) params.employeeId = f.employeeId;
      if (f.dateFrom)   params.dateFrom   = f.dateFrom;
      if (f.dateTo)     params.dateTo     = f.dateTo;
      const r = await api.get('/login-history', { params });
      setList(r.data);
    } catch {
      setList([]);
    } finally {
      setLoading(false);
    }
  }

  function search() { load(filter); }
  function reset()  { const f = { employeeId: '', dateFrom: '', dateTo: '' }; setFilter(f); load(f); }

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">登入紀錄</h1>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div>
            <label className="form-label">員工</label>
            <select
              className="form-select"
              value={filter.employeeId}
              onChange={e => setFilter(p => ({ ...p, employeeId: e.target.value }))}
            >
              <option value="">全部員工</option>
              {employees.map(emp => (
                <option key={emp.EmployeeID} value={emp.EmployeeID}>
                  {emp.FullName}（{emp.Username}）
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="form-label">開始日期</label>
            <input
              type="date"
              className="form-input"
              value={filter.dateFrom}
              onChange={e => setFilter(p => ({ ...p, dateFrom: e.target.value }))}
            />
          </div>
          <div>
            <label className="form-label">結束日期</label>
            <input
              type="date"
              className="form-input"
              value={filter.dateTo}
              onChange={e => setFilter(p => ({ ...p, dateTo: e.target.value }))}
            />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary" onClick={search}>查詢</button>
            <button className="btn btn-secondary" onClick={reset}>重設</button>
          </div>
        </div>
      </div>

      <div className="card">
        {loading ? (
          <div className="loading">載入中...</div>
        ) : list.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">🔐</div>
            <div>沒有登入紀錄</div>
          </div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>登入時間</th>
                <th>員工姓名</th>
                <th>帳號</th>
                <th>角色</th>
                <th>IP 位址</th>
              </tr>
            </thead>
            <tbody>
              {list.map(row => (
                <tr key={row.LogID}>
                  <td style={{ whiteSpace: 'nowrap' }}>{fmt(row.LoginAt)}</td>
                  <td>{row.FullName}</td>
                  <td style={{ color: '#666' }}>{row.Username}</td>
                  <td>
                    <span className={`badge ${row.Role === 'admin' ? 'badge-danger' : row.Role === 'sales' ? 'badge-primary' : 'badge-secondary'}`}>
                      {ROLE_LABELS[row.Role] || row.Role}
                    </span>
                  </td>
                  <td style={{ fontFamily: 'monospace', color: '#666' }}>{row.IPAddress || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {!loading && list.length > 0 && (
          <div style={{ marginTop: 8, color: '#999', fontSize: 13 }}>
            共 {list.length} 筆紀錄
          </div>
        )}
      </div>
    </div>
  );
}
