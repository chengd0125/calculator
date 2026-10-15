import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api.js';
import { USER_KEY } from '../storage.js';

const STATUS_MAP    = { pending:'待處理', picking:'撿貨中', completed:'完成撿貨', cancelled:'取消' };
const STATUS_COLORS = { pending:'badge-pending', picking:'badge-picking', completed:'badge-completed', cancelled:'badge-cancelled' };
const fmt = n => 'NT$ ' + Number(n||0).toLocaleString();
const fmtDate = s => s ? new Date(s).toLocaleString('zh-TW', { year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' }) : '';

export default function OrdersPage() {
  const navigate = useNavigate();
  const [orders,   setOrders]   = useState([]);
  const [status,   setStatus]   = useState('');
  const [start,    setStart]    = useState('');
  const [end,      setEnd]      = useState('');
  const [loading,  setLoading]  = useState(false);
  const user = JSON.parse(sessionStorage.getItem(USER_KEY) || '{}');

  const load = async () => {
    setLoading(true);
    try {
      const r = await api.get('/orders', { params: { status, startDate: start, endDate: end } });
      setOrders(r.data);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [status, start, end]);

  async function changeStatus(order, newStatus) {
    const labels = { picking:'撿貨中', completed:'完成撿貨', cancelled:'取消' };
    if (!confirm(`確定將訂單「${order.OrderNo}」狀態改為「${labels[newStatus] || newStatus}」？`)) return;
    await api.put(`/orders/${order.OrderID}/status`, { status: newStatus });
    load();
  }

  const totalAmount = orders.reduce((s, o) => s + Number(o.TotalAmount||0), 0);

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-title">📋 訂單管理</div>
          <div className="page-subtitle">共 {orders.length} 筆 ｜ 合計 {fmt(totalAmount)}</div>
        </div>
        {(user.role === 'admin' || user.role === 'sales') && (
          <button className="btn btn-primary" onClick={() => navigate('/new-order')}>＋ 抄貨開單</button>
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
                <input type="date" value={end}   onChange={e => setEnd(e.target.value)} />
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
                  <tr><th>訂單編號</th><th>客戶</th><th>業務</th><th>訂單日期</th><th className="text-right">金額</th><th>狀態</th><th className="text-center">操作</th></tr>
                </thead>
                <tbody>
                  {orders.length === 0 && <tr><td colSpan={7} className="empty-state"><span className="icon">📋</span>無訂單資料</td></tr>}
                  {orders.map(o => (
                    <tr key={o.OrderID}>
                      <td><code style={{fontSize:12, color:'#1a56db', cursor:'pointer'}} onClick={() => navigate(`/orders/${o.OrderID}`)}>{o.OrderNo}</code></td>
                      <td>
                        <div><b>{o.CompanyName}</b></div>
                        <div style={{fontSize:11, color:'#9ca3af'}}>{o.CustomerCode}</div>
                      </td>
                      <td>{o.EmployeeName}</td>
                      <td style={{fontSize:12}}>{fmtDate(o.OrderDate)}</td>
                      <td className="text-right" style={{fontWeight:600}}>{fmt(o.TotalAmount)}</td>
                      <td><span className={`badge ${STATUS_COLORS[o.Status]}`}>{STATUS_MAP[o.Status]}</span></td>
                      <td className="text-center">
                        <div className="flex gap-8 items-center" style={{justifyContent:'center'}}>
                          <button className="btn btn-outline btn-sm" onClick={() => navigate(`/orders/${o.OrderID}`)}>
                            詳情
                          </button>
                          {user.role !== 'sales' && o.Status === 'pending' && (
                            <button className="btn btn-success btn-sm" onClick={() => changeStatus(o, 'completed')}>
                              完成撿貨
                            </button>
                          )}
                          {user.role !== 'sales' && o.Status === 'picking' && (
                            <button className="btn btn-success btn-sm" onClick={() => changeStatus(o, 'completed')}>
                              完成撿貨
                            </button>
                          )}
                          {o.Status === 'pending' && (
                            <button className="btn btn-ghost btn-sm" style={{color:'#e02424'}} onClick={() => changeStatus(o, 'cancelled')}>
                              取消
                            </button>
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
