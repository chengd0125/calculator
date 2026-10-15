import { useState, useEffect } from 'react';
import api from '../api.js';

const PERMISSION_LABELS = {
  product_view:    '查看商品',
  product_add:     '新增商品',
  product_edit:    '編輯商品',
  product_delete:  '刪除商品',
  customer_view:   '查看客戶',
  customer_add:    '新增客戶',
  customer_edit:   '編輯客戶',
  customer_delete: '刪除客戶',
  order_view:      '查看訂單',
  order_add:       '新增訂單（抄貨）',
  order_edit:      '編輯訂單',
  order_delete:    '刪除訂單',
  order_pick:      '撿貨作業',
  return_add:      '新增退貨（退貨開單）',
  return_edit:     '確認/變更退貨狀態',
  return_delete:   '刪除退貨單',
  settings_edit:   '修改系統設定',
  employee_view:   '查看員工',
  employee_add:    '新增員工',
  employee_edit:   '編輯員工／啟用停用',
  employee_delete: '刪除員工',
};

const GROUPS = {
  '📦 商品資料': ['product_view','product_add','product_edit','product_delete'],
  '🏪 客戶資料': ['customer_view','customer_add','customer_edit','customer_delete'],
  '📋 訂單':    ['order_view','order_add','order_edit','order_delete','order_pick'],
  '↩️ 退貨':   ['return_add','return_edit','return_delete'],
  '👥 員工管理': ['employee_view','employee_add','employee_edit','employee_delete'],
  '⚙️ 系統':   ['settings_edit'],
};

const ROLES = [
  { key:'sales',     label:'業務' },
  { key:'warehouse', label:'倉庫' },
];

export default function PermissionsPage() {
  const [perms,   setPerms]   = useState({});
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState('');
  const [msg,     setMsg]     = useState(null);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const res = await api.get('/permissions');
      const map = {};
      res.data.forEach(p => {
        if (!map[p.Role]) map[p.Role] = {};
        map[p.Role][p.Permission] = p.IsAllowed === true || p.IsAllowed === 1;
      });
      setPerms(map);
    } finally { setLoading(false); }
  }

  async function toggle(role, permission, current) {
    const key = `${role}_${permission}`;
    setSaving(key);
    try {
      await api.put('/permissions', { Role: role, Permission: permission, IsAllowed: !current });
      setPerms(prev => ({ ...prev, [role]: { ...prev[role], [permission]: !current } }));
      setMsg({ type:'success', text:'權限已更新' });
      setTimeout(() => setMsg(null), 2000);
    } catch (err) {
      setMsg({ type:'error', text: err.response?.data?.message || '更新失敗' });
    } finally { setSaving(''); }
  }

  if (loading) return <div className="loading-center"><span className="spinner" /></div>;

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-title">🔐 權限管理</div>
          <div className="page-subtitle">設定業務、倉庫人員可使用的功能（管理員擁有全部權限）</div>
        </div>
      </div>

      <div className="page-body">
        {msg && <div className={`alert alert-${msg.type}`} style={{marginBottom:16}}>{msg.text}</div>}

        <div className="card">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th style={{minWidth:200}}>功能項目</th>
                  {ROLES.map(r => (
                    <th key={r.key} className="text-center" style={{minWidth:120}}>{r.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Object.entries(GROUPS).map(([groupName, permissions]) => (
                  <>
                    <tr key={`g_${groupName}`}>
                      <td colSpan={3} style={{background:'#f0f6ff', fontWeight:700, color:'#1a56db', padding:'8px 14px', fontSize:13}}>
                        {groupName}
                      </td>
                    </tr>
                    {permissions.map(perm => (
                      <tr key={perm}>
                        <td style={{paddingLeft:24}}>{PERMISSION_LABELS[perm]}</td>
                        {ROLES.map(r => {
                          const allowed = perms[r.key]?.[perm] || false;
                          const key     = `${r.key}_${perm}`;
                          return (
                            <td key={r.key} className="text-center">
                              <button
                                onClick={() => toggle(r.key, perm, allowed)}
                                disabled={saving === key}
                                style={{
                                  width:52, height:28, borderRadius:14, border:'none', cursor:'pointer',
                                  background: allowed ? '#0e9f6e' : '#d1d5db',
                                  transition:'background .2s', position:'relative', padding:0
                                }}
                              >
                                <span style={{
                                  position:'absolute', top:4, left: allowed ? 26 : 4,
                                  width:20, height:20, borderRadius:'50%', background:'#fff',
                                  transition:'left .2s', boxShadow:'0 1px 3px rgba(0,0,0,.2)'
                                }} />
                              </button>
                              <div style={{fontSize:11, color: allowed ? '#0e9f6e' : '#9ca3af', marginTop:2}}>
                                {allowed ? '開放' : '關閉'}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="alert alert-info" style={{marginTop:16}}>
          💡 管理員帳號擁有所有功能，不受此設定影響。變更後立即生效。
        </div>
      </div>
    </>
  );
}
