import { useState, useEffect } from 'react';
import api from '../api.js';
import { USER_KEY } from '../storage.js';

const EMPTY = { Username:'', Password:'', FullName:'', Role:'sales', Phone:'', IsActive:1 };
const ROLE_LABELS = { admin:'管理員', sales:'業務', warehouse:'倉庫' };

export default function EmployeesPage() {
  const user = JSON.parse(localStorage.getItem(USER_KEY) || '{}');
  const [list,    setList]    = useState([]);
  const [modal,   setModal]   = useState(null);
  const [form,    setForm]    = useState(EMPTY);
  const [msg,     setMsg]     = useState(null);
  const [loading, setLoading] = useState(false);
  const [permissions, setPermissions] = useState({ all:false, permissions:[] });

  const load = async () => {
    setLoading(true);
    try { const r = await api.get('/employees'); setList(r.data); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    api.get('/permissions/my').then(r => setPermissions(r.data)).catch(() => {});
    load();
  }, []);

  const can = permission => permissions.all || permissions.permissions.includes(permission);

  function openAdd()   { setForm(EMPTY); setModal('add'); setMsg(null); }
  function openEdit(e) { setForm({ ...e, Password: '' }); setModal('edit'); setMsg(null); }
  const closeModal = () => { setModal(null); setMsg(null); };
  const f = k => ev => setForm(p => ({ ...p, [k]: ev.target.value }));

  async function save() {
    if (!form.FullName) return setMsg({ type:'error', text:'請填寫姓名' });
    if (modal === 'add' && !form.Password) return setMsg({ type:'error', text:'請設定密碼' });
    try {
      if (modal === 'add') await api.post('/employees', form);
      else                  await api.put(`/employees/${form.EmployeeID}`, form);
      setMsg({ type:'success', text:'儲存成功' });
      load(); setTimeout(closeModal, 800);
    } catch (err) {
      setMsg({ type:'error', text: err.response?.data?.message || '儲存失敗' });
    }
  }

  async function toggleActive(emp) {
    await api.put(`/employees/${emp.EmployeeID}`, { ...emp, IsActive: emp.IsActive ? 0 : 1 });
    load();
  }

  async function del(emp) {
    try {
      const check = await api.get(`/employees/${emp.EmployeeID}/deletable`);
      if (!check.data.deletable) {
        alert(`「${emp.FullName}」有 ${check.data.count} 筆關聯訂單／退貨紀錄，無法刪除。`);
        return;
      }
      if (!confirm(`確定要刪除「${emp.FullName}」？\n此操作無法復原。`)) return;
      await api.delete(`/employees/${emp.EmployeeID}`);
      load();
    } catch (err) {
      alert(err.response?.data?.message || '操作失敗');
    }
  }

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-title">👥 員工管理</div>
          <div className="page-subtitle">共 {list.length} 位員工</div>
        </div>
        {can('employee_add') && <button className="btn btn-primary" onClick={openAdd}>＋ 新增員工</button>}
      </div>
      <div className="page-body">
        <div className="card">
          <div className="table-wrap">
            {loading ? <div className="loading-center"><span className="spinner" /></div> : (
              <table>
                <thead>
                  <tr><th>帳號</th><th>姓名</th><th>角色</th><th>電話</th><th>狀態</th><th>建立日期</th><th>最後登入</th><th className="text-center">操作</th></tr>
                </thead>
                <tbody>
                  {list.map(e => (
                    <tr key={e.EmployeeID}>
                      <td><code>{e.Username}</code></td>
                      <td><b>{e.FullName}</b></td>
                      <td><span className={`badge badge-${e.Role}`}>{ROLE_LABELS[e.Role] || e.Role}</span></td>
                      <td>{e.Phone || '-'}</td>
                      <td>
                        <span className={`badge ${e.IsActive ? 'badge-completed' : 'badge-cancelled'}`}>
                          {e.IsActive ? '啟用' : '停用'}
                        </span>
                      </td>
                      <td>{new Date(e.CreatedAt).toLocaleDateString('zh-TW')}</td>
                      <td style={{whiteSpace:'nowrap', color: e.LastLoginAt ? '#333' : '#aaa'}}>
                        {e.LastLoginAt || '尚未登入'}
                      </td>
                      <td className="text-center">
                        {can('employee_edit') && <>
                          <button className="btn btn-ghost btn-sm" onClick={() => openEdit(e)}>✏️</button>
                          <button className="btn btn-ghost btn-sm" onClick={() => toggleActive(e)} title={e.IsActive ? '停用' : '啟用'}>
                            {e.IsActive ? '🚫' : '✅'}
                          </button>
                        </>}
                        {can('employee_delete') && <button className="btn btn-ghost btn-sm" style={{color:'#e02424'}} onClick={() => del(e)} title="刪除">🗑️</button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {modal && (
        <div className="modal-overlay" onClick={ev => ev.target === ev.currentTarget && closeModal()}>
          <div className="modal">
            <div className="modal-header">
              <span className="modal-title">{modal === 'add' ? '新增員工' : '編輯員工'}</span>
              <button className="modal-close" onClick={closeModal}>✕</button>
            </div>
            <div className="modal-body">
              {msg && <div className={`alert alert-${msg.type}`}>{msg.text}</div>}
              <div className="form-grid">
                {modal === 'add' && (
                  <div className="form-group">
                    <label>帳號 *</label>
                    <input value={form.Username} onChange={f('Username')} placeholder="登入帳號（英數字）" />
                  </div>
                )}
                <div className="form-group">
                  <label>{modal === 'add' ? '密碼 *' : '新密碼（不改請留空）'}</label>
                  <input type="password" value={form.Password} onChange={f('Password')} placeholder="請輸入密碼" />
                </div>
                <div className="form-group">
                  <label>姓名 *</label>
                  <input value={form.FullName} onChange={f('FullName')} />
                </div>
                <div className="form-group">
                  <label>角色</label>
                  <select value={form.Role} onChange={f('Role')}>
                    {user.role === 'admin' && <option value="admin">管理員</option>}
                    <option value="sales">業務</option>
                    <option value="warehouse">倉庫</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>電話</label>
                  <input value={form.Phone} onChange={f('Phone')} />
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={closeModal}>取消</button>
              <button className="btn btn-primary" onClick={save}>💾 儲存</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
