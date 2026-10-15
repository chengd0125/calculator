import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import api from '../api.js';
import useBarcodeScanner, { useScanMode, scanInputProps } from '../hooks/useBarcodeScanner.js';

const STATUS_MAP    = { pending:'待處理', picking:'撿貨中', completed:'完成撿貨', cancelled:'取消' };
const STATUS_COLORS = { pending:'badge-pending', picking:'badge-picking', completed:'badge-completed', cancelled:'badge-cancelled' };
const fmt     = n  => 'NT$ ' + Number(n||0).toLocaleString();
const fmtDate = s  => s ? new Date(s).toLocaleDateString('zh-TW') : '';


export default function OrderDetailPage() {
  const { id }   = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const user     = JSON.parse(localStorage.getItem('user') || '{}');

  const [order,      setOrder]      = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [settings,   setSettings]   = useState({});
  const [savingPick, setSavingPick] = useState(false);
  const [newOrder,   setNewOrder]   = useState(location.state?.newOrder || false);

  // 編輯相關
  const [editing,          setEditing]          = useState(false);
  const [editItems,        setEditItems]        = useState([]);
  const [editNotes,        setEditNotes]        = useState('');
  const [editBarcode,      setEditBarcode]      = useState('');
  const [editSearchResults,setEditSearchResults]= useState([]);
  const [editSearching,    setEditSearching]    = useState(false);
  const [showEditDropdown, setShowEditDropdown] = useState(false);
  const editSearchTimer = useRef(null);
  const editBarcodeRef  = useRef(null);
  const detectScan      = useBarcodeScanner();
  const [scanMode, toggleScanMode] = useScanMode();

  const load = async () => {
    setLoading(true);
    try {
      const [orderRes, settingsRes] = await Promise.all([
        api.get(`/orders/${id}`),
        api.get('/settings'),
      ]);
      setOrder(orderRes.data);
      setSettings(settingsRes.data);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [id]);
  useEffect(() => {
    if (newOrder) { const t = setTimeout(() => setNewOrder(false), 4000); return () => clearTimeout(t); }
  }, [newOrder]);

  async function updatePicked(item, qty) {
    setSavingPick(true);
    try {
      await api.put(`/orders/${id}/items/${item.ItemID}/picked`, { pickedQty: qty });
      setOrder(prev => ({
        ...prev,
        items: prev.items.map(i => i.ItemID === item.ItemID ? { ...i, PickedQty: qty } : i)
      }));
    } finally { setSavingPick(false); }
  }

  async function pickAll() {
    if (!confirm('確定標記所有商品為已撿完？')) return;
    setSavingPick(true);
    for (const item of order.items) {
      await api.put(`/orders/${id}/items/${item.ItemID}/picked`, { pickedQty: item.Quantity });
    }
    await load();
    setSavingPick(false);
  }

  async function changeStatus(newStatus) {
    const labels = { picking:'撿貨中', completed:'完成撿貨', cancelled:'取消' };
    if (!confirm(`確定將狀態改為「${labels[newStatus]}」？`)) return;
    await api.put(`/orders/${id}/status`, { status: newStatus });
    load();
  }

  async function deleteOrder() {
    if (!confirm(`確定刪除訂單「${order.OrderNo}」？此動作無法復原，資料庫紀錄將一併刪除。`)) return;
    try {
      await api.delete(`/orders/${id}`);
      navigate('/orders');
    } catch (err) {
      alert(err.response?.data?.message || '刪除失敗');
    }
  }

  async function exportExcel() {
    const res = await api.get(`/orders/${id}/export`, { responseType: 'blob' });
    const url = URL.createObjectURL(res.data);
    Object.assign(document.createElement('a'), { href: url, download: `${order.OrderNo}.xlsx` }).click();
  }

  // ===== 編輯功能 =====
  function startEdit() {
    setEditItems(order.items.map(i => ({ ...i })));
    setEditNotes(order.Notes || '');
    setEditing(true);
  }

  function cancelEdit() {
    setEditing(false);
    setEditBarcode('');
    setEditSearchResults([]);
    setShowEditDropdown(false);
  }

  async function saveEdit() {
    if (!editItems.length) return alert('請至少保留一項商品');
    try {
      await api.put(`/orders/${id}`, { items: editItems, Notes: editNotes });
      setEditing(false);
      load();
    } catch (err) {
      alert(err.response?.data?.message || '更新失敗');
    }
  }

  function updateEditQty(idx, val) {
    const qty = Math.max(1, parseInt(val) || 1);
    const updated = [...editItems];
    updated[idx] = { ...updated[idx], Quantity: qty, Amount: qty * updated[idx].UnitPrice };
    setEditItems(updated);
  }

  function updateEditPrice(idx, val) {
    const price = parseFloat(val) || 0;
    const updated = [...editItems];
    updated[idx] = { ...updated[idx], UnitPrice: price, Amount: updated[idx].Quantity * price };
    setEditItems(updated);
  }

  function removeEditItem(idx) { setEditItems(editItems.filter((_, i) => i !== idx)); }

  function onEditBarcodeChange(e) {
    const val = e.target.value;
    setEditBarcode(val);
    setShowEditDropdown(false);
    clearTimeout(editSearchTimer.current);
    if (val.trim().length < 1) { setEditSearchResults([]); return; }
    editSearchTimer.current = setTimeout(async () => {
      setEditSearching(true);
      try {
        const res = await api.get('/products/search', { params: { q: val.trim() } });
        setEditSearchResults(res.data);
        setShowEditDropdown(res.data.length > 0);
      } finally { setEditSearching(false); }
    }, 300);
  }

  function onEditBarcodeKey(e) {
    const scanned = detectScan(e);
    if (scanned) {
      // 輸入法可能把注音寫回欄位，稍後以正確條碼覆寫並查詢
      setTimeout(async () => {
        clearTimeout(editSearchTimer.current);
        setEditBarcode(scanned);
        try {
          const res = await api.get('/products/search', { params: { q: scanned } });
          setEditSearchResults(res.data);
          if (res.data.length === 1)    addEditProduct(res.data[0]);
          else if (res.data.length > 1) setShowEditDropdown(true);
          else alert(`找不到：${scanned}`);
        } catch { alert('搜尋商品時發生錯誤'); }
      }, 30);
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (editSearchResults.length === 1)    addEditProduct(editSearchResults[0]);
      else if (editSearchResults.length > 1) setShowEditDropdown(true);
    }
    if (e.key === 'Escape') setShowEditDropdown(false);
  }

  function addEditProduct(p) {
    setShowEditDropdown(false);
    setEditSearchResults([]);
    setEditBarcode('');
    const existing = editItems.findIndex(i => i.ProductID === p.ProductID);
    if (existing >= 0) {
      const updated = [...editItems];
      updated[existing].Quantity += 1;
      updated[existing].Amount = updated[existing].Quantity * updated[existing].UnitPrice;
      setEditItems(updated);
    } else {
      setEditItems(prev => [...prev, {
        ProductID: p.ProductID, Barcode: p.Barcode,
        ProductName: p.ProductName, Unit: p.Unit,
        Quantity: 1, UnitPrice: p.SalePrice, Amount: p.SalePrice,
      }]);
    }
    setTimeout(() => editBarcodeRef.current?.focus(), 100);
  }

  if (loading) return <div className="loading-center"><span className="spinner" /></div>;
  if (!order)  return <div className="page-body"><div className="alert alert-error">訂單不存在</div></div>;

  const totalQty    = order.items.reduce((s, i) => s + i.Quantity,  0);
  const totalPicked = order.items.reduce((s, i) => s + i.PickedQty, 0);
  const allPicked   = order.items.every(i => i.PickedQty >= i.Quantity);

  return (
    <>
      {/* ===== 頁面操作列（不列印）===== */}
      <div className="page-header no-print">
        <div>
          <div className="page-title">
            <button className="btn btn-ghost btn-sm" onClick={() => navigate('/orders')}>← 返回</button>
            &nbsp;{order.OrderNo}
          </div>
          <div className="page-subtitle">
            <span className={`badge ${STATUS_COLORS[order.Status]}`}>{STATUS_MAP[order.Status]}</span>
          </div>
        </div>
        <div className="flex gap-8">
          {user.role !== 'sales' && order.Status === 'pending' && (
            <button className="btn btn-success" onClick={() => changeStatus('completed')}>完成撿貨</button>
          )}
          {user.role !== 'sales' && order.Status === 'picking' && (
            <>
              {!allPicked && <button className="btn btn-outline" onClick={pickAll} disabled={savingPick}>✅ 全部撿完</button>}
              <button className="btn btn-success" onClick={() => changeStatus('completed')} disabled={!allPicked}>
                {allPicked ? '完成撿貨 🎉' : `撿貨中 (${totalPicked}/${totalQty})`}
              </button>
            </>
          )}
          {order.Status === 'pending' && (
            <button className="btn btn-outline" style={{color:'#e02424'}} onClick={() => changeStatus('cancelled')}>取消</button>
          )}
          {(user.role === 'admin' || user.role === 'sales') && order.Status === 'pending' && (
            <button className="btn btn-warning" onClick={startEdit}>✏️ 編輯訂單</button>
          )}
          {user.role === 'admin' && (
            <button className="btn btn-danger" onClick={deleteOrder}>🗑️ 刪除訂單</button>
          )}
          <button className="btn btn-outline" onClick={exportExcel}>📤 匯出 Excel</button>
          <button className="btn btn-primary" onClick={() => window.print()}>🖨️ 列印出貨單</button>
        </div>
      </div>

      <div className="page-body">
        {newOrder && (
          <div className="alert alert-success no-print">🎉 訂單 <b>{order.OrderNo}</b> 建立成功！</div>
        )}

        {/* ===== 編輯訂單 Modal ===== */}
        {editing && (
          <div className="modal-overlay" onClick={e => e.target === e.currentTarget && cancelEdit()}>
            <div className="modal" style={{maxWidth:900, width:'95vw'}}>
              <div className="modal-header">
                <span className="modal-title">✏️ 編輯訂單 — {order.OrderNo}</span>
                <button className="modal-close" onClick={cancelEdit}>✕</button>
              </div>
              <div className="modal-body">

                {/* 搜尋加入商品 */}
                <div style={{marginBottom:16, position:'relative'}}>
                  <label style={{display:'block', marginBottom:6, fontWeight:600}}>新增商品
                    <button type="button" onClick={() => { toggleScanMode(); editBarcodeRef.current?.focus(); }}
                      style={{marginLeft:8, padding:'2px 10px', fontSize:12, background: scanMode ? '#057a55' : '#9ca3af', color:'#fff', border:'none', borderRadius:6, cursor:'pointer'}}>
                      {scanMode ? '掃描槍模式：開' : '掃描槍模式：關'}
                    </button>
                  </label>
                  <input
                    ref={editBarcodeRef}
                    {...scanInputProps(scanMode)}
                    value={editBarcode}
                    onChange={onEditBarcodeChange}
                    onKeyDown={onEditBarcodeKey}
                    placeholder={scanMode ? '掃描槍模式：直接掃描條碼（要打中文請關閉）' : '輸入條碼或商品名稱搜尋...'}
                    style={{width:'100%', fontSize:14, padding:'8px 12px', border:'1px solid #d1d5db', borderRadius:8}}
                  />
                  {showEditDropdown && editSearchResults.length > 0 && (
                    <div style={{
                      position:'absolute', top:'100%', left:0, right:0, zIndex:999,
                      background:'#fff', border:'1px solid #d1d5db',
                      borderRadius:8, boxShadow:'0 8px 24px rgba(0,0,0,.12)',
                      maxHeight:240, overflowY:'auto'
                    }}>
                      {editSearchResults.map(p => (
                        <div key={p.ProductID} onClick={() => addEditProduct(p)}
                          style={{padding:'8px 14px', cursor:'pointer', display:'flex', justifyContent:'space-between', borderBottom:'1px solid #f9fafb'}}
                          onMouseEnter={e => e.currentTarget.style.background = '#f0f6ff'}
                          onMouseLeave={e => e.currentTarget.style.background = ''}
                        >
                          <div>
                            <span style={{fontWeight:600}}>{p.ProductName}</span>
                            {p.Barcode && <span style={{fontSize:12, color:'#9ca3af', marginLeft:8}}>{p.Barcode}</span>}
                          </div>
                          <span style={{color:'#1a56db', fontWeight:700}}>NT$ {Number(p.SalePrice).toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* 明細表 */}
                <div style={{maxHeight:360, overflowY:'auto', marginBottom:16}}>
                  <table style={{width:'100%', borderCollapse:'collapse'}}>
                    <thead>
                      <tr>
                        <th style={{padding:'8px 10px', background:'#f9fafb', textAlign:'left', fontSize:13}}>#</th>
                        <th style={{padding:'8px 10px', background:'#f9fafb', textAlign:'left', fontSize:13}}>商品名稱</th>
                        <th style={{padding:'8px 10px', background:'#f9fafb', textAlign:'left', fontSize:13}}>單位</th>
                        <th style={{padding:'8px 10px', background:'#f9fafb', textAlign:'right', fontSize:13}}>數量</th>
                        <th style={{padding:'8px 10px', background:'#f9fafb', textAlign:'right', fontSize:13}}>單價</th>
                        <th style={{padding:'8px 10px', background:'#f9fafb', textAlign:'right', fontSize:13}}>小計</th>
                        <th style={{padding:'8px 10px', background:'#f9fafb'}}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {editItems.length === 0 ? (
                        <tr><td colSpan={7} style={{textAlign:'center', padding:24, color:'#9ca3af'}}>請新增商品</td></tr>
                      ) : editItems.map((item, idx) => (
                        <tr key={idx} style={{borderBottom:'1px solid #f3f4f6'}}>
                          <td style={{padding:'6px 10px', color:'#9ca3af'}}>{idx+1}</td>
                          <td style={{padding:'6px 10px', fontWeight:600}}>{item.ProductName}</td>
                          <td style={{padding:'6px 10px'}}>{item.Unit}</td>
                          <td style={{padding:'6px 10px', textAlign:'right'}}>
                            <input type="number" min="1" value={item.Quantity}
                              onChange={e => updateEditQty(idx, e.target.value)}
                              style={{width:70, padding:'4px 8px', textAlign:'center', border:'1px solid #d1d5db', borderRadius:6}} />
                          </td>
                          <td style={{padding:'6px 10px', textAlign:'right'}}>
                            <input type="number" min="0" step="0.01" value={item.UnitPrice}
                              onChange={e => updateEditPrice(idx, e.target.value)}
                              style={{width:90, padding:'4px 8px', textAlign:'right', border:'1px solid #d1d5db', borderRadius:6}} />
                          </td>
                          <td style={{padding:'6px 10px', textAlign:'right', fontWeight:600, color:'#1a56db'}}>
                            {Number(item.Amount).toLocaleString()}
                          </td>
                          <td style={{padding:'6px 10px', textAlign:'center'}}>
                            <button className="btn btn-ghost btn-sm" style={{color:'#e02424'}}
                              onClick={() => removeEditItem(idx)}>✕</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* 備註 */}
                <div className="form-group" style={{marginBottom:12}}>
                  <label>備註</label>
                  <textarea value={editNotes} onChange={e => setEditNotes(e.target.value)} rows={2} />
                </div>

                {/* 合計 */}
                <div style={{textAlign:'right', fontSize:16, fontWeight:700}}>
                  訂單總額：
                  <span style={{color:'#1a56db', fontSize:20, marginLeft:8}}>
                    NT$ {editItems.reduce((s, i) => s + i.Amount, 0).toLocaleString()}
                  </span>
                </div>

              </div>
              <div className="modal-footer">
                <button className="btn btn-outline" onClick={cancelEdit}>取消</button>
                <button className="btn btn-primary" onClick={saveEdit}>💾 儲存變更</button>
              </div>
            </div>
          </div>
        )}

        {/* ===== 列印文件 ===== */}
        <div className="print-doc">

          {/* --- 標頭 --- */}
          <div style={{paddingBottom:10, borderBottom:'2px solid #111', marginBottom:12}}>
            <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:8, position:'relative'}}>
              <h1 style={{fontSize:'16pt', fontWeight:800}}>{settings.COMPANY_NAME || '您的公司名稱'}</h1>
              <h2 style={{fontSize:'18pt', fontWeight:800, letterSpacing:4, position:'absolute', left:'50%', transform:'translateX(-50%)'}}>出 貨 單</h2>
            </div>
            {settings.COMPANY_PHONE   && <p style={{fontSize:'10pt', color:'#555'}}>{settings.COMPANY_PHONE}</p>}
            {settings.COMPANY_ADDRESS && <p style={{fontSize:'10pt', color:'#555', marginBottom:8}}>{settings.COMPANY_ADDRESS}</p>}
            <div style={{fontSize:'11pt'}}>
              <div style={{display:'flex', gap:'20pt', marginBottom:'3pt', whiteSpace:'nowrap'}}>
                <span><span style={{color:'#555'}}>客戶代碼：</span><b>{order.CustomerCode || '-'}</b></span>
                <span><span style={{color:'#555'}}>客戶名稱：</span><b>{order.CompanyName}</b></span>
              </div>
              <div style={{display:'flex', gap:'20pt', whiteSpace:'nowrap'}}>
                <span><span style={{color:'#555'}}>單號：</span><b>{order.OrderNo}</b></span>
                <span><span style={{color:'#555'}}>日期：</span><b>{fmtDate(order.OrderDate)}</b></span>
                <span><span style={{color:'#555'}}>業務：</span><b>{order.EmployeeName}</b></span>
              </div>
            </div>
          </div>

          {/* --- 商品明細表 --- */}
          <table className="print-table" style={{width:'100%', marginTop:'8pt'}}>
            <thead>
              <tr>
                <th style={{width:'5%',  textAlign:'center'}}>項次</th>
                <th style={{width:'18%'}}>條碼</th>
                <th>商品名稱</th>
                <th style={{width:'7%',  textAlign:'center'}}>單位</th>
                <th style={{width:'8%',  textAlign:'right'}}>數量</th>
                <th style={{width:'10%', textAlign:'right'}}>單價</th>
                <th style={{width:'12%', textAlign:'right'}}>小計</th>
                {order.Status === 'picking' && (
                  <th className="no-print" style={{width:'9%', textAlign:'center'}}>撿貨</th>
                )}
              </tr>
            </thead>
            <tbody>
              {order.items.map((item, idx) => (
                <tr key={item.ItemID}
                  style={item.PickedQty >= item.Quantity && order.Status === 'picking' ? {background:'#f0fdf4'} : {}}>
                  <td style={{textAlign:'center'}}>{idx + 1}</td>
                  <td style={{fontFamily:'monospace', fontSize:'10pt'}}>{item.Barcode || '-'}</td>
                  <td style={{fontWeight:600}}>{item.ProductName}</td>
                  <td style={{textAlign:'center'}}>{item.Unit}</td>
                  <td style={{textAlign:'right', fontWeight:700}}>{item.Quantity}</td>
                  <td style={{textAlign:'right'}}>{Number(item.UnitPrice).toLocaleString()}</td>
                  <td style={{textAlign:'right', fontWeight:700, color:'#1a3a8f'}}>{Number(item.Amount).toLocaleString()}</td>
                  {order.Status === 'picking' && (
                    <td className="no-print" style={{textAlign:'center'}}>
                      <input
                        type="number" min="0" max={item.Quantity}
                        value={item.PickedQty}
                        onChange={e => updatePicked(item, parseInt(e.target.value)||0)}
                        disabled={savingPick}
                        style={{
                          width:52, padding:'3px 4px', textAlign:'center', fontWeight:700,
                          border: item.PickedQty >= item.Quantity ? '2px solid #0e9f6e' : '2px solid #fbbf24',
                          borderRadius:6,
                          background: item.PickedQty >= item.Quantity ? '#f0fdf4' : '#fffbeb',
                        }}
                      />
                      <div style={{fontSize:'9pt', color:'#9ca3af'}}>/{item.Quantity}</div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>

          {/* --- 合計區 --- */}
          <div style={{display:'flex', justifyContent:'flex-end', marginTop:'12pt'}}>
            <table style={{borderCollapse:'collapse', fontSize:'12pt', minWidth:'260pt'}}>
              <tbody>
                <tr>
                  <td style={{padding:'4pt 16pt 4pt 0', color:'#555', borderBottom:'1px solid #e5e7eb'}}>品項數</td>
                  <td style={{padding:'4pt 0', textAlign:'right', borderBottom:'1px solid #e5e7eb'}}>{order.items.length} 項</td>
                </tr>
                <tr>
                  <td style={{padding:'4pt 16pt 4pt 0', color:'#555', borderBottom:'1px solid #e5e7eb'}}>總數量</td>
                  <td style={{padding:'4pt 0', textAlign:'right', borderBottom:'1px solid #e5e7eb'}}>{totalQty} 件</td>
                </tr>
                {order.Notes && (
                  <tr>
                    <td style={{padding:'4pt 16pt 4pt 0', color:'#555', borderBottom:'1px solid #e5e7eb'}}>備註</td>
                    <td style={{padding:'4pt 0', textAlign:'right', borderBottom:'1px solid #e5e7eb', fontSize:'10pt'}}>{order.Notes}</td>
                  </tr>
                )}
                <tr>
                  <td style={{padding:'8pt 16pt 4pt 0', fontWeight:800, fontSize:'14pt', borderTop:'2px solid #111'}}>訂單總額</td>
                  <td style={{padding:'8pt 0 4pt 0', textAlign:'right', fontWeight:800, fontSize:'14pt', color:'#1a3a8f', borderTop:'2px solid #111'}}>
                    {fmt(order.TotalAmount)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* --- 簽名欄 --- */}
          <div className="print-signatures" style={{
            display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'20pt',
            marginTop:'30pt', paddingTop:'12pt', borderTop:'1px solid #ccc'
          }}>
            {['送貨人員', '客戶簽收', '業務確認'].map(label => (
              <div key={label} style={{textAlign:'center'}}>
                <div style={{height:'36pt'}} />
                <div style={{borderTop:'1px solid #aaa', paddingTop:'6pt', fontSize:'11pt', color:'#555'}}>{label}</div>
              </div>
            ))}
          </div>

          {/* --- 列印時間 --- */}
          <div style={{marginTop:'12pt', paddingTop:'8pt', borderTop:'1px solid #e5e7eb', fontSize:'9pt', color:'#9ca3af', textAlign:'center'}}>
            列印時間：{new Date().toLocaleString('zh-TW')}
          </div>

        </div>
      </div>
    </>
  );
}
