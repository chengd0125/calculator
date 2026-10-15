import { useState, useEffect, useRef } from 'react';
import api from '../api.js';

const EMPTY = { Barcode:'', ProductName:'', Unit:'個', CostPrice:'', SalePrice:'', Stock:'', Category:'' };
const fmt = n => Number(n||0).toLocaleString();

export default function ProductsPage() {
  const [products,     setProducts]    = useState([]);
  const [search,       setSearch]      = useState('');
  const [modal,        setModal]       = useState(null);
  const [form,         setForm]        = useState(EMPTY);
  const [loading,      setLoading]     = useState(false);
  const [msg,          setMsg]         = useState(null);
  const [importResult, setImportResult]= useState(null);
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

  const load = async () => {
    setLoading(true);
    try {
      const r = await api.get('/products', { params: { search } });
      setProducts(r.data);
      setSelected(new Set());
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [search]);

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
    if (selected.size === products.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(products.map(p => p.ProductID)));
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

  async function importXlsx(e) {
    const file = e.target.files[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    try {
      const res = await api.post('/products/import', fd);
      setImportResult(res.data);
      load();
    } catch (err) {
      alert(err.response?.data?.message || '匯入失敗');
    }
    e.target.value = '';
  }

  const canAdd    = hasPerm('product_add');
  const canEdit   = hasPerm('product_edit');
  const canDelete = hasPerm('product_delete');
  const showOps   = canAdd || canEdit || canDelete;
  const allChecked = products.length > 0 && selected.size === products.length;

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-title">🏷️ 商品資料</div>
          <div className="page-subtitle">共 {products.length} 項商品</div>
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
              <button className="btn btn-outline btn-sm" onClick={() => fileRef.current.click()}>📥 匯入 Excel</button>
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
            {loading ? (
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
                    {showOps && <th className="text-center" style={{minWidth:130}}>操作</th>}
                  </tr>
                </thead>
                <tbody>
                  {products.length === 0 && (
                    <tr><td colSpan={showOps ? (canDelete ? 11 : 10) : (canDelete ? 10 : 9)}>
                      <div className="empty-state"><span className="icon">📦</span>暫無商品資料</div>
                    </td></tr>
                  )}
                  {products.map(p => (
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
        </div>
      </div>

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
