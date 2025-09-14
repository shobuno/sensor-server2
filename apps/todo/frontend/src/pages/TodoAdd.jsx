// sensor-server/apps/todo/frontend/src/pages/TodoAdd.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { fetchJson } from "@/auth";
import RepeatEditor from "@todo/components/RepeatEditor.jsx";

export default function TodoAdd({ editId, onCreated }) {
  const nav = useNavigate();
  const location = useLocation();
  const isEdit = useMemo(() => !!editId, [editId]);

  const params = new URLSearchParams(location.search);
  const queryKind = params.get("kind"); // "template" / "repeat" / null

  const dateRef = useRef(null);
  const timeRef = useRef(null);

  const initialForm = () => ({
    item_type:
      queryKind === "template"
        ? "TEMPLATE"
        : queryKind === "repeat"
        ? "REPEAT"
        : "NORMAL",
    title: "",
    note: "",
    due_date: "",
    due_time: "",
    no_due: true,
    priority: 3,
    tags: "",
    category: "",
    unit: "分",
    target_amount: "",
    remaining_amount: "",
    todo_flag: true,
    pin_today: queryKind ? false : true,
    repeat: { type: "none", interval: 1, weekdays: [], yearly: { month: "", day: "" } },
    plan_start_local: "",
    plan_end_local: "",
    no_plan_start: true,
    no_plan_end: true,
  });

  const [form, setForm] = useState(initialForm());
  const on = (k, v) => setForm((s) => ({ ...s, [k]: v }));
  const resetForm = () => setForm(initialForm());

  /* ===== 編集ロード ===== */
  useEffect(() => {
    if (!isEdit) { resetForm(); return; }
    let alive = true;
    (async () => {
      try {
        const data = await fetchJson(`/api/todo/items/${editId}`);
        if (!alive) return;

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

        const plan_start_local = isoToLocalInput(data.plan_start_at);
        const plan_end_local   = isoToLocalInput(data.plan_end_at);

        setForm((st) => ({
          ...st,
          item_type: String(data.item_type || "NORMAL").toUpperCase(),
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
          remaining_amount: data.remaining_amount ?? "",
          todo_flag: !!data.todo_flag,
          plan_start_local,
          plan_end_local,
          no_plan_start: !data.plan_start_at,
          no_plan_end: !data.plan_end_at,
          pin_today: false,
          repeat: data.repeat || { type: "none", interval: 1, weekdays: [], yearly: { month: "", day: "" } },
        }));
      } catch {
        nav("/todo/today", { replace: true });
      }
    })();
    return () => { alive = false; resetForm(); };
  }, [isEdit, editId, location.key, nav]);

  /* ===== 当日レポートIDの取得 ===== */
  async function getOrCreateTodayReportId() {
    try {
      const rep = await fetchJson("/api/todo/daily-reports/today");
      return rep?.id ?? null;
    } catch {
      return null;
    }
  }

  /* ===== 送信 ===== */
  const onSubmit = async () => {
    const baseTitle = (form.title || "").trim();
    if (!baseTitle) { alert("タイトルを入力してください"); return; }

    const target = form.target_amount === "" ? null : Number(form.target_amount);
    if (form.target_amount !== "" && Number.isNaN(target)) {
      alert("予定は数値で入力してください"); return;
    }
    const remaining = form.remaining_amount === "" ? null : Number(form.remaining_amount);
    if (form.remaining_amount !== "" && Number.isNaN(remaining)) {
      alert("残りは数値で入力してください"); return;
    }

    const plan_start_at = form.no_plan_start ? null : localInputToIso(form.plan_start_local);
    const plan_end_at   = form.no_plan_end   ? null : localInputToIso(form.plan_end_local);

    const payloadBase = {
      title: baseTitle,
      description: (form.note || "").trim() || null,
      priority: Number(form.priority),
      tags_text: parseTags(form.tags).join(","),
      category: (form.category || "").trim() || null,
      unit: (form.unit || "").trim() || "分",
      target_amount: target,
      remaining_amount: remaining,
      plan_start_at,
      plan_end_at,
      item_type: form.item_type || "NORMAL",
      todo_flag: !!form.todo_flag,
      repeat: form.repeat,
    };

    if (form.no_due) {
      payloadBase.due_at = null;
    } else if (form.due_date) {
      const t = form.due_time && /^\d{2}:\d{2}$/.test(form.due_time) ? form.due_time : "00:00";
      payloadBase.due_date = form.due_date;
      payloadBase.due_time = t;
    }

    try {
      if (isEdit) {
        await fetchJson(`/api/todo/items/${editId}`, {
          method: "PATCH",
          body: JSON.stringify(payloadBase),
        });
        alert("編集を保存しました");
        nav("/todo/today");
      } else {
        const body = {
          ...payloadBase,
          remaining_amount: remaining === null ? target : remaining,
        };

        if (form.item_type === "NORMAL" && form.pin_today) {
          const reportId = await getOrCreateTodayReportId();
          if (reportId) body.daily_report_id = reportId;
        }

        await fetchJson("/api/todo/items", {
          method: "POST",
          body: JSON.stringify(body),
        });

        resetForm();
        alert("追加しました");
        if (form.item_type === "TEMPLATE") {
          nav("/todo/templates");
        } else if (form.item_type === "REPEAT") {
          nav("/todo/repeats");
        } else {
          onCreated?.();
        }
      }
    } catch {
      alert(isEdit ? "編集に失敗しました" : "追加に失敗しました");
    }
  };

  /* ===== 期限クイック ===== */
  const clearDue = () => { on("no_due", true); on("due_date", ""); on("due_time", ""); dateRef.current?.blur(); timeRef.current?.blur(); };
  const setTimeQuick = (hhmm) => { if (!form.due_date) on("due_date", todayLocal()); on("no_due", false); on("due_time", hhmm); timeRef.current?.focus(); };

  return (
    <div className="px-2 py-3 sm:px-3 md:p-4 max-w-3xl mx-auto space-y-4">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-bold">
          {isEdit ? "やることを編集" :
            form.item_type === "TEMPLATE" ? "テンプレートを追加" :
            form.item_type === "REPEAT" ? "繰り返し項目を追加" :
            "やることを追加"}
        </h1>
      </div>

      {/* 基本情報 */}
      <div className="rounded-2xl border p-4 space-y-3">
        <L label="タイトル" required>
          <input className="input" placeholder="タイトル" value={form.title} onChange={(e) => on("title", e.target.value)} />
        </L>
        <L label="メモ（任意）">
          <textarea className="input min-h-[100px]" placeholder="メモ（任意）" value={form.note} onChange={(e) => on("note", e.target.value)} />
        </L>
      </div>

      {/* 期限・優先度・タグ */}
      <div className="rounded-2xl border p-4 grid grid-cols-1 md:grid-cols-3 gap-3">
        <L label="期限">
          <div className="flex items-center gap-2 flex-wrap">
            <input ref={dateRef} type="date" className="input w-[180px]" value={form.due_date}
              onChange={(e) => { on("due_date", e.target.value); on("no_due", false); }} disabled={form.no_due} />
            <input ref={timeRef} type="time" className="input w-[120px]" value={form.due_time}
              onChange={(e) => { on("due_time", e.target.value); on("no_due", false); }} step={60} disabled={form.no_due} />
            <button type="button" className="px-2 bg-gray-200" onClick={clearDue}>×</button>
          </div>
          <label className="mt-2 inline-flex items-center gap-2 select-none">
            <input type="checkbox" className="checkbox" checked={form.no_due}
              onChange={(e) => { const v = e.target.checked; on("no_due", v); if (v) { on("due_date", ""); on("due_time", ""); } }} />
            <span>期限なし</span>
          </label>
        </L>

        <L label="優先度">
          <select className="select" value={form.priority} onChange={(e) => on("priority", Number(e.target.value))}>
            <option value={1}>★☆☆☆☆</option>
            <option value={2}>★★☆☆☆</option>
            <option value={3}>★★★☆☆</option>
            <option value={4}>★★★★☆</option>
            <option value={5}>★★★★★</option>
          </select>
        </L>

        <L label="タグ">
          <input className="input" placeholder="仕事, 家, 学習" value={form.tags} onChange={(e) => on("tags", e.target.value)} />
        </L>
      </div>

      {/* TODO型 / 予定開始・終了 */}
      <div className="rounded-2xl border p-4 space-y-3">
        <label className="inline-flex items-center gap-2">
          <input type="checkbox" className="checkbox" checked={form.todo_flag} onChange={(e) => on("todo_flag", e.target.checked)} />
          <span>TODO型（チェックのみ）</span>
        </label>
      </div>

      {/* 分類・予定/残り/単位 */}
      <div className="rounded-2xl border p-4 grid grid-cols-1 md:grid-cols-3 gap-3">
        <L label="カテゴリ"><input className="input" value={form.category} onChange={(e) => on("category", e.target.value)} /></L>
        <L label="予定 / 残り / 単位">
          <div className="flex gap-2">
            <input className="input w-20" type="number" value={form.target_amount} onChange={(e) => on("target_amount", e.target.value)} />
            <input className="input w-20" type="number" value={form.remaining_amount} onChange={(e) => on("remaining_amount", e.target.value)} />
            <input className="input w-20" value={form.unit} onChange={(e) => on("unit", e.target.value)} />
          </div>
        </L>
      </div>

      {/* 繰り返し設定 */}
      {form.item_type === "REPEAT" && (
        <div className="rounded-2xl border p-4">
          <RepeatEditor value={form.repeat} onChange={(r) => on("repeat", r)} dueDate={form.due_date} />
        </div>
      )}

      {/* アクション */}
      <div className="flex justify-end gap-2">
        {isEdit && (
          <button type="button" className="btn-outline" onClick={() => nav("/todo/today")}>
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

/* ===== util ===== */
function parseTags(str) {
  return Array.from(new Set((str || "").split(/[,、\s]+/).map((s) => s.trim()).filter(Boolean)));
}
function pad2(n) { return String(n).padStart(2, "0"); }
function todayLocal() { const d = new Date(); return ymdLocal(d); }
function ymdLocal(d) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
function hmLocal(d) { return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`; }
function priorityToInt(p) {
  if (typeof p === "number") return Math.min(5, Math.max(1, p | 0)) || 3;
  const m = { high: 1, medium: 2, low: 3 };
  return m[String(p || "medium")] ?? 3;
}
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
