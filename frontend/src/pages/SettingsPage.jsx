import { useState, useEffect } from 'react';
import api from '../api.js';

export default function SettingsPage() {
  const [form,    setForm]    = useState({ COMPANY_NAME: '', COMPANY_PHONE: '', COMPANY_ADDRESS: '' });
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [msg,     setMsg]     = useState(null);

  useEffect(() => {
    api.get('/settings').then(r => {
      setForm({
        COMPANY_NAME:    r.data.COMPANY_NAME    || '',
        COMPANY_PHONE:   r.data.COMPANY_PHONE   || '',
        COMPANY_ADDRESS: r.data.COMPANY_ADDRESS || '',
      });
    }).finally(() => setLoading(false));
  }, []);

  async function save() {
    setSaving(true);
    try {
      await api.put('/settings', form);
      setMsg({ type: 'success', text: '✅ 設定已儲存' });
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.message || '儲存失敗' });
    } finally {
      setSaving(false);
      setTimeout(() => setMsg(null), 3000);
    }
  }

  if (loading) return <div className="loading-center"><span className="spinner" /></div>;

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-title">⚙️ 系統設定</div>
          <div className="page-subtitle">設定公司資訊，列印出貨單與退貨單時顯示</div>
        </div>
      </div>

      <div className="page-body">
        {msg && <div className={`alert alert-${msg.type}`} style={{ marginBottom: 16 }}>{msg.text}</div>}

        <div className="card" style={{ maxWidth: 600 }}>
          <div className="card-header"><span className="card-title">🏢 公司資訊</span></div>
          <div className="card-body">
            <div className="form-group">
              <label>公司名稱</label>
              <input type="text" value={form.COMPANY_NAME}
                onChange={e => setForm(f => ({ ...f, COMPANY_NAME: e.target.value }))}
                placeholder="例：台灣批發有限公司" />
            </div>
            <div className="form-group">
              <label>公司電話</label>
              <input type="text" value={form.COMPANY_PHONE}
                onChange={e => setForm(f => ({ ...f, COMPANY_PHONE: e.target.value }))}
                placeholder="例：04-22222222" />
            </div>
            <div className="form-group">
              <label>公司地址</label>
              <input type="text" value={form.COMPANY_ADDRESS}
                onChange={e => setForm(f => ({ ...f, COMPANY_ADDRESS: e.target.value }))}
                placeholder="例：台中市西區民生路1號" />
            </div>
            <button className="btn btn-primary" onClick={save} disabled={saving} style={{ marginTop: 8 }}>
              {saving ? '儲存中...' : '💾 儲存設定'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
