import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api.js';
import { USER_KEY } from '../storage.js';

const STATUS_MAP    = { pending:'待確認', completed:'已完成', cancelled:'取消' };
const STATUS_COLORS = { pending:'badge-pending', completed:'badge-completed', cancelled:'badge-cancelled' };
const fmt     = n => 'NT$ ' + Number(n||0).toLocaleString();
const fmtDate = s => s ? new Date(s).toLocaleString('zh-TW', { year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' }) : '';

export default function ReturnsPage() {
  const navigate = useNavigate();
  const [returns,  setReturns]  = useState([]);
  const [status,   setStatus]   = useState('');
  const [start,    setStart]    = useState('');
  const [end,      setEnd]      = useState('');
  const [loading,  setLoading]  = useState(false);
  const user = JSON.parse(localStorage.getItem(USER_KEY) || '{}');

  const load = async () => {
    setLoading(true);
    try {
      const r = await api.get('/returns', { params: { status, startDate: start, endDate: end } });
      setReturns(r.data);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [status, start, end]);

  async function changeStatus(ret, newStatus) {
    const labels = { completed:'已完成', cancelled:'取消' };
    if (!confirm(`確定將「${ret.ReturnNo}」狀態改為「${labels[newStatus]}」？`)) return;
    await api.put(`/returns/${ret.ReturnID}/status`, { status: newStatus });
    load();
  }

  const totalAmount = returns.reduce((s, r) => s + Number(r.TotalAmount||0), 0);

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-title">↩️ 退貨記錄</div>
          <div className="page-subtitle">共 {returns.length} 筆 ｜ 合計 {fmt(totalAmount)}</div>
        </div>
        {(user.role === 'admin' || user.role === 'sales') && (
          <button className="btn" style={{background:'#d97706', color:'#fff', border:'none'}} onClick={() => navigate('/new-return')}>＋ 退貨開單</button>
        )}
      </div>

      <div className="page-body">
        <div className="card" style={{marginBottom:16}}>
          <div className="card-body" style={{padding:'12px 20px'}}>
            <div className="toolbar-left" style={{flexWrap:'wrap', gap:12}}>
              <select value={status} onChange={e => setStatus(e.target.value)} style={{minWidth:120}}>
                <option value="">全部狀態</option>
                {Object.entries(STATUS_MAP).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <div className="flex items-center gap-8">
                <span style={{fontSize:13, color:'#6b7280'}}>日期：</span>
                <input type="date" value={start} onChange={e => setStart(e.target.value)} />
                <span>～</span>
                <input type="date" value={end} onChange={e => setEnd(e.target.value)} />
                {(start||end) && <button className="btn btn-ghost btn-sm" onClick={() => { setStart(''); setEnd(''); }}>清除</button>}
              </div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="table-wrap">
            {loading ? <div className="loading-center"><span className="spinner" /></div> : (
              <table>
                <thead>
                  <tr><th>退貨單號</th><th>客戶</th><th>業務</th><th>退貨日期</th><th className="text-right">金額</th><th>狀態</th><th className="text-center">操作</th></tr>
                </thead>
                <tbody>
                  {returns.length === 0 && <tr><td colSpan={7} className="empty-state"><span className="icon">↩️</span>無退貨資料</td></tr>}
                  {returns.map(r => (
                    <tr key={r.ReturnID}>
                      <td><code style={{fontSize:12, color:'#d97706', cursor:'pointer'}} onClick={() => navigate(`/returns/${r.ReturnID}`)}>{r.ReturnNo}</code></td>
                      <td>
                        <div><b>{r.CompanyName}</b></div>
                        <div style={{fontSize:11, color:'#9ca3af'}}>{r.CustomerCode}</div>
                      </td>
                      <td>{r.EmployeeName}</td>
                      <td style={{fontSize:12}}>{fmtDate(r.ReturnDate)}</td>
                      <td className="text-right" style={{fontWeight:600}}>{fmt(r.TotalAmount)}</td>
                      <td><span className={`badge ${STATUS_COLORS[r.Status]}`}>{STATUS_MAP[r.Status]}</span></td>
                      <td className="text-center">
                        <div className="flex gap-8 items-center" style={{justifyContent:'center'}}>
                          <button className="btn btn-outline btn-sm" onClick={() => navigate(`/returns/${r.ReturnID}`)}>詳情</button>
                          {r.Status === 'pending' && (user.role === 'admin' || user.role === 'warehouse') && (
                            <button className="btn btn-success btn-sm" onClick={() => changeStatus(r, 'completed')}>確認完成</button>
                          )}
                          {r.Status === 'pending' && (
                            <button className="btn btn-ghost btn-sm" style={{color:'#e02424'}} onClick={() => changeStatus(r, 'cancelled')}>取消</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
