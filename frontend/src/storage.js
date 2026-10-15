// 每個網站（廠商）分開存放登入資料；不同廠商的網站都在 chengd0125.github.io 底下，
// 不分開的話，登入 A 廠商會把 B 廠商登出。
const NS = import.meta.env.VITE_TENANT || import.meta.env.BASE_URL;
export const TOKEN_KEY = `${NS}:token`;
export const USER_KEY  = `${NS}:user`;

// 改版前的登入資料沒有分開存放，搬到新位置，避免大家都要重新登入一次
try {
  if (!localStorage.getItem(TOKEN_KEY) && localStorage.getItem('token')) {
    localStorage.setItem(TOKEN_KEY, localStorage.getItem('token'));
    localStorage.setItem(USER_KEY,  localStorage.getItem('user') || '{}');
  }
  localStorage.removeItem('token');
  localStorage.removeItem('user');
} catch {}
