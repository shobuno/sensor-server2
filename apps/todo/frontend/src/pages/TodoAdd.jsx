// sensor-server/apps/todo/frontend/src/pages/TodoAdd.jsx

import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { fetchJson } from "@/auth";
import RepeatEditor from "@todo/components/RepeatEditor.jsx";

export default function TodoAdd({ editId, onCreated }) {
  const nav = useNavigate();
  const location = useLocation(); // 戻ってきた時に key が変わるので再読込トリガに使う
  const isEdit = useMemo(() => !!editId, [editId]);

  const dateRef = useRef(null);
  const timeRef = useRef(null);

  const initialForm = () => ({
    title: "",
    note: "",
    due_date: "",             // 初期は未設定
    due_time: "",             // 初期は未設定
    no_due: true,             // 期限なしを既定ON
    priority: 3,              // 1=低い から  5=高い
    tags: "",
    category: "",
    unit: "分",
    target_amount: "",
    remaining_amount: "",     // ← 追加：残り
    pin_today: true,
    repeat: { type: "none", interval: 1, weekdays: [], yearly: { month: "", day: "" } },
    // ★ 追加: 予定開始/終了（datetime-local の値を保持）
    plan_start_local: "",     // "YYYY-MM-DDTHH:mm"
    plan_end_local: "",       // "YYYY-MM-DDTHH:mm"
    no_plan_start: true,      // 開始なし 既定ON
    no_plan_end: true,        // 終了なし 既定ON
  });

  const [form, setForm] = useState(initialForm());
  const on = (k, v) => setForm((s) => ({ ...s, [k]: v }));
  const resetForm = () => setForm(initialForm());

  // ===== 編集時：初期ロード（戻ってきたときも必ず元データを再取得して上書き） =====
  useEffect(() => {
    if (!isEdit) { resetForm(); return; }

    let alive = true;
    (async () => {
      try {
        const data = await fetchJson(`/api/todo/items/${editId}`);
        const s = data.due_at ? String(data.due_at) : null;

        let due_date = "", due_time = "", no_due = false;
        if (s) {
          if (/[zZ]|[+\-]\d\d:?\d\d$/.test(s)) {
            const d = new Date(s);
            due_date = ymdLocal(d);
            due_time = hmLocal(d);
          } else {
            const norm = s.replace(" ", "T");
            due_date = norm.slice(0, 10);
            due_time = norm.slice(11, 16);
          }
        } else {
          no_due = true;
        }

        // ★ 追加: plan_start_at / plan_end_at を datetime-local に変換して初期値へ
        const plan_start_local = isoToLocalInput(data.plan_start_at);
        const plan_end_local   = isoToLocalInput(data.plan_end_at);
        const no_plan_start = !data.plan_start_at;
        const no_plan_end   = !data.plan_end_at;

        if (!alive) return;
        setForm((st) => ({
          ...st,
          title: data.title || "",
          note: data.description || "",
          due_date,
          due_time,
          no_due,
          priority: priorityToInt(data.priority),
          tags: data.tags_text || "",
          category: data.category || "",
          unit: data.unit || "分",
          target_amount: data.target_amount ?? "",
          remaining_amount: data.remaining_amount ?? "",   // ← 追加：残りの初期値
          plan_start_local,
          plan_end_local,
          no_plan_start,
          no_plan_end,

          // repeat は API 次第。未定義ならデフォルトのまま
        }));
      } catch (_) {
        // 読み込み失敗時は編集を閉じて Today に退避
        nav("/todo/today", { replace: true });
      }
    })();

    // 離脱時は必ず破棄（戻ってきたら再読込される）
    return () => { alive = false; resetForm(); };
  }, [isEdit, editId, location.key, nav]);

  // ===== 当日レポートIDの取得（なければ生成） =====
  async function getOrCreateTodayReportId() {
    try {
      const rep = await fetchJson("/api/todo/daily-reports/today");
      return rep?.id ?? null;
    } catch {
      // 万一失敗しても today_flag だけで継続
      return null;
    }
  }

  // ===== 送信 =====
  const onSubmit = async () => {
    const baseTitle = (form.title || "").trim();
    if (!baseTitle) { alert("タイトルを入力してください"); return; }

    const target =
      form.target_amount === "" ? null : Number(form.target_amount);
    if (form.target_amount !== "" && Number.isNaN(target)) {
      alert("予定は数値で入力してください"); return;
    }

    const remaining =
      form.remaining_amount === "" ? null : Number(form.remaining_amount);
    if (form.remaining_amount !== "" && Number.isNaN(remaining)) {
      alert("残りは数値で入力してください"); return;
    }

    // ★ 追加: 予定開始/終了の ISO 変換
    const plan_start_at = form.no_plan_start ? null : localInputToIso(form.plan_start_local);
    const plan_end_at   = form.no_plan_end   ? null : localInputToIso(form.plan_end_local);

    const payload = {
      title: baseTitle,
      description: (form.note || "").trim() || null,
      priority: Number(form.priority),
      tags_text: parseTags(form.tags).join(","),
      category: (form.category || "").trim() || null,
      unit: (form.unit || "").trim() || "分",
      target_amount: target,
      remaining_amount: remaining,   // ← 追加：残りも送る（PATCH/POST 共通）
      // ★ 追加
      plan_start_at,
      plan_end_at,
    };

    if (form.no_due) {
      payload.due_at = null; // 期限なし
    } else if (form.due_date) {
      const t = form.due_time && /^\d{2}:\d{2}$/.test(form.due_time) ? form.due_time : "00:00";
      // 既存実装に合わせて due_date/due_time を送る（サーバ側でまとめる前提）
      payload.due_date = form.due_date;
      payload.due_time = t;
    }

    try {
      if (isEdit) {
        await fetchJson(`/api/todo/items/${editId}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
        alert("編集を保存しました");
        nav("/todo/today");
      } else {
        const body = {
          ...payload,
          // 新規時：残りが未入力なら予定と同じ値を初期設定
          remaining_amount: remaining === null ? target : remaining,
          pin_today: !!form.pin_today,
          repeat: form.repeat,
        };

        // ★ ここが今回の追加。pin_today のときは daily_report_id を付与
        if (form.pin_today) {
          const reportId = await getOrCreateTodayReportId();
          if (reportId) body.daily_report_id = reportId;
        }

        await fetchJson("/api/todo/items", {
          method: "POST",
          body: JSON.stringify(body),
        });
        resetForm();
        alert("追加しました");
        onCreated?.();
      }
    } catch {
      alert(isEdit ? "編集に失敗しました" : "追加に失敗しました");
    }
  };

  // ===== 期限のクイック操作 =====
  const clearDue = () => {
    on("no_due", true);
    on("due_date", "");
    on("due_time", "");
    dateRef.current?.blur();
    timeRef.current?.blur();
  };
  const setTimeQuick = (hhmm) => {
    if (!form.due_date) on("due_date", todayLocal());
    on("no_due", false);
    on("due_time", hhmm);
    timeRef.current?.focus();
  };

  return (
    <div className="px-2 py-3 sm:px-3 md:p-4 max-w-3xl mx-auto space-y-4">
      <h1 className="text-xl font-bold">{isEdit ? "やることを編集" : "やることを追加"}</h1>

      {/* 基本情報 */}
      <div className="rounded-2xl border p-4 space-y-3">
        <L label="タイトル" required>
          <input
            className="input"
            placeholder="タイトル"
            value={form.title}
            onChange={(e) => on("title", e.target.value)}
          />
        </L>

        <L label="メモ（任意）">
          <textarea
            className="input min-h-[100px]"
            placeholder="メモ（任意）"
            value={form.note}
            onChange={(e) => on("note", e.target.value)}
          />
        </L>
      </div>

      {/* 期限・優先度・タグ */}
      <div className="rounded-2xl border p-4 grid grid-cols-1 md:grid-cols-3 gap-3">
        <L label="期限">
          <div className="flex items-center gap-2 flex-wrap">
            <input
              ref={dateRef}
              type="date"
              className="input w-[180px] shrink-0"
              style={{ fontVariantNumeric: "tabular-nums" }}
              value={form.due_date}
              onChange={(e) => { on("due_date", e.target.value); on("no_due", false); }}
              disabled={form.no_due}
            />
            <input
              ref={timeRef}
              type="time"
              className="input w-[120px] shrink-0"
              style={{ fontVariantNumeric: "tabular-nums" }}
              value={form.due_time}
              onChange={(e) => { on("due_time", e.target.value); on("no_due", false); }}
              step={60}
              disabled={form.no_due}
            />

            {/* クイック時刻（色付きの四角ボタン） */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="px-3 py-1 rounded-md bg-blue-600 text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-400"
                onClick={() => setTimeQuick("00:00")}
                disabled={form.no_due}
                title="0:00 を設定"
              >
                0:00
              </button>
              <button
                type="button"
                className="px-3 py-1 rounded-md bg-blue-600 text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-400"
                onClick={() => setTimeQuick("23:59")}
                disabled={form.no_due}
                title="23:59 を設定"
              >
                23:59
              </button>
              {/* 期限クリア */}
              <button
                type="button"
                className="px-3 py-1 rounded-md bg-gray-200 hover:bg-gray-300 text-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-300"
                onClick={clearDue}
                title="期限を削除（期限なし）"
              >
                ×
              </button>
            </div>
          </div>

          {/* 期限なし */}
          <label className="mt-2 inline-flex items-center gap-2 select-none">
            <input
              type="checkbox"
              className="checkbox"
              checked={form.no_due}
              onChange={(e) => {
                const v = e.target.checked;
                on("no_due", v);
                if (v) { on("due_date", ""); on("due_time", ""); }
              }}
            />
            <span>期限なし</span>
          </label>
        </L>

        <L label="優先度">
          <select
            className="select"
            value={form.priority}
            onChange={(e) => on("priority", Number(e.target.value))}
          >
            <option value={1}>★☆☆☆☆</option>
            <option value={2}>★★☆☆☆</option>
            <option value={3}>★★★☆☆</option>
            <option value={4}>★★★★☆</option>
            <option value={5}>★★★★★</option>
          </select>
        </L>

        <L label="タグ（カンマ/スペース区切り）">
          <input
            className="input"
            placeholder="仕事, 家, 学習 など"
            value={form.tags}
            onChange={(e) => on("tags", e.target.value)}
          />
        </L>
      </div>

      {/* 予定の開始時刻 / 終了時刻（任意） */}
      <div className="rounded-2xl border p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
        <L label="開始時刻（任意）">
          <input
            type="datetime-local"
            className="input"
            style={{ fontVariantNumeric: "tabular-nums" }}
            value={form.plan_start_local}
            onChange={(e) => { on("plan_start_local", e.target.value); on("no_plan_start", false); }}
            step={60}
            disabled={form.no_plan_start}
          />
          <label className="mt-2 inline-flex items-center gap-2 select-none">
            <input
              type="checkbox"
              className="checkbox"
              checked={form.no_plan_start}
              onChange={(e) => {
                const v = e.target.checked;
                on("no_plan_start", v);
                if (v) on("plan_start_local", "");
              }}
            />
            <span>開始なし</span>
          </label>
        </L>
        <L label="終了時刻（任意）">
          <input
            type="datetime-local"
            className="input"
            style={{ fontVariantNumeric: "tabular-nums" }}
            value={form.plan_end_local}
            onChange={(e) => { on("plan_end_local", e.target.value); on("no_plan_end", false); }}
            step={60}
            disabled={form.no_plan_end}
          />
          <label className="mt-2 inline-flex items-center gap-2 select-none">
            <input
              type="checkbox"
              className="checkbox"
              checked={form.no_plan_end}
              onChange={(e) => {
                const v = e.target.checked;
                on("no_plan_end", v);
                if (v) on("plan_end_local", "");
              }}
            />
            <span>終了なし</span>
          </label>
        </L>
      </div>

      {/* 分類・予定＋残り＋単位（横並び） */}
      <div className="rounded-2xl border p-4 grid grid-cols-1 md:grid-cols-3 gap-3">
        <L label="カテゴリ">
          <input
            className="input"
            placeholder="カテゴリ（任意）"
            value={form.category}
            onChange={(e) => on("category", e.target.value)}
          />
        </L>

        {/* 予定 / 残り / 単位 */}
        <L label="予定 / 残り / 単位">
          {/* スマホ=折返しOK、PC=横一列で固定 */}
          <div className="flex items-center gap-2 flex-wrap md:flex-nowrap md:gap-3">
            <span className="whitespace-nowrap text-sm text-muted-foreground">予定</span>
            <input
              className="input w-24 md:w-28"
              type="number"
              inputMode="decimal"
              placeholder="例) 30"
              value={form.target_amount}
              onChange={(e) => on("target_amount", e.target.value)}
            />
            <span className="whitespace-nowrap text-sm text-muted-foreground">残り</span>
            <input
              className="input w-24 md:w-28"
              type="number"
              inputMode="decimal"
              placeholder="例) 10"
              value={form.remaining_amount}
              onChange={(e) => on("remaining_amount", e.target.value)}
            />
            <span className="whitespace-nowrap text-sm text-muted-foreground">単位</span>
            <input
              className="input w-28 md:w-32"
              placeholder="分 / 件 / 冊 など"
              value={form.unit}
              onChange={(e) => on("unit", e.target.value)}
            />
          </div>
        </L>

        <div aria-hidden />
      </div>

      {/* 今日に入れる（新規時のみ） */}
      {!isEdit && (
        <div className="rounded-2xl border p-4">
          <label className="inline-flex items-center gap-2">
            <input
              id="pin_today"
              type="checkbox"
              className="checkbox"
              checked={form.pin_today}
              onChange={(e) => on("pin_today", e.target.checked)}
            />
            <span className="select-none">今日に入れる</span>
          </label>
        </div>
      )}

      {/* 🔁 繰り返し */}
      <div className="rounded-2xl border p-4 space-y-2">
        <RepeatEditor value={form.repeat} onChange={(r) => on("repeat", r)} dueDate={form.due_date} />
      </div>

      {/* アクション */}
      <div className="flex justify-end gap-2">
        {isEdit && (
          <button
            type="button"
            className="btn-outline"
            onClick={() => nav("/todo/today")}
          >
            キャンセル
          </button>
        )}
        <button className="btn-primary" onClick={onSubmit}>
          {isEdit ? "編集を保存" : "＋ 追加"}
        </button>
      </div>
    </div>
  );
}

// ラベル付きコンテナ
function L({ label, required = false, children }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-sm text-muted-foreground">
        {label} {required && <span className="text-red-500">*</span>}
      </span>
      {children}
    </label>
  );
}

// ===== util =====
function parseTags(str) {
  return Array.from(new Set((str || "").split(/[,、\s]+/).map((s) => s.trim()).filter(Boolean)));
}
function pad2(n) { return String(n).padStart(2, "0"); }
function todayLocal() { const d = new Date(); return ymdLocal(d); }
function ymdLocal(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function hmLocal(d) {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}
function priorityToInt(p) {
  if (typeof p === "number") return Math.min(3, Math.max(1, p | 0)) || 2;
  const m = { high: 1, medium: 2, low: 3 };
  return m[String(p || "medium")] ?? 2;
}

// ★ 追加: ISO ⇔ datetime-local 変換ヘルパ
function isoToLocalInput(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  return `${ymdLocal(d)}T${hmLocal(d)}`;
}
function localInputToIso(v) {
  if (!v) return null;
  const d = new Date(v);
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}
