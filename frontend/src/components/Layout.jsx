import { useState, useEffect } from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import api from '../api.js';

const ROLE_LABELS = { admin: '管理員', sales: '業務', warehouse: '倉庫' };

export default function Layout() {
  const navigate = useNavigate();
  const location = useLocation();
  const user     = JSON.parse(localStorage.getItem('user') || '{}');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [canManageEmployees, setCanManageEmployees] = useState(user.role === 'admin');

  useEffect(() => {
    if (user.role === 'admin') return;
    let mounted = true;
    api.get('/permissions/my')
      .then(r => mounted && setCanManageEmployees(r.data.permissions?.includes('employee_view')))
      .catch(() => mounted && setCanManageEmployees(false));
    return () => { mounted = false; };
  }, [user.role]);

  // 當路由改變時，自動關閉手機版側邊欄
  useEffect(() => {
    setIsSidebarOpen(false);
  }, [location]);

  function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login');
  }

  const navCls = ({ isActive }) => 'nav-item' + (isActive ? ' active' : '');

  return (
    <div className={`layout ${isSidebarOpen ? 'sidebar-open' : ''}`}>
      {/* 手機版遮罩 */}
      {isSidebarOpen && (
        <div className="sidebar-overlay" onClick={() => setIsSidebarOpen(false)} />
      )}

      {/* 手機版頂部列 */}
      <header className="mobile-header">
        <button className="menu-toggle" onClick={() => setIsSidebarOpen(true)}>
          ☰
        </button>
        <div className="mobile-logo">批發商業務系統</div>
      </header>

      <nav className={`sidebar ${isSidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-logo">
          <span className="logo-icon">📦</span>
          <div>
            <div className="logo-text">批發商業務系統</div>
            <div className="logo-sub">Wholesale Manager</div>
          </div>
          <button className="sidebar-close" onClick={() => setIsSidebarOpen(false)}>✕</button>
        </div>

        <div className="sidebar-nav">
          <div className="nav-section">主選單</div>
          <NavLink to="/"          end className={navCls}><span className="icon">🏠</span>儀表板</NavLink>
          {(user.role === 'admin' || user.role === 'sales') && (
            <NavLink to="/new-order"   className={navCls}><span className="icon">📝</span>抄貨開單</NavLink>
          )}
          <NavLink to="/orders"        className={navCls}><span className="icon">📋</span>訂單管理</NavLink>
          {(user.role === 'admin' || user.role === 'sales') && (
            <NavLink to="/new-return"  className={navCls}><span className="icon">↩️</span>退貨開單</NavLink>
          )}
          <NavLink to="/returns"       className={navCls}><span className="icon">📦</span>退貨記錄</NavLink>

          <div className="nav-section" style={{marginTop:8}}>資料管理</div>
          <NavLink to="/products"      className={navCls}><span className="icon">🏷️</span>商品資料</NavLink>
          {(user.role === 'admin' || user.role === 'sales' || user.role === 'warehouse') && (
            <NavLink to="/customers"   className={navCls}><span className="icon">🏪</span>客戶資料</NavLink>
          )}

          {(user.role === 'admin' || canManageEmployees) && (
            <>
              <div className="nav-section" style={{marginTop:8}}>系統管理</div>
              {canManageEmployees && <NavLink to="/employees" className={navCls}><span className="icon">👥</span>員工管理</NavLink>}
              {user.role === 'admin' && <>
                <NavLink to="/permissions" className={navCls}><span className="icon">🔐</span>權限管理</NavLink>
                <NavLink to="/settings"    className={navCls}><span className="icon">⚙️</span>系統設定</NavLink>
              </>}
            </>
          )}
        </div>

        <div className="sidebar-user">
          <div className="user-avatar">{(user.name||'?')[0]}</div>
          <div className="user-info">
            <div className="name">{user.name}</div>
            <div className="role">{ROLE_LABELS[user.role] || user.role}</div>
          </div>
          <button className="logout-btn" onClick={logout} title="登出">⏏</button>
        </div>
      </nav>

      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}
