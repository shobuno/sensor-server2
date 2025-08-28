// seneor-server/apps/todo/frontend/src/lib/api.js

const API_BASE = (import.meta.env.VITE_TODO_API || "/api/").replace(/\/?$/, "/");

function authHeaders() {
  const token = localStorage.getItem("authToken") || localStorage.getItem("token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request(path, init = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: "include", // Cookie運用もサポート
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
      ...(init.headers || {}),
    },
    ...init,
  });
  const ct = res.headers.get("content-type") || "";
  const isJson = ct.includes("application/json");
  if (!res.ok) {
    const err = isJson ? await res.json().catch(() => ({})) : await res.text();
    const msg = (err && (err.error || err.message)) || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return isJson ? res.json() : undefined;
}

// === 今日の開始 ===
export const getStartCandidates = () => request("todo/day/start");
export const commitToday = (itemIds) =>
  request("todo/day/commit", { method: "POST", body: JSON.stringify({ item_ids: itemIds }) });

// === 今日の終了 ===
export const getTodayItems = () => request("todo/items?bucket=today");
export const closeToday = (remaining) =>
  request("todo/day/close", { method: "POST", body: JSON.stringify({ remaining }) });

// === 補助操作 ===
export const pauseItem = (id) => request(`todo/items/${id}/pause`, { method: "POST" });
export const finishItem = (id) => request(`todo/items/${id}/finish`, { method: "POST" });
