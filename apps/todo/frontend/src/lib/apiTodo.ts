// sensor-server/apps/todo/frontend/src/lib/apiTodo.ts

// src/lib/apiTodo.ts
const API_BASE = import.meta.env.VITE_TODO_API?.replace(/\/?$/, "/") || "/api/";

function authHeaders() {
  const token = localStorage.getItem("authToken") || localStorage.getItem("token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
      ...(init?.headers || {}),
    },
    ...init,
  });
  const ct = res.headers.get("content-type") || "";
  if (!res.ok) {
    let detail: any = {};
    if (ct.includes("application/json")) {
      try { detail = await res.json(); } catch {}
    } else {
      detail = await res.text();
    }
    throw new Error(detail?.error || detail?.message || `HTTP ${res.status}`);
  }
  if (ct.includes("application/json")) return res.json();
  // 非JSONなら空を返す
  // @ts-expect-error
  return undefined;
}

// === 今日の開始 ===
export type TodoItem = {
  id: number;
  title: string;
  description: string | null;
  status: "INBOX" | "TODAY" | "DOING" | "PAUSED" | "DONE";
  priority: "low" | "medium" | "high"; // サーバ側で 1/2/3 → 文字列に変換済
  due_at: string | null;               // ISO
  category: string | null;
  unit: string | null;
  target_amount: string | null;
  remaining_amount: string | null;
  run_seconds?: number;
};

export async function getStartCandidates(): Promise<TodoItem[]> {
  return request<TodoItem[]>("todo/day/start");
}
export async function commitToday(itemIds: number[]) {
  return request<{ ok: true; plan_id: number }>("todo/day/commit", {
    method: "POST",
    body: JSON.stringify({ item_ids: itemIds }),
  });
}

// === 今日の終了 ===
export async function getTodayItems(): Promise<TodoItem[]> {
  // ✅ today_flag=true の一覧を取得（DONEはUI側でフィルタ）
  return request<TodoItem[]>("todo/items?today=1&limit=1000");
}

export async function closeToday(remaining: { id: number; remaining_amount: number }[]) {
  return request<{ ok: true; updated: number }>("todo/day/close", {
    method: "POST",
    body: JSON.stringify({ remaining }),
  });
}

// === 補助操作 ===
export async function startItem(id: number) {
  return request<{ ok: true }>(`todo/items/${id}/start`, { method: "POST" });
}
export async function pauseItem(id: number) {
  return request<{ ok: true }>(`todo/items/${id}/pause`, { method: "POST" });
}
export async function finishItem(id: number) {
  return request<{ ok: true }>(`todo/items/${id}/finish`, { method: "POST" });
}
