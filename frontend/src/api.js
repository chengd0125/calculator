import axios from 'axios';
import { TOKEN_KEY, USER_KEY } from './storage.js';

const api = axios.create({ baseURL: import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}/api` : '/api' });

// 自動附加 JWT Token
api.interceptors.request.use(cfg => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) cfg.headers.Authorization = `Bearer ${token}`;
  // 多廠商：告訴後端這個網站屬於哪一間廠商（GitHub secret VITE_TENANT）
  if (import.meta.env.VITE_TENANT) cfg.headers['X-Tenant'] = import.meta.env.VITE_TENANT;
  return cfg;
});

// 401 只在「非登入頁」才跳轉，避免登入失敗時無限重載
api.interceptors.response.use(
  res => res,
  err => {
    const isLoginRequest = err.config?.url?.includes('/auth/login');
    if (err.response?.status === 401 && !isLoginRequest) {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
      window.location.href = `${import.meta.env.BASE_URL}login`;
    }
    return Promise.reject(err);
  }
);

export default api;