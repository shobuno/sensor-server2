// apps/todo/frontend/src/lib/apiTodo.ts
// 既存の認証付きフェッチを使うことで Authorization/Cookie を確実に付与する
import { fetchJson } from "@/auth";

/* ========================== Types =========================== */
export type ItemStatus = "INBOX" | "DOING" | "PAUSED" | "DONE";
export interface Item {
  id: number;
  title: string;
  description?: string | null;
  status: ItemStatus;
  priority?: number | null;     // 1..5（小さいほど高）
  due_at?: string | null;       // ISO
  plan_start_at?: string | null;
  plan_end_at?: string | null;
  unit?: string | null;
  target_amount?: number | null;
  remaining_amount?: string | number | null;
  tags_text?: string | null;
  today_flag?: boolean;
  daily_report_id?: number | null;
  created_at?: string;
  updated_at?: string;
}

export interface DayStartResponse {
  daily_report_id: number | null;
  items: Item[];
}

export interface DailyReport {
  id: number;
  report_date: string;              // "YYYY-MM-DD"（JST日付）
  period_start_at?: string | null;  // ISO（+09:00）
  period_end_at?: string | null;    // ISO（+09:00）
  created_at?: string;
  updated_at?: string;
}
/* ============================================================ */

const BASE = "/api/todo";

// fetchJson は JSON を返す約束のユーティリティ
async function req<T>(path: string, init?: RequestInit & { body?: any; json?: any }): Promise<T> {
  const url = `${BASE}${path}`;
  let opts: any = init ?? {};
  // init.json を指定されたら JSON に整形（既存 fetchJson に合わせておく）
  if (opts.json !== undefined) {
    opts = { ...opts, method: opts.method ?? "POST", headers: { "Content-Type": "application/json", ...(opts.headers || {}) }, body: JSON.stringify(opts.json) };
    delete opts.json;
  }
  return await fetchJson(url, opts);
}

/* ==================== Public API functions ================== */
export async function getDayStart(): Promise<DayStartResponse> {
  const data = await req<DayStartResponse>("/day/start");
  if (data && typeof data === "object" && !("daily_report_id" in data)) {
    return { daily_report_id: null, items: (data as any).items ?? [] };
  }
  return data;
}

export async function getStartCandidates(): Promise<{ items: Item[] }> {
  return await req<{ items: Item[] }>("/day/start");
}

export async function listItems(params?: Record<string, any>): Promise<{ items: Item[] } | Item[]> {
  const qs = params ? `?${new URLSearchParams(params).toString()}` : "";
  return await req<{ items: Item[] } | Item[]>(`/items${qs}`);
}

export async function patchItem(id: number, body: Partial<Item>): Promise<Item> {
  return await req<Item>(`/items/${id}`, { method: "PATCH", json: body });
}

/* ====== DailyReport API（period_* に統一） ====== */
export async function getReport(id: number): Promise<DailyReport> {
  return await req<DailyReport>(`/reports/${id}`);
}

export async function patchReport(
  id: number,
  body: Partial<Pick<DailyReport, "period_start_at" | "period_end_at">>
): Promise<DailyReport> {
  return await req<DailyReport>(`/reports/${id}`, { method: "PATCH", json: body });
}

export const updateReport = patchReport;
