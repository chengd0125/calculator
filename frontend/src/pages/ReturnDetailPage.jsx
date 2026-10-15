import { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import api from '../api.js';

const STATUS_MAP    = { pending:'待確認', completed:'已完成', cancelled:'取消' };
const STATUS_COLORS = { pending:'badge-pending', completed:'badge-completed', cancelled:'badge-cancelled' };
const fmt     = n  => 'NT$ ' + Number(n||0).toLocaleString();
const fmtDate = s  => s ? new Date(s).toLocaleDateString('zh-TW') : '';


export default function ReturnDetailPage() {
  const { id }   = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const user     = JSON.parse(localStorage.getItem('user') || '{}');

  const [ret,       setRet]      = useState(null);
  const [loading,   setLoading]  = useState(true);
  const [settings,  setSettings] = useState({});
  const [newReturn, setNewReturn] = useState(location.state?.newReturn || false);

  const load = async () => {
    setLoading(true);
    try {
      const [retRes, settingsRes] = await Promise.all([
        api.get(`/returns/${id}`),
        api.get('/settings'),
      ]);
      setRet(retRes.data);
      setSettings(settingsRes.data);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [id]);
  useEffect(() => {
    if (newReturn) { const t = setTimeout(() => setNewReturn(false), 4000); return () => clearTimeout(t); }
  }, [newReturn]);

  async function changeStatus(newStatus) {
    const labels = { completed:'已完成', cancelled:'取消' };
    if (!confirm(`確定將狀態改為「${labels[newStatus]}」？`)) return;
    await api.put(`/returns/${id}/status`, { status: newStatus });
    load();
  }

  async function deleteReturn() {
    if (!confirm(`確定刪除退貨單「${ret.ReturnNo}」？此動作無法復原。`)) return;
    try {
      await api.delete(`/returns/${id}`);
      navigate('/returns');
    } catch (err) {
      alert(err.response?.data?.message || '刪除失敗');
    }
  }

  async function exportExcel() {
    const res = await api.get(`/returns/${id}/export`, { responseType: 'blob' });
    const url = URL.createObjectURL(res.data);
    Object.assign(document.createElement('a'), { href: url, download: `${ret.ReturnNo}.xlsx` }).click();
  }

  if (loading) return <div className="loading-center"><span className="spinner" /></div>;
  if (!ret)    return <div className="page-body"><div className="alert alert-error">退貨單不存在</div></div>;

  const totalQty = ret.items.reduce((s, i) => s + i.Quantity, 0);

  return (
    <>
      <div className="page-header no-print">
        <div>
          <div className="page-title">
            <button className="btn btn-ghost btn-sm" onClick={() => navigate('/returns')}>← 返回</button>
            &nbsp;{ret.ReturnNo}
          </div>
          <div className="page-subtitle">
            <span className={`badge ${STATUS_COLORS[ret.Status]}`}>{STATUS_MAP[ret.Status]}</span>
          </div>
        </div>
        <div className="flex gap-8">
          {ret.Status === 'pending' && (user.role === 'admin' || user.role === 'warehouse') && (
            <button className="btn btn-success" onClick={() => changeStatus('completed')}>✅ 確認完成</button>
          )}
          {ret.Status === 'pending' && (
            <button className="btn btn-outline" style={{color:'#e02424'}} onClick={() => changeStatus('cancelled')}>取消</button>
          )}
          {user.role === 'admin' && (
            <button className="btn btn-danger" onClick={deleteReturn}>🗑️ 刪除</button>
          )}
          <button className="btn btn-outline" onClick={exportExcel}>📤 匯出 Excel</button>
          <button className="btn btn-primary" onClick={() => window.print()}>🖨️ 列印退貨單</button>
        </div>
      </div>

      <div className="page-body">
        {newReturn && (
          <div className="alert alert-success no-print">🎉 退貨單 <b>{ret.ReturnNo}</b> 建立成功！</div>
        )}

        <div className="print-doc">
          {/* 標頭 */}
          <div style={{paddingBottom:10, borderBottom:'2px solid #111', marginBottom:12}}>
            <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:8, position:'relative'}}>
              <h1 style={{fontSize:'16pt', fontWeight:800}}>{settings.COMPANY_NAME || '您的公司名稱'}</h1>
              <h2 style={{fontSize:'18pt', fontWeight:800, letterSpacing:4, position:'absolute', left:'50%', transform:'translateX(-50%)'}}>退 貨 單</h2>
            </div>
            {settings.COMPANY_PHONE   && <p style={{fontSize:'10pt', color:'#555'}}>{settings.COMPANY_PHONE}</p>}
            {settings.COMPANY_ADDRESS && <p style={{fontSize:'10pt', color:'#555', marginBottom:8}}>{settings.COMPANY_ADDRESS}</p>}
            <div style={{fontSize:'11pt'}}>
              <div style={{display:'flex', gap:'20pt', marginBottom:'3pt', whiteSpace:'nowrap'}}>
                <span><span style={{color:'#555'}}>客戶代碼：</span><b>{ret.CustomerCode || '-'}</b></span>
                <span><span style={{color:'#555'}}>客戶名稱：</span><b>{ret.CompanyName}</b></span>
              </div>
              <div style={{display:'flex', gap:'20pt', whiteSpace:'nowrap'}}>
                <span><span style={{color:'#555'}}>單號：</span><b>{ret.ReturnNo}</b></span>
                <span><span style={{color:'#555'}}>日期：</span><b>{fmtDate(ret.ReturnDate)}</b></span>
                <span><span style={{color:'#555'}}>業務：</span><b>{ret.EmployeeName}</b></span>
              </div>
            </div>
          </div>

          {/* 明細表 */}
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
              </tr>
            </thead>
            <tbody>
              {ret.items.map((item, idx) => (
                <tr key={item.ItemID}>
                  <td style={{textAlign:'center'}}>{idx + 1}</td>
                  <td style={{fontFamily:'monospace', fontSize:'10pt'}}>{item.Barcode || '-'}</td>
                  <td style={{fontWeight:600}}>{item.ProductName}</td>
                  <td style={{textAlign:'center'}}>{item.Unit}</td>
                  <td style={{textAlign:'right', fontWeight:700}}>{item.Quantity}</td>
                  <td style={{textAlign:'right'}}>{Number(item.UnitPrice).toLocaleString()}</td>
                  <td style={{textAlign:'right', fontWeight:700, color:'#92400e'}}>{Number(item.Amount).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* 合計 */}
          <div style={{display:'flex', justifyContent:'flex-end', marginTop:'12pt'}}>
            <table style={{borderCollapse:'collapse', fontSize:'12pt', minWidth:'260pt'}}>
              <tbody>
                <tr>
                  <td style={{padding:'4pt 16pt 4pt 0', color:'#555', borderBottom:'1px solid #e5e7eb'}}>品項數</td>
                  <td style={{padding:'4pt 0', textAlign:'right', borderBottom:'1px solid #e5e7eb'}}>{ret.items.length} 項</td>
                </tr>
                <tr>
                  <td style={{padding:'4pt 16pt 4pt 0', color:'#555', borderBottom:'1px solid #e5e7eb'}}>總數量</td>
                  <td style={{padding:'4pt 0', textAlign:'right', borderBottom:'1px solid #e5e7eb'}}>{totalQty} 件</td>
                </tr>
                {ret.Notes && (
                  <tr>
                    <td style={{padding:'4pt 16pt 4pt 0', color:'#555', borderBottom:'1px solid #e5e7eb'}}>備註</td>
                    <td style={{padding:'4pt 0', textAlign:'right', borderBottom:'1px solid #e5e7eb', fontSize:'10pt'}}>{ret.Notes}</td>
                  </tr>
                )}
                <tr>
                  <td style={{padding:'8pt 16pt 4pt 0', fontWeight:800, fontSize:'14pt', borderTop:'2px solid #111'}}>退貨總額</td>
                  <td style={{padding:'8pt 0 4pt 0', textAlign:'right', fontWeight:800, fontSize:'14pt', color:'#92400e', borderTop:'2px solid #111'}}>
                    {fmt(ret.TotalAmount)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* 簽名欄 */}
          <div style={{display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'20pt', marginTop:'30pt', paddingTop:'12pt', borderTop:'1px solid #ccc'}}>
            {['退貨人員', '客戶簽名', '業務確認'].map(label => (
              <div key={label} style={{textAlign:'center'}}>
                <div style={{height:'36pt'}} />
                <div style={{borderTop:'1px solid #aaa', paddingTop:'6pt', fontSize:'11pt', color:'#555'}}>{label}</div>
              </div>
            ))}
          </div>

          <div style={{marginTop:'12pt', paddingTop:'8pt', borderTop:'1px solid #e5e7eb', fontSize:'9pt', color:'#9ca3af', textAlign:'center'}}>
            列印時間：{new Date().toLocaleString('zh-TW')}
          </div>
        </div>
      </div>
    </>
  );
}
