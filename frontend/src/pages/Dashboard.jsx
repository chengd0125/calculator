import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api.js';
import { USER_KEY } from '../storage.js';

const STATUS_MAP = { pending:'待處理', picking:'撿貨中', completed:'完成撿貨', cancelled:'取消' };
const fmt = n => 'NT$ ' + Number(n||0).toLocaleString();
const fmtDate = s => s ? new Date(s).toLocaleDateString('zh-TW') : '';

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const navigate = useNavigate();

  useEffect(() => { api.get('/dashboard').then(r => setStats(r.data)).catch(console.error); }, []);

  if (!stats) return <div className="loading-center"><span className="spinner" /></div>;

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-title">📊 儀表板</div>
          <div className="page-subtitle">
  {new Date().toLocaleDateString('zh-TW', {year:'numeric',month:'long',day:'numeric',weekday:'long'})}
  {JSON.parse(localStorage.getItem(USER_KEY)||'{}').role === 'sales' && (
    <span style={{marginLeft:12, color:'#1a56db', fontWeight:600}}>（僅顯示您的訂單）</span>
  )}
</div>
        </div>
        <button className="btn btn-primary" onClick={() => navigate('/new-order')}>
          ＋ 開始抄貨
        </button>
      </div>

      <div className="page-body">
        <div className="stats-grid">
          <div className="stat-card">
            <span className="stat-icon">🏷️</span>
            <div><div className="stat-label">商品品項</div><div className="stat-value">{stats.totalProducts}</div></div>
          </div>
          <div className="stat-card">
            <span className="stat-icon">🏪</span>
            <div><div className="stat-label">客戶數</div><div className="stat-value">{stats.totalCustomers}</div></div>
          </div>
          <div className="stat-card">
            <span className="stat-icon">⏳</span>
            <div><div className="stat-label">待處理訂單</div><div className="stat-value" style={{color:'#e3a008'}}>{stats.pendingOrders}</div></div>
          </div>
          <div className="stat-card">
            <span className="stat-icon">📅</span>
            <div><div className="stat-label">今日訂單 / 金額</div><div className="stat-value" style={{fontSize:18}}>{stats.todayOrders} 筆<br/><span style={{fontSize:14,color:'#0e9f6e'}}>{fmt(stats.todayAmount)}</span></div></div>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <span className="card-title">📋 最新訂單</span>
            <button className="btn btn-outline btn-sm" onClick={() => navigate('/orders')}>查看全部</button>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>訂單編號</th><th>客戶</th><th>業務</th><th>日期</th><th>金額</th><th>狀態</th><th></th></tr>
              </thead>
              <tbody>
                {stats.recentOrders.map(o => (
                  <tr key={o.OrderID}>
                    <td><code style={{fontSize:12}}>{o.OrderNo}</code></td>
                    <td>{o.CompanyName}</td>
                    <td>{o.EmployeeName}</td>
                    <td>{fmtDate(o.OrderDate)}</td>
                    <td className="text-right">{fmt(o.TotalAmount)}</td>
                    <td><span className={`badge badge-${o.Status}`}>{STATUS_MAP[o.Status]}</span></td>
                    <td><button className="btn btn-ghost btn-sm" onClick={() => navigate(`/orders/${o.OrderID}`)}>詳情 →</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
