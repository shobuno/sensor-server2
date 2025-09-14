// sensor-server/apps/todo/frontend/src/lib/apiTodo.ts

import { fetchJson } from "@/auth";
console.info("[apiTodo.ts] LOADED (this is the one you edited)");
/* ========================== Types =========================== */
export type ItemStatus = "INBOX" | "DOING" | "PAUSED" | "DONE";
export type ItemType = "normal" | "template" | "repeat_rule";
export type ItemKind = "NORMAL" | "TEMPLATE" | "REPEAT";

// 繰り返し仕様
export type RepeatAfterUnit = "hour" | "day" | "week" | "month";
export interface RepeatRule {
  type: "none" | "daily" | "weekly" | "monthly" | "yearly" | "after";
  interval?: number;
  weekdays?: Array<"mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun">;
  monthly?: {
    mode: "day" | "nth";
    day?: number;
    nth?: number;
    weekday?: "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
  };
  yearly?: { month: number; day: number };
  after?: { amount: number; unit: RepeatAfterUnit };
  generate?: { policy: "immediate" | "on_due" | "before"; advance_days?: number };
}

export interface Item {
  id: number;
  title: string;
  description?: string | null;
  status: ItemStatus;
  priority?: number | null; // 1..5（小さいほど高）
  due_at?: string | null; // ISO
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

  // v1.7 追加
  item_type?: ItemType; // normal / template / repeat_rule
  todo_flag?: boolean; // true=時間管理なし TODO
  default_todo_flag?: boolean; // template/repeat_rule 用
  default_today_flag?: boolean; // template/repeat_rule 用

  // v1.8〜 繰り返し対応
  kind?: ItemKind;
  repeat?: RepeatRule;
}

export interface DayStartResponse {
  daily_report_id: number | null;
  items: Item[];
}

export interface DailyReport {
  id: number;
  report_date: string; // "YYYY-MM-DD"（JST日付）
  period_start_at?: string | null; // ISO（+09:00）
  period_end_at?: string | null; // ISO（+09:00）
  created_at?: string;
  updated_at?: string;
}
/* ============================================================ */

const BASE = "/api/todo";

// fetchJson は JSON を返す約束のユーティリティ
async function req<T>(
  path: string,
  init?: RequestInit & { body?: any; json?: any }
): Promise<T> {
  const url = `${BASE}${path}`;
  let opts: any = init ?? {};
  if (opts.json !== undefined) {
    opts = {
      ...opts,
      method: opts.method ?? "POST",
      headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
      body: JSON.stringify(opts.json),
    };
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

export async function listItems(params?: {
  item_type?: ItemType;
  todo_flag?: boolean;
  [key: string]: any;
}): Promise<{ items: Item[] } | Item[]> {
  const qs = params ? `?${new URLSearchParams(params as any).toString()}` : "";
  return await req<{ items: Item[] } | Item[]>(`/items${qs}`);
}

export async function patchItem(id: number, body: Partial<Item>): Promise<Item> {
  return await req<Item>(`/items/${id}`, { method: "PATCH", json: body });
}

// ★ normal/repeat/template の新規作成
export async function createItem(body: Partial<Item>): Promise<Item> {
  return await req<Item>(`/items`, { method: "POST", json: body });
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

/* ====== Template API ====== */
export async function registerTemplate(id: number): Promise<Item> {
  return await req<Item>(`/templates/${id}/register`, { method: "POST" });
}

export async function listTemplates(): Promise<Item[]> {
  return await req<Item[]>("/templates");
}

export async function createTemplate(body: Partial<Item>): Promise<Item> {
  return await req<Item>("/templates", { method: "POST", json: body });
}

export async function addTemplateToToday(id: number): Promise<Item> {
  return await req<Item>(`/templates/${id}/add-today`, { method: "POST" });
}
