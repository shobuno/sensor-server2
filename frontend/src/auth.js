// sensor-server/frontend/src/auth.js

// ---- Token helpers -------------------------------------------------
export function getToken() {
  // 旧キー(token) → 新キー(authToken) を自動移行
  const legacy = localStorage.getItem('token');
  if (legacy && !localStorage.getItem('authToken')) {
    localStorage.setItem('authToken', legacy);
    localStorage.removeItem('token');
  }
  return localStorage.getItem('authToken') || '';
}

export function setToken(token) {
  if (!token) return;
  localStorage.setItem('authToken', token);
  localStorage.removeItem('token'); // お掃除
}

// ---- Role helpers --------------------------------------------------
export function getRole() {
  return (localStorage.getItem('role') || '').toLowerCase();
}

export function setRoles(roles) {
  try {
    const arr = Array.isArray(roles) ? roles : roles ? [roles] : [];
    localStorage.setItem('roles', JSON.stringify(arr));
    if (arr[0]) localStorage.setItem('role', String(arr[0]).toLowerCase());
  } catch {}
}

export function getRoles() {
  try {
    return JSON.parse(localStorage.getItem('roles') || '[]');
  } catch {
    return [];
  }
}

// ---- Logout --------------------------------------------------------
export function logout() {
  localStorage.removeItem('authToken');
  localStorage.removeItem('token'); // 念のため
  localStorage.removeItem('role');
  localStorage.removeItem('roles');
  window.location.assign('/login');
}

// ---- fetch wrapper (401→即ログアウト) ------------------------------
export async function fetchJson(url, opts = {}) {
  const token = getToken();
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(url, { ...opts, headers, credentials: 'include' });

  if (res.status === 401) {
    logout();
    throw new Error('unauthorized');
  }

  const ct = res.headers.get('content-type') || '';
  return ct.includes('application/json') ? res.json() : res.text();
}
