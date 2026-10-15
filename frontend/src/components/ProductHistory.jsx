import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import api from '../api.js';

const STATUS_MAP    = { pending:'待處理', picking:'撿貨中', completed:'完成撿貨' };
const STATUS_COLORS = { pending:'badge-pending', picking:'badge-picking', completed:'badge-completed' };
const fmtDate  = s => s ? new Date(s).toLocaleDateString('zh-TW') : '';
const fmtMoney = n => 'NT$ ' + Number(n || 0).toLocaleString();
const custLabel = r => (r.CustomerCode ? `[${r.CustomerCode}] ` : '') + r.CompanyName;

/**
 * 商品出貨紀錄
 * - compact：抄貨時使用，只顯示指定客戶最近幾筆，可一鍵帶入上次單價
 * - 一般模式：商品資料頁使用，可用下拉選單篩選客戶
 */
export default function ProductHistory({ productId, customerId, compact = false, limit = 5, onUsePrice }) {
  const [rows,    setRows]    = useState([]);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');
  const [filter,  setFilter]  = useState('');

  useEffect(() => {
    if (!productId || (compact && !customerId)) { setRows([]); return; }
    let alive = true;
    setLoading(true);
    setError('');
    api.get(`/products/${productId}/history`, {
      params: compact ? { customerId, limit } : { limit: 500 },
    })
      .then(r => { if (alive) setRows(r.data); })
      .catch(err => { if (alive) setError(err.response?.data?.message || '查詢失敗'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [productId, customerId, compact, limit]);

  // 篩選選單只列出真的買過這個商品的客戶
  const customers = useMemo(() => {
    const m = new Map();
    for (const r of rows) if (!m.has(r.CustomerID)) m.set(r.CustomerID, { id: r.CustomerID, label: custLabel(r), count: 0, qty: 0 });
    for (const r of rows) { const c = m.get(r.CustomerID); c.count++; c.qty += r.Quantity; }
    return [...m.values()].sort((a, b) => b.count - a.count);
  }, [rows]);

  const shown = filter ? rows.filter(r => String(r.CustomerID) === filter) : rows;
  const totalQty = shown.reduce((s, r) => s + r.Quantity, 0);

  if (compact) {
    if (!customerId) return <div style={{fontSize:13, color:'#6b7280'}}>先選擇客戶，就能看到這位客戶以前的抄貨紀錄</div>;
    if (loading) return <div style={{fontSize:13, color:'#6b7280'}}>查詢歷史紀錄中...</div>;
    if (error)   return <div style={{fontSize:13, color:'#e02424'}}>{error}</div>;
    if (!rows.length) return <div style={{fontSize:13, color:'#6b7280'}}>📜 這位客戶以前沒有抄過這個商品</div>;
    return (
      <div style={{fontSize:13}}>
        <div style={{fontWeight:600, marginBottom:4}}>📜 這位客戶最近的抄貨紀錄</div>
        <table style={{fontSize:13}}>
          <thead><tr><th>日期</th><th>單號</th><th className="text-right">數量</th><th className="text-right">單價</th><th></th></tr></thead>
          <tbody>
            {rows.map(r => (
              <tr key={`${r.OrderID}-${r.UnitPrice}-${r.Quantity}`}>
                <td>{fmtDate(r.OrderDate)}</td>
                <td><code>{r.OrderNo}</code></td>
                <td className="text-right">{r.Quantity} {r.Unit}</td>
                <td className="text-right">{fmtMoney(r.UnitPrice)}</td>
                <td>
                  {onUsePrice && (
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => onUsePrice(r.UnitPrice)}>用此單價</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div>
      <div className="flex gap-8" style={{alignItems:'center', flexWrap:'wrap', marginBottom:12}}>
        <label style={{fontWeight:600}}>客戶</label>
        <select value={filter} onChange={e => setFilter(e.target.value)} style={{minWidth:220}}>
          <option value="">全部客戶（{rows.length} 筆）</option>
          {customers.map(c => (
            <option key={c.id} value={c.id}>{c.label}（{c.count} 筆，共 {c.qty}）</option>
          ))}
        </select>
        {shown.length > 0 && <span style={{color:'#6b7280', fontSize:13}}>共 {shown.length} 筆，數量合計 {totalQty}</span>}
      </div>
      {loading ? (
        <div className="loading-center"><span className="spinner" /></div>
      ) : error ? (
        <div className="alert alert-error">{error}</div>
      ) : shown.length === 0 ? (
        <div className="empty-state"><span className="icon">📜</span>沒有出貨紀錄</div>
      ) : (
        <div style={{maxHeight:'55vh', overflowY:'auto'}}>
          <table>
            <thead>
              <tr><th>日期</th><th>單號</th><th>客戶</th><th>業務</th><th className="text-right">數量</th><th className="text-right">單價</th><th className="text-right">金額</th><th>狀態</th></tr>
            </thead>
            <tbody>
              {shown.map(r => (
                <tr key={`${r.OrderID}-${r.UnitPrice}-${r.Quantity}`}>
                  <td>{fmtDate(r.OrderDate)}</td>
                  <td><Link to={`/orders/${r.OrderID}`} style={{fontFamily:'monospace'}}>{r.OrderNo}</Link></td>
                  <td>{custLabel(r)}</td>
                  <td>{r.EmployeeName}</td>
                  <td className="text-right">{r.Quantity} {r.Unit}</td>
                  <td className="text-right">{fmtMoney(r.UnitPrice)}</td>
                  <td className="text-right">{fmtMoney(r.Amount)}</td>
                  <td><span className={`badge ${STATUS_COLORS[r.Status] || ''}`}>{STATUS_MAP[r.Status] || r.Status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
