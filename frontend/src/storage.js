// 每個網站（廠商）分開存放登入資料；不同廠商的網站都在 chengd0125.github.io 底下，
// 不分開的話，登入 A 廠商會把 B 廠商登出。
const NS = import.meta.env.VITE_TENANT || import.meta.env.BASE_URL;
export const TOKEN_KEY = `${NS}:token`;
export const USER_KEY  = `${NS}:user`;

// 登入資料改用 sessionStorage，清除先前存在 localStorage 的持久登入憑證。
try {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem('token');
  localStorage.removeItem('user');
} catch {}
