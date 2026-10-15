import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api.js';
import useBarcodeScanner, { useScanMode, scanInputProps } from '../hooks/useBarcodeScanner.js';
import { USER_KEY } from '../storage.js';
import { createBarcodeScannerConfig } from '../cameraScanner.js';

let html5QrCode = null;

export default function NewReturnPage() {
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem(USER_KEY) || '{}');

  const [customers,     setCustomers]    = useState([]);
  const [selectedCust,  setSelectedCust] = useState('');
  const [barcode,       setBarcode]      = useState('');
  const [searchResults, setSearchResults]= useState([]);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [pendingQty,      setPendingQty]      = useState('1');
  const [items,         setItems]        = useState([]);
  const [notes,         setNotes]        = useState('');
  const [msg,           setMsg]          = useState(null);
  const [submitting,    setSubmitting]   = useState(false);
  const [cameraOn,      setCameraOn]     = useState(false);
  const [cameraErr,     setCameraErr]    = useState('');
  const [showDropdown,  setShowDropdown] = useState(false);

  const barcodeRef  = useRef();
  const detectScan  = useBarcodeScanner();
  const [scanMode, toggleScanMode] = useScanMode();
  const dropdownRef = useRef();
  const searchTimer = useRef();

  useEffect(() => {
    api.get('/customers').then(r => setCustomers(r.data));
    return () => {
      if (html5QrCode && html5QrCode.isScanning) html5QrCode.stop().catch(console.error);
    };
  }, []);

  useEffect(() => {
    function handler(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setShowDropdown(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  function onBarcodeChange(e) {
    const val = e.target.value;
    setBarcode(val);
    setShowDropdown(false);
    clearTimeout(searchTimer.current);
    if (val.trim().length < 1) { setSearchResults([]); return; }
    searchTimer.current = setTimeout(async () => {
      try {
        const res = await api.get('/products/search', { params: { q: val.trim() } });
        setSearchResults(res.data);
        setShowDropdown(res.data.length > 0);
      } catch {}
    }, 300);
  }

  async function lookup(query) {
    if (!query) return;
    try {
      const res = await api.get('/products/search', { params: { q: query } });
      setSearchResults(res.data);
      if (res.data.length === 1) selectProduct(res.data[0]);
      else if (res.data.length > 1) setShowDropdown(true);
      else { setShowDropdown(false); setMsg({ type:'error', text:`❌ 找不到：${query}` }); setTimeout(() => setMsg(null), 3000); }
    } catch {
      setMsg({ type:'error', text:'搜尋商品時發生錯誤' });
    }
  }

  function onBarcodeKey(e) {
    const scanned = detectScan(e);
    if (scanned) {
      // 輸入法可能把注音寫回欄位，稍後以正確條碼覆寫
      setTimeout(() => {
        clearTimeout(searchTimer.current);
        setBarcode(scanned);
        lookup(scanned);
      }, 30);
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      lookup(barcode.trim());
    }
    if (e.key === 'Escape') setShowDropdown(false);
  }

  function selectProduct(p) {
    setShowDropdown(false);
    setSearchResults([]);
    setBarcode('');
    setSelectedProduct(p);
    setPendingQty('1');
  }

  function addProduct() {
    if (!selectedProduct) return;
    const p = selectedProduct;
    const qty = Number(pendingQty);
    if (!Number.isInteger(qty) || qty <= 0) {
      setMsg({ type:'error', text:'請輸入大於 0 的整數數量' });
      return;
    }
    const existing = items.findIndex(i => i.ProductID === p.ProductID);
    if (existing >= 0) {
      const updated = [...items];
      updated[existing].Quantity += qty;
      updated[existing].Amount = updated[existing].Quantity * updated[existing].UnitPrice;
      setItems(updated);
      setMsg({ type:'info', text:`「${p.ProductName}」已加入，數量 +${qty}` });
    } else {
      setItems(prev => [...prev, {
        ProductID: p.ProductID, Barcode: p.Barcode,
        ProductName: p.ProductName, Unit: p.Unit,
        Quantity: qty, UnitPrice: p.SalePrice, Amount: qty * p.SalePrice,
      }]);
      setMsg({ type:'success', text:`✅ 已加入「${p.ProductName}」` });
    }
    setSelectedProduct(null);
    setPendingQty('1');
    if (html5QrCode?.isScanning) html5QrCode.resume();
    setTimeout(() => setMsg(null), 2500);
    barcodeRef.current?.focus();
  }

  function cancelProduct() {
    setSelectedProduct(null);
    setPendingQty('1');
    if (html5QrCode?.isScanning) html5QrCode.resume();
    barcodeRef.current?.focus();
  }

  function updateQty(idx, val) {
    const qty = val === '' ? '' : Math.max(1, parseInt(val, 10) || 1);
    const updated = [...items];
    updated[idx] = { ...updated[idx], Quantity: qty, Amount: (Number(qty) || 0) * updated[idx].UnitPrice };
    setItems(updated);
  }

  function normalizeQty(idx) {
    if (items[idx].Quantity === '') updateQty(idx, '1');
  }

  function updatePrice(idx, val) {
    const price = val === '' ? '' : parseFloat(val) || 0;
    const updated = [...items];
    updated[idx] = { ...updated[idx], UnitPrice: price, Amount: (Number(updated[idx].Quantity) || 0) * (Number(price) || 0) };
    setItems(updated);
  }

  function normalizePrice(idx) {
    if (items[idx].UnitPrice === '') updatePrice(idx, '0');
  }

  function removeItem(idx) { setItems(items.filter((_, i) => i !== idx)); }

  async function startCamera() {
    setCameraErr('');
    if (typeof Html5Qrcode === 'undefined') { setCameraErr('錯誤：掃描套件尚未載入'); return; }
    try {
      if (!html5QrCode) html5QrCode = new Html5Qrcode('reader-return');
      setCameraOn(true);
      await html5QrCode.start(
        { facingMode: 'environment' },
        createBarcodeScannerConfig(),
        async (decodedText) => {
          setBarcode(decodedText);
          try {
            const res = await api.get('/products/search', { params: { q: decodedText } });
            if (res.data.length === 1) {
              selectProduct(res.data[0]);
              if (html5QrCode) html5QrCode.pause();
            } else if (res.data.length > 1) {
              setSearchResults(res.data); setShowDropdown(true);
            } else {
              setMsg({ type:'error', text:`❌ 條碼 ${decodedText} 找不到商品` });
              setTimeout(() => setMsg(null), 3500);
            }
          } catch {}
        }
      );
    } catch (err) { setCameraErr('無法開啟相機：' + err); setCameraOn(false); }
  }

  async function stopCamera() {
    if (html5QrCode) { try { await html5QrCode.stop(); } catch {} setCameraOn(false); }
  }

  async function submitReturn() {
    if (!selectedCust) return setMsg({ type:'error', text:'請選擇客戶' });
    if (!items.length)  return setMsg({ type:'error', text:'請至少加入一項商品' });
    setSubmitting(true);
    try {
      const res = await api.post('/returns', { CustomerID: selectedCust, items, Notes: notes });
      navigate(`/returns/${res.data.ReturnID}`, { state: { newReturn: true } });
    } catch (err) {
      setMsg({ type:'error', text: err.response?.data?.message || '退貨單建立失敗' });
      setSubmitting(false);
    }
  }

  const total = items.reduce((s, i) => s + (Number(i.Amount) || 0), 0);
  const fmt   = n => 'NT$ ' + Number(n).toLocaleString();

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">↩️ 退貨開單</div>
          <div className="page-subtitle">業務：{user.name}</div>
        </div>
      </div>

      <div className="page-body">
        <div className="card" style={{marginBottom:16}}>
          <div className="card-header"><span className="card-title">🏪 選擇客戶</span></div>
          <div className="card-body">
            <select value={selectedCust} onChange={e => setSelectedCust(e.target.value)} style={{width:'100%', fontSize:15, padding:'10px 12px'}}>
              <option value="">— 請選擇客戶 —</option>
              {customers.map(c => (
                <option key={c.CustomerID} value={c.CustomerID}>
                  {c.CustomerCode ? `[${c.CustomerCode}] ` : ''}{c.CompanyName}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="scan-area">
          <label>🔍 掃描 / 輸入條碼或商品名稱</label>
          <div style={{position:'relative'}} ref={dropdownRef}>
            <div style={{display:'flex', gap:8, alignItems:'center', flexWrap:'wrap'}}>
              <input ref={barcodeRef} {...scanInputProps(scanMode)} value={barcode} onChange={onBarcodeChange} onKeyDown={onBarcodeKey}
                placeholder={scanMode ? '掃描槍模式：直接掃描條碼（要打中文請關閉）' : '輸入條碼或商品名稱...'}
                style={{flex:'1 1 220px', fontSize:14, padding:'7px 10px', border:'1px solid #d1d5db', borderRadius:8}} />
              <button type="button" onClick={() => { toggleScanMode(); barcodeRef.current?.focus(); }} title="手機接藍牙掃描器時請開啟，避免掃出中文"
                style={{padding:'7px 12px', background: scanMode ? '#057a55' : '#9ca3af', color:'#fff', border:'none', borderRadius:8, cursor:'pointer', whiteSpace:'nowrap'}}>
                {scanMode ? '掃描槍模式：開' : '掃描槍模式：關'}
              </button>
              <button onClick={() => cameraOn ? stopCamera() : startCamera()}
                style={{padding:'7px 14px', background: cameraOn ? '#e02424' : '#d97706', color:'#fff', border:'none', borderRadius:8, cursor:'pointer'}}>
                {cameraOn ? '關閉相機' : '📷 開啟相機'}
              </button>
            </div>
            {showDropdown && searchResults.length > 0 && (
              <div style={{position:'absolute', top:'100%', left:0, right:0, zIndex:999, background:'#fff', border:'1px solid #d1d5db', borderRadius:8, boxShadow:'0 8px 24px rgba(0,0,0,.12)', maxHeight:300, overflowY:'auto'}}>
                {searchResults.map(p => (
                  <div key={p.ProductID} onClick={() => selectProduct(p)} style={{padding:'10px 14px', cursor:'pointer', borderBottom:'1px solid #f9fafb'}}>
                    <div style={{fontWeight:600}}>{p.ProductName}</div>
                    <div style={{fontSize:12, color:'#6b7280'}}>條碼：{p.Barcode} | 售價：{fmt(p.SalePrice)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
          {selectedProduct && (
            <div className="card" style={{marginTop:12, border:'1px solid #fbbf24', background:'#fffbeb'}}>
              <div className="card-body">
                <div style={{fontWeight:700, marginBottom:12}}>待加入退貨商品：{selectedProduct.ProductName}</div>
                <div style={{display:'flex', gap:12, alignItems:'end', flexWrap:'wrap'}}>
                  <label style={{flex:'0 0 120px'}}>退貨數量
                    <input type="number" min="1" step="1" value={pendingQty} onChange={e => setPendingQty(e.target.value)} autoFocus onFocus={e => e.target.select()}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addProduct(); } }} style={{width:'100%', marginTop:4}} />
                  </label>
                  <button className="btn btn-success" onClick={addProduct}>✓ 確認加入明細</button>
                  <button className="btn btn-ghost" onClick={cancelProduct}>取消</button>
                </div>
              </div>
            </div>
          )}
          {cameraErr && <div className="alert alert-error" style={{marginTop:8}}>{cameraErr}</div>}
          <div id="reader-return" style={{width:'100%', maxWidth:450, margin:'15px auto', display: cameraOn ? 'block' : 'none', borderRadius:12, overflow:'hidden', border:'2px solid #d97706', background:'#000', minHeight:250}}></div>
          {msg && <div className={`alert alert-${msg.type}`} style={{marginTop:8}}>{msg.text}</div>}
        </div>

        <div className="card" style={{marginTop:16}}>
          <div className="card-header"><span className="card-title">📋 退貨明細</span></div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>商品名稱</th><th className="text-right">數量</th><th className="text-right">單價</th><th className="text-right">小計</th><th></th></tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr><td colSpan={5} style={{textAlign:'center', padding:40, color:'#9ca3af'}}>尚未加入商品</td></tr>
                ) : items.map((item, idx) => (
                  <tr key={idx}>
                    <td><b>{item.ProductName}</b></td>
                    <td className="text-right">
                      <input className="qty-input" type="number" min="1" step="1" value={item.Quantity} onChange={e => updateQty(idx, e.target.value)} onBlur={() => normalizeQty(idx)} onFocus={e => e.target.select()} style={{width:60}} />
                    </td>
                    <td className="text-right">
                      <input className="qty-input" type="number" min="0" step="0.01" value={item.UnitPrice} onChange={e => updatePrice(idx, e.target.value)} onBlur={() => normalizePrice(idx)} onFocus={e => e.target.select()} style={{width:80}} />
                    </td>
                    <td className="text-right">{item.Amount.toLocaleString()}</td>
                    <td><button onClick={() => removeItem(idx)}>✕</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card" style={{marginTop:16}}>
          <div className="card-body">
            <div className="form-group" style={{marginBottom:12}}>
              <label>備註</label>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="退貨原因..." />
            </div>
            <div style={{textAlign:'right', marginBottom:16}}>
              <div style={{fontSize:16}}>退貨總額：<span style={{fontSize:24, fontWeight:800, color:'#d97706'}}>{fmt(total)}</span></div>
            </div>
            <button className="btn btn-lg" style={{width:'100%', justifyContent:'center', background:'#d97706', color:'#fff', border:'none', borderRadius:8, padding:'12px', fontSize:16, cursor:'pointer'}}
              onClick={submitReturn} disabled={submitting || !items.length || !selectedCust}>
              {submitting ? '建立中...' : '↩️ 確認送出退貨單'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
