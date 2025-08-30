// sensor-server2/apps/todo/frontend/src/lib/apiTodo.ts
import axios, { AxiosInstance, AxiosRequestConfig } from "axios";

/* ======================= Token helpers ======================= */
function readCookie(...keys: string[]): string | null {
  if (typeof document === "undefined") return null;
  const jar = Object.fromEntries(
    document.cookie.split(";").map((s) => {
      const [k, ...v] = s.trim().split("=");
      return [decodeURIComponent(k), decodeURIComponent(v.join("=") || "")];
    })
  );
  for (const k of keys) if (jar[k]) return jar[k];
  return null;
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;

  const ls = (k: string) => {
    try { return localStorage.getItem(k); } catch { return null; }
  };
  const ss = (k: string) => {
    try { return sessionStorage.getItem(k); } catch { return null; }
  };

  const cands = [
    // local/session storage
    ls("token"), ls("auth_token"), ls("jwt"), ls("access_token"), ls("Authorization"),
    ss("token"), ss("auth_token"), ss("jwt"), ss("access_token"), ss("Authorization"),
    // window グローバル
    (window as any).__AUTH_TOKEN__ || (window as any).__TOKEN__ || null,
    // meta
    (() => {
      const el = typeof document !== "undefined"
        ? document.querySelector('meta[name="authorization"],meta[name="auth-token"]') as HTMLMetaElement | null
        : null;
      return el?.content ?? null;
    })(),
    // cookie
    readCookie("Authorization", "authorization", "token", "auth_token", "jwt", "access_token"),
  ].filter(Boolean) as string[];

  if (!cands.length) return null;
  const t = String(cands[0]);
  return t.startsWith("Bearer ") ? t.slice(7) : t;
}
/* ============================================================ */

/* ======================= Axios client ======================= */
const baseURL = "/api/todo"; // ← Vite/CRA の dev プロキシでバックエンドへ

export const client: AxiosInstance = axios.create({
  baseURL,
  withCredentials: true, // Cookie セッションも使う
  timeout: 30000,
});

// 認証ヘッダを必ず付ける
client.interceptors.request.use((config) => {
  const token = getToken();
  // 既に付いていない場合だけ設定
  if (token && !config.headers?.Authorization) {
    (config.headers as any).Authorization = `Bearer ${token}`;
    (config.headers as any)["X-Auth-Token"] = token;   // サーバがこちらを見るケースもカバー
    (config.headers as any)["x-access-token"] = token; // 念のため
  }
  // CORS・Cookie 同時利用時のヘッダ
  (config.headers as any)["Content-Type"] ??= "application/json";
  return config;
});

// 401 のときにここで握りつぶさず投げる（呼び出し側でハンドリング）
client.interceptors.response.use(
  (res) => res,
  (err) => {
    // ここでリダイレクトしたいなら実装（例：/login へ）
    // if (err?.response?.status === 401) { window.location.href = "/login"; }
    return Promise.reject(err);
  }
);
/* ============================================================ */

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
  remaining_amount?: number | null;
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
/* ============================================================ */

/* ==================== Public API functions ================== */
// 今日の開始データ（当日日報ID＋候補一覧）
export async function getDayStart(): Promise<DayStartResponse> {
  const { data } = await client.get<DayStartResponse>("/day/start");
  // バックエンドの戻りが { items } だけの場合にも対応
  if (data && typeof data === "object" && !("daily_report_id" in data)) {
    return { daily_report_id: null, items: (data as any).items ?? [] };
  }
  return data;
}

// 候補一覧（INBOX / PAUSED / DOING 等）
export async function getStartCandidates(): Promise<{ items: Item[] }> {
  const { data } = await client.get<{ items: Item[] }>("/day/start");
  return data;
}

// 今日に選ばれている一覧
export async function listItems(params?: Record<string, any>): Promise<{ items: Item[] } | Item[]> {
  const cfg: AxiosRequestConfig = { params: params ?? {} };
  const { data } = await client.get("/items", cfg);
  return data;
}

// items 単体更新（今日の開始のチェックON/OFFで使用）
export async function patchItem(id: number, body: Partial<Item>): Promise<Item> {
  const { data } = await client.patch<Item>(`/items/${id}`, body);
  return data;
}

// 互換 API が必要なら適宜エクスポート（例：手動確定/終了など）
// export async function commitToday(item_ids: number[]) { ... }
// export async function closeDay(payload: any) { ... }
/* ============================================================ */

/* ===================== 開発時のヒント ======================= */
// 1) Network タブで /api/todo/... のリクエストに
//    - Authorization: Bearer xxxxx
//    - Cookie (セッション)
//    が付いているか確認してください。
// 2) 付いていなければ getToken() が空を返しています。
//    実際にトークンが保存されているキー名を getToken() の候補に足してください。
// 3) dev サーバで 401 CORS が出る場合は、バックエンドの CORS 設定に
//    Access-Control-Allow-Credentials: true
//    Access-Control-Allow-Headers: Authorization, X-Auth-Token, x-access-token, X-Requested-With, Content-Type
//    を追加してください。
/* ============================================================ */
