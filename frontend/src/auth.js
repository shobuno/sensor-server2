// sensor-server/frontend/src/auth.js

// トークンとロールの取得
export const getToken = () => localStorage.getItem('token');
export const getRole  = () => localStorage.getItem('role'); // ログイン時に保存想定

// ログアウト（token, role削除＋ログイン画面へ）
export const logout = () => {
  localStorage.removeItem('token');
  localStorage.removeItem('role');
  window.location.assign('/login');
};

// API呼び出し用ラッパ（401なら即ログアウト）
export async function fetchJson(url, opts = {}) {
  const token = getToken();
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(url, { ...opts, headers });

  if (res.status === 401) {
    logout();
    throw new Error('unauthorized');
  }

  return res.headers.get('content-type')?.includes('application/json')
    ? res.json()
    : res.text();
}
