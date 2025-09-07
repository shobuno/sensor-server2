// sensor-server/apps/todo/frontend/src/pages/TodoAdd.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { fetchJson } from "@/auth";
import RepeatEditor from "@todo/components/RepeatEditor.jsx";

export default function TodoAdd({ editId, onCreated }) {
  const nav = useNavigate();
  const location = useLocation();
  const isEdit = useMemo(() => !!editId, [editId]);

  // URLクエリで ?kind=template を見る（新規時の初期値用）
  const params = new URLSearchParams(location.search);
  const queryWantsTemplate = params.get("kind") === "template";

  const dateRef = useRef(null);
  const timeRef = useRef(null);

  const initialForm = () => ({
    // 保存先（NORMAL/TEMPLATE）
    save_as_template: queryWantsTemplate,      // 新規: ?kind=template なら true
    // 入力
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
    // TODO型
    todo_flag: true,                            // 既定: ON
    // 今日に入れる（テンプレ時は非表示）
    pin_today: !queryWantsTemplate,             // テンプレ新規なら false
    // 繰り返し
    repeat: { type: "none", interval: 1, weekdays: [], yearly: { month: "", day: "" } },
    // 予定開始/終了
    plan_start_local: "",
    plan_end_local: "",
    no_plan_start: true,
    no_plan_end: true,
  });

  const [form, setForm] = useState(initialForm());
  const on = (k, v) => setForm((s) => ({ ...s, [k]: v }));
  const resetForm = () => setForm(initialForm());

  // ===== 編集ロード =====
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

        const plan_start_local = isoToLocalInput(data.plan_start_at);
        const plan_end_local   = isoToLocalInput(data.plan_end_at);
        const no_plan_start = !data.plan_start_at;
        const no_plan_end   = !data.plan_end_at;

        if (!alive) return;
        setForm((st) => ({
          ...st,
          save_as_template: String(data.kind).toUpperCase() === "TEMPLATE",
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
          // 予定
          plan_start_local,
          plan_end_local,
          no_plan_start,
          no_plan_end,
          // pin_today は編集では意味が薄いので常に false に寄せる
          pin_today: false,
        }));
      } catch (_) {
        nav("/todo/today", { replace: true });
      }
    })();

    return () => { alive = false; resetForm(); };
  }, [isEdit, editId, location.key, nav]);

  // ===== 当日レポートIDの取得（なければ生成） =====
  async function getOrCreateTodayReportId() {
    try {
      const rep = await fetchJson("/api/todo/daily-reports/today");
      return rep?.id ?? null;
    } catch {
      return null;
    }
  }

  // ===== 送信 =====
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

    // ここが重要：kind と todo_flag を常に送る
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
      kind: form.save_as_template ? "TEMPLATE" : "NORMAL",
      todo_flag: !!form.todo_flag,
    };

    // 期限
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
        // 編集対象がテンプレなら一覧へ、通常なら今日へ
        if (form.save_as_template) nav("/todo/templates");
        else nav("/todo/today");
      } else {
        const body = {
          ...payloadBase,
          remaining_amount: remaining === null ? target : remaining,
          repeat: form.repeat,
        };

        // テンプレ保存中は pin_today/daily_report_id を付けない
        if (!form.save_as_template && form.pin_today) {
          const reportId = await getOrCreateTodayReportId();
          if (reportId) body.daily_report_id = reportId;
        }

        await fetchJson("/api/todo/items", {
          method: "POST",
          body: JSON.stringify(body),
        });

        resetForm();
        alert("追加しました");
        if (form.save_as_template) {
          nav("/todo/templates");
        } else {
          onCreated?.();
        }
      }
    } catch {
      alert(isEdit ? "編集に失敗しました" : "追加に失敗しました");
    }
  };

  // ===== 期限クイック =====
  const clearDue = () => {
    on("no_due", true); on("due_date", ""); on("due_time", "");
    dateRef.current?.blur(); timeRef.current?.blur();
  };
  const setTimeQuick = (hhmm) => {
    if (!form.due_date) on("due_date", todayLocal());
    on("no_due", false);
    on("due_time", hhmm);
    timeRef.current?.focus();
  };

  return (
    <div className="px-2 py-3 sm:px-3 md:p-4 max-w-3xl mx-auto space-y-4">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-bold">{isEdit ? "やることを編集" : "やることを追加"}</h1>
        <label className="ml-auto inline-flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="checkbox"
            checked={form.save_as_template}
            onChange={(e) => {
              const v = e.target.checked;
              on("save_as_template", v);
              if (v) on("pin_today", false);
            }}
          />
          <span>テンプレートとして保存</span>
        </label>
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
            <input ref={dateRef} type="date" className="input w-[180px] shrink-0" style={{ fontVariantNumeric: "tabular-nums" }}
              value={form.due_date} onChange={(e) => { on("due_date", e.target.value); on("no_due", false); }} disabled={form.no_due} />
            <input ref={timeRef} type="time" className="input w-[120px] shrink-0" style={{ fontVariantNumeric: "tabular-nums" }}
              value={form.due_time} onChange={(e) => { on("due_time", e.target.value); on("no_due", false); }} step={60} disabled={form.no_due} />
            <div className="flex items-center gap-2">
              <button type="button" className="px-3 py-1 rounded-md bg-blue-600 text-white hover:bg-blue-700" onClick={() => setTimeQuick("00:00")} disabled={form.no_due}>0:00</button>
              <button type="button" className="px-3 py-1 rounded-md bg-blue-600 text-white hover:bg-blue-700" onClick={() => setTimeQuick("23:59")} disabled={form.no_due}>23:59</button>
              <button type="button" className="px-3 py-1 rounded-md bg-gray-200 hover:bg-gray-300 text-gray-700" onClick={clearDue}>×</button>
            </div>
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

        <L label="タグ（カンマ/スペース区切り）">
          <input className="input" placeholder="仕事, 家, 学習 など" value={form.tags} onChange={(e) => on("tags", e.target.value)} />
        </L>
      </div>

      {/* TODO型 / 予定開始・終了 */}
      <div className="rounded-2xl border p-4 space-y-3">
        <label className="inline-flex items-center gap-2 select-none">
          <input type="checkbox" className="checkbox" checked={form.todo_flag} onChange={(e) => on("todo_flag", e.target.checked)} />
          <span>TODO型（開始ボタンなし・チェックで完了）</span>
        </label>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <L label="開始時刻（任意）">
            <input type="datetime-local" className="input" style={{ fontVariantNumeric: "tabular-nums" }}
              value={form.plan_start_local} onChange={(e) => { on("plan_start_local", e.target.value); on("no_plan_start", false); }}
              step={60} disabled={form.no_plan_start} />
            <label className="mt-2 inline-flex items-center gap-2 select-none">
              <input type="checkbox" className="checkbox" checked={form.no_plan_start}
                onChange={(e) => { const v = e.target.checked; on("no_plan_start", v); if (v) on("plan_start_local", ""); }} />
              <span>開始なし</span>
            </label>
          </L>
          <L label="終了時刻（任意）">
            <input type="datetime-local" className="input" style={{ fontVariantNumeric: "tabular-nums" }}
              value={form.plan_end_local} onChange={(e) => { on("plan_end_local", e.target.value); on("no_plan_end", false); }}
              step={60} disabled={form.no_plan_end} />
            <label className="mt-2 inline-flex items-center gap-2 select-none">
              <input type="checkbox" className="checkbox" checked={form.no_plan_end}
                onChange={(e) => { const v = e.target.checked; on("no_plan_end", v); if (v) on("plan_end_local", ""); }} />
              <span>終了なし</span>
            </label>
          </L>
        </div>
      </div>

      {/* 分類・予定/残り/単位 */}
      <div className="rounded-2xl border p-4 grid grid-cols-1 md:grid-cols-3 gap-3">
        <L label="カテゴリ">
          <input className="input" placeholder="カテゴリ（任意）" value={form.category} onChange={(e) => on("category", e.target.value)} />
        </L>
        <L label="予定 / 残り / 単位">
          <div className="flex items-center gap-2 flex-wrap md:flex-nowrap md:gap-3">
            <span className="whitespace-nowrap text-sm text-muted-foreground">予定</span>
            <input className="input w-24 md:w-28" type="number" inputMode="decimal" placeholder="例) 30" value={form.target_amount} onChange={(e) => on("target_amount", e.target.value)} />
            <span className="whitespace-nowrap text-sm text-muted-foreground">残り</span>
            <input className="input w-24 md:w-28" type="number" inputMode="decimal" placeholder="例) 10" value={form.remaining_amount} onChange={(e) => on("remaining_amount", e.target.value)} />
            <span className="whitespace-nowrap text-sm text-muted-foreground">単位</span>
            <input className="input w-28 md:w-32" placeholder="分 / 件 / 冊 など" value={form.unit} onChange={(e) => on("unit", e.target.value)} />
          </div>
        </L>
        <div aria-hidden />
      </div>

      {/* 今日に入れる（テンプレ保存時は非表示） */}
      {!isEdit && !form.save_as_template && (
        <div className="rounded-2xl border p-4">
          <label className="inline-flex items-center gap-2">
            <input id="pin_today" type="checkbox" className="checkbox" checked={form.pin_today} onChange={(e) => on("pin_today", e.target.checked)} />
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
          <button type="button" className="btn-outline" onClick={() => nav(form.save_as_template ? "/todo/templates" : "/todo/today")}>
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

// ===== util =====
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
