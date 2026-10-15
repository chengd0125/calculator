import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout           from './components/Layout.jsx';
import LoginPage        from './pages/LoginPage.jsx';
import Dashboard        from './pages/Dashboard.jsx';
import ProductsPage     from './pages/ProductsPage.jsx';
import EmployeesPage    from './pages/EmployeesPage.jsx';
import CustomersPage    from './pages/CustomersPage.jsx';
import NewOrderPage     from './pages/NewOrderPage.jsx';
import OrdersPage       from './pages/OrdersPage.jsx';
import OrderDetailPage  from './pages/OrderDetailPage.jsx';
import NewReturnPage    from './pages/NewReturnPage.jsx';
import ReturnsPage      from './pages/ReturnsPage.jsx';
import ReturnDetailPage from './pages/ReturnDetailPage.jsx';
import PermissionsPage  from './pages/PermissionsPage.jsx';
import SettingsPage     from './pages/SettingsPage.jsx';

function isLoggedIn() {
  const token = localStorage.getItem('token');
  const user  = localStorage.getItem('user');
  if (!token || !user) return false;
  try { JSON.parse(user); return true; } catch { return false; }
}

function PrivateRoute({ children, roles }) {
  if (!isLoggedIn()) return <Navigate to="/login" replace />;
  const user = JSON.parse(localStorage.getItem('user'));
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return children;
}

function PublicOnlyRoute({ children }) {
  if (isLoggedIn()) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <Routes>
        <Route path="/login" element={<PublicOnlyRoute><LoginPage /></PublicOnlyRoute>} />
        <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
          <Route index element={<Dashboard />} />
          <Route path="products"    element={<PrivateRoute roles={['admin','sales','warehouse']}><ProductsPage /></PrivateRoute>} />
          <Route path="employees"   element={<PrivateRoute roles={['admin','sales','warehouse']}><EmployeesPage /></PrivateRoute>} />
          <Route path="customers"   element={<PrivateRoute roles={['admin','sales','warehouse']}><CustomersPage /></PrivateRoute>} />
          <Route path="new-order"   element={<PrivateRoute roles={['admin','sales']}><NewOrderPage /></PrivateRoute>} />
          <Route path="orders"         element={<PrivateRoute roles={['admin','sales','warehouse']}><OrdersPage /></PrivateRoute>} />
          <Route path="orders/:id"     element={<PrivateRoute roles={['admin','sales','warehouse']}><OrderDetailPage /></PrivateRoute>} />
          <Route path="new-return"     element={<PrivateRoute roles={['admin','sales']}><NewReturnPage /></PrivateRoute>} />
          <Route path="returns"        element={<PrivateRoute roles={['admin','sales','warehouse']}><ReturnsPage /></PrivateRoute>} />
          <Route path="returns/:id"    element={<PrivateRoute roles={['admin','sales','warehouse']}><ReturnDetailPage /></PrivateRoute>} />
          <Route path="permissions"   element={<PrivateRoute roles={['admin']}><PermissionsPage /></PrivateRoute>} />
          <Route path="settings"    element={<PrivateRoute roles={['admin','sales','warehouse']}><SettingsPage /></PrivateRoute>} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
