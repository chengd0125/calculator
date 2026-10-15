import { useState, useEffect, useRef, useMemo } from 'react';
import api from '../api.js';
import ProductHistory from '../components/ProductHistory.jsx';

const EMPTY = { Barcode:'', ProductName:'', Unit:'個', CostPrice:'', SalePrice:'', Stock:'', Category:'' };
const fmt = n => Number(n||0).toLocaleString();
const PAGE_SIZE = 200;
const showVal = v => (v === null || v === undefined || v === '') ? '（空白）' : String(v);

export default function ProductsPage() {
  const [products,     setProducts]    = useState([]);
  const [search,       setSearch]      = useState('');
  const [modal,        setModal]       = useState(null);
  const [form,         setForm]        = useState(EMPTY);
  const [loading,      setLoading]     = useState(false);
  const [msg,          setMsg]         = useState(null);
  const [importResult, setImportResult]= useState(null);
  const [preview,      setPreview]     = useState(null);   // 匯入預覽：{ file, created, changed, unchanged, errors }
  const [previewTab,   setPreviewTab]  = useState('changed');
  const [importing,    setImporting]   = useState(false);
  const [limit,        setLimit]       = useState(PAGE_SIZE);
  const [historyOf,    setHistoryOf]   = useState(null);   // 正在查看出貨紀錄的商品
  const [perms,        setPerms]       = useState([]);
  const [selected,     setSelected]    = useState(new Set());
  const fileRef = useRef();
  const user    = JSON.parse(localStorage.getItem('user') || '{}');
  const isAdmin = user.role === 'admin';

  const hasPerm = (p) => isAdmin || perms.includes(p);

  useEffect(() => {
    api.get('/permissions/my').then(r => {
      if (r.data.all) setPerms(['all']);
      else setPerms(r.data.permissions);
    }).catch(() => {});
  }, []);

  // 一次載入全部商品，搜尋改在前端篩選，打字時不必每個字都重新向伺服器要資料
  const load = async () => {
    setLoading(true);
    try {
      const r = await api.get('/products');
      setProducts(r.data);
      setSelected(new Set());
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);
  useEffect(() => { setLimit(PAGE_SIZE); }, [search]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products;
    return products.filter(p =>
      (p.ProductName || '').toLowerCase().includes(q) || (p.Barcode || '').toLowerCase().includes(q));
  }, [products, search]);
  const visible = filtered.slice(0, limit);

  function openAdd()    { setForm(EMPTY); setModal('add'); setMsg(null); }
  function openEdit(p)  { setForm({ ...p }); setModal('edit'); setMsg(null); }
  function closeModal() { setModal(null); setMsg(null); }
  const f = k => e => setForm(prev => ({ ...prev, [k]: e.target.value }));

  function toggleOne(id) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (filtered.length > 0 && filtered.every(p => selected.has(p.ProductID))) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map(p => p.ProductID)));
    }
  }

  async function save() {
    if (!form.ProductName) return setMsg({ type:'error', text:'請填寫商品名稱' });
    try {
      if (modal === 'add') await api.post('/products', form);
      else                  await api.put(`/products/${form.ProductID}`, form);
      setMsg({ type:'success', text:'儲存成功' });
      load();
      setTimeout(closeModal, 800);
    } catch (err) {
      setMsg({ type:'error', text: err.response?.data?.message || '儲存失敗' });
    }
  }

  async function del(p) {
    if (!confirm(`確定刪除「${p.ProductName}」？\n若此商品有訂單紀錄將無法刪除。`)) return;
    try {
      await api.delete(`/products/${p.ProductID}`);
      load();
    } catch (err) {
      alert(err.response?.data?.message || '刪除失敗');
    }
  }

  async function bulkDelete() {
    const ids = [...selected];
    if (!confirm(`確定刪除已選 ${ids.length} 筆商品？\n有訂單紀錄的商品將自動跳過。`)) return;
    try {
      const res = await api.delete('/products', { data: { ids } });
      const { deleted, skipped } = res.data;
      const msg = skipped > 0
        ? `已刪除 ${deleted} 筆，${skipped} 筆因有訂單紀錄而跳過`
        : `已刪除 ${deleted} 筆商品`;
      alert(msg);
      load();
    } catch (err) {
      alert(err.response?.data?.message || '批量刪除失敗');
    }
  }

  async function exportXlsx() {
    const res = await api.get('/products/export', { responseType:'blob' });
    const url = URL.createObjectURL(res.data);
    Object.assign(document.createElement('a'), { href: url, download:'products.xlsx' }).click();
  }

  // 匯入第一步：上傳檔案取得差異預覽，不會寫入資料庫
  async function importXlsx(e) {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    setImporting(true);
    try {
      const res = await api.post('/products/import/preview', fd);
      const d = res.data;
      setImportResult(null);
      setPreview({ file, ...d });
      setPreviewTab(d.changed.length ? 'changed' : d.created.length ? 'created' : 'errors');
    } catch (err) {
      alert(err.response?.data?.message || '讀取檔案失敗');
    } finally { setImporting(false); }
  }

  // 匯入第二步：確認後只寫入新增與有變動的商品
  async function applyImport() {
    const fd = new FormData();
    fd.append('file', preview.file);
    setImporting(true);
    try {
      const res = await api.post('/products/import/apply', fd);
      setImportResult(res.data);
      setPreview(null);
      load();
    } catch (err) {
      alert(err.response?.data?.message || '匯入失敗');
    } finally { setImporting(false); }
  }

  const canAdd    = hasPerm('product_add');
  const canEdit   = hasPerm('product_edit');
  const canDelete = hasPerm('product_delete');
  const showOps   = true; // 出貨紀錄人人可看，操作欄固定顯示
  const allChecked = filtered.length > 0 && filtered.every(p => selected.has(p.ProductID));

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-title">🏷️ 商品資料</div>
          <div className="page-subtitle">
            共 {products.length} 項商品{search.trim() && `，符合搜尋 ${filtered.length} 項`}
          </div>
        </div>
        <div className="flex gap-8">
          {canDelete && selected.size > 0 && (
            <button className="btn btn-sm" style={{background:'#e02424', color:'#fff', border:'none'}} onClick={bulkDelete}>
              🗑️ 批量刪除 ({selected.size})
            </button>
          )}
          <button className="btn btn-outline btn-sm" onClick={exportXlsx}>📤 匯出 Excel</button>
          {canAdd && (
            <>
              <button className="btn btn-outline btn-sm" disabled={importing} onClick={() => fileRef.current.click()}>
                {importing && !preview ? '讀取中...' : '📥 匯入 Excel'}
              </button>
              <button className="btn btn-primary btn-sm" onClick={openAdd}>＋ 新增商品</button>
              <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={importXlsx} style={{display:'none'}} />
            </>
          )}
        </div>
      </div>

      <div className="page-body">
        {importResult && (
          <div className={`alert ${importResult.errors.length ? 'alert-info' : 'alert-success'}`}>
            ✅ {importResult.message}
            {importResult.errors.length > 0 && (
              <ul style={{marginTop:6, paddingLeft:16}}>
                {importResult.errors.map((e,i) => <li key={i}>{e}</li>)}
              </ul>
            )}
            <button style={{marginLeft:'auto', background:'none', border:'none', cursor:'pointer'}}
              onClick={() => setImportResult(null)}>✕</button>
          </div>
        )}

        <div className="card">
          <div className="card-header">
            <input type="text" placeholder="搜尋條碼 / 商品名稱..."
              value={search} onChange={e => setSearch(e.target.value)} style={{width:280, fontSize:15}} />
          </div>
          <div className="table-wrap">
            {loading && products.length === 0 ? (
              <div className="loading-center"><span className="spinner" /></div>
            ) : (
              <table>
                <thead>
                  <tr>
                    {canDelete && (
                      <th style={{width:40, textAlign:'center'}}>
                        <input type="checkbox" checked={allChecked} onChange={toggleAll}
                          title="全選" style={{cursor:'pointer'}} />
                      </th>
                    )}
                    <th style={{minWidth:150}}>條碼</th>
                    <th style={{minWidth:220}}>商品名稱</th>
                    <th style={{minWidth:90}}>分類</th>
                    <th style={{minWidth:70}}>單位</th>
                    <th className="text-right" style={{minWidth:90}}>進價</th>
                    <th className="text-right" style={{minWidth:90}}>售價</th>
                    <th className="text-right" style={{minWidth:80}}>庫存</th>
                    <th style={{minWidth:90}}>建立者</th>
                    <th style={{minWidth:90}}>修改者</th>
                    {showOps && <th className="text-center" style={{minWidth:220}}>操作</th>}
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 && (
                    <tr><td colSpan={showOps ? (canDelete ? 11 : 10) : (canDelete ? 10 : 9)}>
                      <div className="empty-state"><span className="icon">📦</span>{products.length ? '找不到符合的商品' : '暫無商品資料'}</div>
                    </td></tr>
                  )}
                  {visible.map(p => (
                    <tr key={p.ProductID} style={selected.has(p.ProductID) ? {background:'#eff6ff'} : undefined}>
                      {canDelete && (
                        <td style={{textAlign:'center'}}>
                          <input type="checkbox" checked={selected.has(p.ProductID)}
                            onChange={() => toggleOne(p.ProductID)} style={{cursor:'pointer'}} />
                        </td>
                      )}
                      <td><code style={{fontSize:14}}>{p.Barcode || '-'}</code></td>
                      <td><b style={{fontSize:15}}>{p.ProductName}</b></td>
                      <td>{p.Category || '-'}</td>
                      <td>{p.Unit}</td>
                      <td className="text-right">{fmt(p.CostPrice)}</td>
                      <td className="text-right" style={{color:'#1a56db', fontWeight:600}}>{fmt(p.SalePrice)}</td>
                      <td className="text-right" style={{color: p.Stock < 10 ? '#e02424' : undefined, fontWeight: p.Stock < 10 ? 700 : undefined}}>
                        {fmt(p.Stock)}
                      </td>
                      <td style={{color:'#666', fontSize:13}}>{p.CreatedByName || '-'}</td>
                      <td style={{color:'#666', fontSize:13}}>{p.UpdatedByName || '-'}</td>
                      {showOps && (
                        <td className="text-center">
                          <button className="btn btn-ghost btn-sm" onClick={() => setHistoryOf(p)}>📜 出貨紀錄</button>
                          {canEdit   && <button className="btn btn-ghost btn-sm" onClick={() => openEdit(p)}>✏️ 編輯</button>}
                          {canDelete && <button className="btn btn-ghost btn-sm" style={{color:'#e02424'}} onClick={() => del(p)}>🗑️ 刪除</button>}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          {filtered.length > limit && (
            <div style={{textAlign:'center', padding:12}}>
              <button className="btn btn-outline btn-sm" onClick={() => setLimit(l => l + PAGE_SIZE)}>
                顯示更多（還有 {filtered.length - limit} 項）
              </button>
            </div>
          )}
        </div>
      </div>

      {historyOf && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setHistoryOf(null)}>
          <div className="modal" style={{maxWidth:1000, width:'95%'}}>
            <div className="modal-header">
              <span className="modal-title">📜 出貨紀錄：{historyOf.ProductName}{historyOf.Barcode ? `（${historyOf.Barcode}）` : ''}</span>
              <button className="modal-close" onClick={() => setHistoryOf(null)}>✕</button>
            </div>
            <div className="modal-body">
              <ProductHistory productId={historyOf.ProductID} />
            </div>
          </div>
        </div>
      )}

      {preview && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && !importing && setPreview(null)}>
          <div className="modal" style={{maxWidth:900, width:'95%'}}>
            <div className="modal-header">
              <span className="modal-title">📥 匯入預覽：{preview.file.name}</span>
              <button className="modal-close" disabled={importing} onClick={() => setPreview(null)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="flex gap-8" style={{flexWrap:'wrap', marginBottom:12}}>
                {[
                  ['changed', `✏️ 有修改 ${preview.changed.length}`, '#d97706'],
                  ['created', `🆕 新增 ${preview.created.length}`, '#057a55'],
                  ['errors',  `⚠️ 有問題 ${preview.errors.length}`, '#e02424'],
                ].map(([k, label, color]) => (
                  <button key={k} className="btn btn-sm" onClick={() => setPreviewTab(k)}
                    style={{border:`1px solid ${color}`, background: previewTab === k ? color : '#fff', color: previewTab === k ? '#fff' : color}}>
                    {label}
                  </button>
                ))}
                <span style={{alignSelf:'center', color:'#6b7280', fontSize:13}}>完全相同自動跳過 {preview.unchanged} 筆</span>
              </div>

              <div style={{maxHeight:'55vh', overflowY:'auto'}}>
                {previewTab === 'changed' && (preview.changed.length === 0 ? <div className="empty-state">沒有需要修改的商品</div> : (
                  <table>
                    <thead><tr><th>條碼</th><th>商品名稱</th><th>修改內容（原本 → 新的）</th></tr></thead>
                    <tbody>
                      {preview.changed.map(r => (
                        <tr key={r.ProductID}>
                          <td><code>{r.Barcode || '-'}</code></td>
                          <td><b>{r.ProductName}</b></td>
                          <td>
                            {r.diffs.map(d => (
                              <div key={d.field} style={{fontSize:13}}>
                                <span style={{color:'#6b7280'}}>{d.label}：</span>
                                <span style={{color:'#e02424', textDecoration:'line-through'}}>{showVal(d.from)}</span>
                                {' → '}
                                <span style={{color:'#057a55', fontWeight:700}}>{showVal(d.to)}</span>
                              </div>
                            ))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ))}
                {previewTab === 'created' && (preview.created.length === 0 ? <div className="empty-state">沒有新商品</div> : (
                  <table>
                    <thead><tr><th>條碼</th><th>商品名稱</th><th>分類</th><th>單位</th><th className="text-right">進價</th><th className="text-right">售價</th><th className="text-right">庫存</th></tr></thead>
                    <tbody>
                      {preview.created.map(r => (
                        <tr key={r.line}>
                          <td><code>{r.Barcode || '-'}</code></td><td><b>{r.ProductName}</b></td><td>{r.Category || '-'}</td><td>{r.Unit}</td>
                          <td className="text-right">{fmt(r.CostPrice)}</td><td className="text-right">{fmt(r.SalePrice)}</td><td className="text-right">{fmt(r.Stock)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ))}
                {previewTab === 'errors' && (preview.errors.length === 0 ? <div className="empty-state">沒有問題</div> : (
                  <ul style={{paddingLeft:18}}>{preview.errors.map((e, i) => <li key={i}>{e}</li>)}</ul>
                ))}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" disabled={importing} onClick={() => setPreview(null)}>取消</button>
              <button className="btn btn-primary" disabled={importing || (preview.changed.length + preview.created.length === 0)} onClick={applyImport}>
                {importing ? '匯入中...' : (preview.changed.length + preview.created.length === 0)
                  ? '全部相同，不需匯入'
                  : `✅ 確認匯入（修改 ${preview.changed.length}、新增 ${preview.created.length}）`}
              </button>
            </div>
          </div>
        </div>
      )}

      {modal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && closeModal()}>
          <div className="modal">
            <div className="modal-header">
              <span className="modal-title">{modal === 'add' ? '新增商品' : '編輯商品'}</span>
              <button className="modal-close" onClick={closeModal}>✕</button>
            </div>
            <div className="modal-body">
              {msg && <div className={`alert alert-${msg.type}`}>{msg.text}</div>}
              <div className="form-grid">
                <div className="form-group full">
                  <label>商品名稱 *</label>
                  <input value={form.ProductName} onChange={f('ProductName')} placeholder="請輸入商品名稱" />
                </div>
                <div className="form-group">
                  <label>條碼</label>
                  <input value={form.Barcode} onChange={f('Barcode')} placeholder="EAN-13 / Code128..." />
                </div>
                <div className="form-group">
                  <label>分類</label>
                  <input value={form.Category} onChange={f('Category')} placeholder="例：飲料、泡麵..." />
                </div>
                <div className="form-group">
                  <label>單位</label>
                  <input value={form.Unit} onChange={f('Unit')} placeholder="個 / 箱 / 袋..." />
                </div>
                <div className="form-group">
                  <label>庫存</label>
                  <input type="number" value={form.Stock} onChange={f('Stock')} min="0" />
                </div>
                <div className="form-group">
                  <label>進價</label>
                  <input type="number" value={form.CostPrice} onChange={f('CostPrice')} min="0" step="0.01" />
                </div>
                <div className="form-group">
                  <label>售價</label>
                  <input type="number" value={form.SalePrice} onChange={f('SalePrice')} min="0" step="0.01" />
                </div>
                {modal === 'edit' && (
                  <>
                    <div className="form-group">
                      <label>建立者</label>
                      <input value={form.CreatedByName || '-'} readOnly style={{background:'#f9fafb', color:'#6b7280', cursor:'default'}} />
                    </div>
                    <div className="form-group">
                      <label>建立日期</label>
                      <input value={form.CreatedAt ? new Date(form.CreatedAt).toLocaleDateString('zh-TW') : '-'} readOnly style={{background:'#f9fafb', color:'#6b7280', cursor:'default'}} />
                    </div>
                    <div className="form-group">
                      <label>最後修改者</label>
                      <input value={form.UpdatedByName || '-'} readOnly style={{background:'#f9fafb', color:'#6b7280', cursor:'default'}} />
                    </div>
                    <div className="form-group">
                      <label>修改日期</label>
                      <input value={form.UpdatedAt ? new Date(form.UpdatedAt).toLocaleDateString('zh-TW') : '-'} readOnly style={{background:'#f9fafb', color:'#6b7280', cursor:'default'}} />
                    </div>
                  </>
                )}
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
