import { useState, useEffect } from 'react';
import api from '../api.js';

const EMPTY = { CustomerCode:'', CompanyName:'', ContactName:'', Phone:'', Mobile:'', Address:'', TaxID:'', CreditLimit:'', Notes:'' };

export default function CustomersPage() {
  const [list,    setList]    = useState([]);
  const [search,  setSearch]  = useState('');
  const [modal,   setModal]   = useState(null);
  const [form,    setForm]    = useState(EMPTY);
  const [msg,     setMsg]     = useState(null);
  const [loading, setLoading] = useState(false);
  const user    = JSON.parse(localStorage.getItem('user') || '{}');
  const isAdmin = user.role === 'admin';

  const load = async () => {
    setLoading(true);
    try { const r = await api.get('/customers', { params: { search } }); setList(r.data); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [search]);

  function openAdd()   { setForm(EMPTY); setModal('add'); setMsg(null); }
  function openEdit(c) { setForm({ ...c, CreditLimit: c.CreditLimit||'' }); setModal('edit'); setMsg(null); }
  const closeModal = () => { setModal(null); setMsg(null); };
  const f = k => e => setForm(p => ({ ...p, [k]: e.target.value }));

  async function save() {
    if (!form.CompanyName) return setMsg({ type:'error', text:'請填寫公司名稱' });
    try {
      if (modal === 'add') await api.post('/customers', form);
      else                  await api.put(`/customers/${form.CustomerID}`, form);
      setMsg({ type:'success', text:'儲存成功' });
      load(); setTimeout(closeModal, 800);
    } catch (err) {
      setMsg({ type:'error', text: err.response?.data?.message || '儲存失敗' });
    }
  }

  async function del(c) {
    if (!confirm(`確定刪除「${c.CompanyName}」？`)) return;
    await api.delete(`/customers/${c.CustomerID}`);
    load();
  }

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-title">🏪 客戶資料</div>
          <div className="page-subtitle">共 {list.length} 家客戶</div>
        </div>
        <button className="btn btn-primary" onClick={openAdd}>＋ 新增客戶</button>
      </div>

      <div className="page-body">
        <div className="card">
          <div className="card-header">
            <input type="text" placeholder="搜尋代號 / 公司名 / 聯絡人..."
              value={search} onChange={e => setSearch(e.target.value)} style={{width:280}} />
          </div>
          <div className="table-wrap">
            {loading ? <div className="loading-center"><span className="spinner" /></div> : (
              <table>
                <thead>
                  <tr><th>代號</th><th>公司名稱</th><th>聯絡人</th><th>電話</th><th>手機</th><th>地址</th><th>統編</th><th className="text-center">操作</th></tr>
                </thead>
                <tbody>
                  {list.length === 0 && <tr><td colSpan={8} className="empty-state"><span className="icon">🏪</span>暫無客戶資料</td></tr>}
                  {list.map(c => (
                    <tr key={c.CustomerID}>
                      <td><b style={{color:'#1a56db'}}>{c.CustomerCode || '-'}</b></td>
                      <td><b>{c.CompanyName}</b></td>
                      <td>{c.ContactName || '-'}</td>
                      <td>{c.Phone || '-'}</td>
                      <td>{c.Mobile || '-'}</td>
                      <td style={{maxWidth:180, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{c.Address || '-'}</td>
                      <td>{c.TaxID || '-'}</td>
                      <td className="text-center">
                        <button className="btn btn-ghost btn-sm" onClick={() => openEdit(c)}>✏️</button>
                        {isAdmin && <button className="btn btn-ghost btn-sm" onClick={() => del(c)}>🗑️</button>}
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
          <div className="modal modal-wide">
            <div className="modal-header">
              <span className="modal-title">{modal === 'add' ? '新增客戶' : '編輯客戶'}</span>
              <button className="modal-close" onClick={closeModal}>✕</button>
            </div>
            <div className="modal-body">
              {msg && <div className={`alert alert-${msg.type}`}>{msg.text}</div>}
              <div className="form-grid">
                <div className="form-group">
                  <label>客戶代號</label>
                  <input value={form.CustomerCode} onChange={f('CustomerCode')} placeholder="如 C001" />
                </div>
                <div className="form-group">
                  <label>公司名稱 *</label>
                  <input value={form.CompanyName} onChange={f('CompanyName')} />
                </div>
                <div className="form-group">
                  <label>聯絡人</label>
                  <input value={form.ContactName} onChange={f('ContactName')} />
                </div>
                <div className="form-group">
                  <label>電話</label>
                  <input value={form.Phone} onChange={f('Phone')} />
                </div>
                <div className="form-group">
                  <label>手機</label>
                  <input value={form.Mobile} onChange={f('Mobile')} />
                </div>
                <div className="form-group">
                  <label>統一編號</label>
                  <input value={form.TaxID} onChange={f('TaxID')} maxLength={8} />
                </div>
                <div className="form-group">
                  <label>信用額度 (NT$)</label>
                  <input type="number" value={form.CreditLimit} onChange={f('CreditLimit')} min="0" />
                </div>
                <div className="form-group full">
                  <label>地址</label>
                  <input value={form.Address} onChange={f('Address')} />
                </div>
                <div className="form-group full">
                  <label>備註</label>
                  <textarea value={form.Notes} onChange={f('Notes')} rows={3} />
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
