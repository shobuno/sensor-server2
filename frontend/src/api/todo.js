// sensor-server/frontend/src/api/todo.js

import { fetchJson } from "@/auth";

const BASE = "/api/todo";        // ← ここを基準に全エンドポイントを作る

function qs(params = {}) {
  const p = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v === undefined || v === null || v === "") return;
    p.set(k, String(v));
  });
  const s = p.toString();
  return s ? `?${s}` : "";
}

// ------- Items -------
export function listItems(params = {}) {
  return fetchJson(`${BASE}/items${qs(params)}`);
}

// ✅ today_flag=true で取得
export function listToday(limit = 200) {
  return listItems({ today: 1, limit });
}

// 🔧 互換: 旧API名を残す（TodayCloseViewなどから呼ばれる）
export function getTodayItems(limit = 1000) {
  return listToday(limit);
}

export function createItem(data) {
  return fetchJson(`${BASE}/items`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}
export function updateItem(id, patch) {
  return fetchJson(`${BASE}/items/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
}
export function deleteItem(id) {
  return fetchJson(`${BASE}/items/${id}`, { method: "DELETE" });
}
export function startItem(id) {
  return fetchJson(`${BASE}/items/${id}/start`, { method: "POST" });
}
export function pauseItem(id) {
  return fetchJson(`${BASE}/items/${id}/pause`, { method: "POST" });
}
export function finishItem(id) {
  return fetchJson(`${BASE}/items/${id}/finish`, { method: "POST" });
}

// ------- 今日の開始 -------
export function getStartCandidates() {
  return fetchJson(`${BASE}/day/start`);
}
export function commitToday(itemIds) {
  return fetchJson(`${BASE}/day/commit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ item_ids: itemIds }),
  });
}

// ------- 今日の終了（統一版・後方互換） -------
export function closeToday(arg = undefined) {
  // 互換パターン:
  // 1) closeToday([{ id, remaining_amount }])  ← 配列を渡す
  // 2) closeToday({ remaining: [...] })        ← オブジェクトを渡す
  // 3) closeToday()                             ← 何も渡さない
  let body;
  if (Array.isArray(arg)) {
    body = { remaining: arg };
  } else if (arg && Array.isArray(arg.remaining)) {
    body = arg;
  } else {
    body = { remaining: [] };
  }
  return fetchJson(`${BASE}/day/close`, {   // ← 常に /api/todo/day/close に行く
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}


// ------- メモ -------
export function addNote(itemId, text) {
  return fetchJson(`${BASE}/items/${itemId}/notes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
}

// ------- 依頼 / レポート -------
export function delegateTask(payload) {
  return fetchJson(`${BASE}/delegate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

// --- 日報取得 ---
export function getDailyReport({ from, to, date } = {}) {
  // date 単体なら from=to=date にマッピング
  if (date && !from && !to) {
    from = date;
    to = date;
  }
  return fetchJson(`/todo/reports/daily${qs({ from, to })}`);
}

