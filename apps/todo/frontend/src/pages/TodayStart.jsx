// server/apps/todo/frontend/src/pages/TodayStart.jsx
import { useEffect, useMemo, useState, useCallback } from "react";
import {
  getDayStart, getReport, patchReport, patchItem, listTemplates,
  createTemplate, addTemplateToToday, createItem, listItems
} from "../lib/apiTodo";
import EditItemModal from "../components/EditItemModal";
import { fetchJson } from "@/auth";
import useSessionState from "@todo/hooks/useSessionState.js";

/* ====== 日付/時刻ユーティリティ ====== */
function ymdSlash(ymd) {
  if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  const [y, m, d] = ymd.split("-");
  return `${y}/${m}/${d}`;
}
function isoToYmdSlashJST(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(d);
}
function hhmmFromISOJST(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo", hour12: false, hour: "2-digit", minute: "2-digit",
  }).format(d);
}
function parseTagsCsv(csv) {
  if (!csv) return [];
  return [...new Set(String(csv).split(",").map((s) => s.trim()).filter(Boolean))];
}
function isOverdue(it) {
  const now = Date.now();
  if (it?.due_at) {
    const t = new Date(it.due_at).getTime();
    return Number.isFinite(t) && t < now;
  }
  if (it?.due_date) {
    const t = new Date(it.due_date + "T00:00:00").getTime();
    return Number.isFinite(t) && t < now;
  }
  return false;
}
const isTodoKind = (item) =>
  (item?.kind && String(item.kind).toUpperCase() === "TODO") || Boolean(item?.todo_flag);

/* ===== REPEAT: UI値 → repeat 仕様（fallback） ===== */
function buildRepeatFromValues(v = {}) {
  // values.repeat が既にあれば優先
  if (v && typeof v.repeat === "object" && v.repeat?.type) return v.repeat;

  const typeRaw =
    v.repeat_type || v.repeat_kind || v.recurrence || v.frequency || v.repeatMode || v.mode;
  const t = String(typeRaw || "").toLowerCase();
  const type =
    ["weekly","week","weeks"].includes(t) ? "weekly" :
    ["daily","day","days"].includes(t)   ? "daily"  :
    ["monthly","month","months"].includes(t) ? "monthly" :
    ["yearly","year","years","annual","annually"].includes(t) ? "yearly" :
    ["none","no","off"].includes(t) ? "none" : (t ? "weekly" : null);

  if (!type) return null;

  const num = (x, def=null) => {
    const n = Number(x); return Number.isFinite(n) ? Math.floor(n) : def;
  };
  const arrWeekdays = (input) => {
    if (!input && !Array.isArray(input)) return [];
    const raw = Array.isArray(input) ? input : String(input).split(",");
    const map = new Map([
      ["0","sun"],["7","sun"],["sun","sun"],["日","sun"],
      ["1","mon"],["mon","mon"],["月","mon"],
      ["2","tue"],["tue","tue"],["火","tue"],
      ["3","wed"],["wed","wed"],["水","wed"],
      ["4","thu"],["thu","thu"],["木","thu"],
      ["5","fri"],["fri","fri"],["金","fri"],
      ["6","sat"],["sat","sat"],["土","sat"],
    ]);
    return Array.from(new Set(
      raw.map(x => String(x).trim().toLowerCase())
         .map(x => map.get(x) ?? (map.get(String(Number(x))) ?? null))
         .filter(Boolean)
    ));
  };

  const every = num(v.interval ?? v.repeat_every ?? v.every ?? v.repeat_interval, 1);
  const weekdays = arrWeekdays(v.weekdays ?? v.byweekday ?? v.repeat_weekdays ?? v.days);
  const tz = v.timezone || "Asia/Tokyo";

  let gp = v.generate_policy ?? v.gen_policy ?? v.next_create_policy ?? v.next_create_timing;
  gp = String(gp || "").toLowerCase();
  const generate_policy =
    ["before","advance","prior","due_minus"].includes(gp) ? "before" :
    ["now","immediate","immediately","right_now","at_once"].includes(gp) ? "immediate" :
    ["same","on_due","due"].includes(gp) ? "same" : "immediate";

  const advance_days = num(v.advance_days ?? v.lead_days ?? v.before_days, 0);

  const base = {
    type,
    every,
    timezone: tz,
    window: {
      start_date: v.repeat_start ?? v.repeat_start_date ?? v.start_date ?? v.r_start ?? null,
      end_date:   v.repeat_end   ?? v.repeat_end_date   ?? v.end_date   ?? v.r_end   ?? null,
    },
    generate: { policy: generate_policy, advance_days: Math.max(0, advance_days) },
  };
  if (type === "weekly") return { ...base, weekdays: weekdays.length ? weekdays : ["mon"] };
  if (type === "daily")  return base;
  if (type === "monthly") {
    const bymonthday = num(v.bymonthday ?? v.monthday ?? v.day_of_month, null);
    return { ...base, bymonthday };
  }
  if (type === "yearly") return base;
  return { type: "none" };
}

async function toggleDoneTodoKind(item, checked, setItems) {
  const nextStatus = checked ? "DONE" : "INBOX";
  const payload = { status: nextStatus, completed_at: checked ? new Date().toISOString() : null };
  setItems((arr) => arr.map((it) => (it.id === item.id ? { ...it, ...payload } : it)));
  try {
    const body = {
      ...payload,
      // REPEAT 判定。repeat.type が none 以外なら REPEAT にする
      kind: payload.kind ?? ((payload.repeat?.type && payload.repeat.type !== "none") ? "REPEAT" : "NORMAL"),
      repeat: payload.repeat ?? { type: "none" },
      ...(Array.isArray(payload.tags) && !payload.tags_text
        ? { tags_text: payload.tags.map(String).map(s=>s.trim()).filter(Boolean).join(",") }
        : {}),
    };
    await patchItem(item.id, body);
  }
  catch (e) {
    console.error(e);
    setItems((arr) =>
      arr.map((it) =>
        it.id === item.id ? { ...it, status: item.status, completed_at: item.completed_at ?? null } : it
      )
    );
    throw e;
  }
}

const BUILD_TAG = "TS-v14";

/** 並び順: 期限（あるもの優先・昇順）→ 重要度（降順）→ id  */
function sortByDueAndPriority(items) {
  const tsOrInf = (iso) => {
    const t = iso ? new Date(iso).getTime() : NaN;
    return Number.isFinite(t) ? t : Infinity;
  };
  return [...items].sort((a, b) => {
    const ad = tsOrInf(a.due_at || (a.due_date ? `${a.due_date}T00:00:00` : null));
    const bd = tsOrInf(b.due_at || (b.due_date ? `${b.due_date}T00:00:00` : null));
    if (ad !== bd) return ad - bd;
    const ap = a.priority ?? 0, bp = b.priority ?? 0;
    if (ap !== bp) return bp - ap;
    return (a.id || 0) - (b.id || 0);
  });
}

/* ===== datetime-local 入出力（JST固定） ===== */
function isoToLocalDTInputJST(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, "0");
  const j = new Date(d.getTime() + (9 * 60 + d.getTimezoneOffset()) * 60000);
  return `${j.getFullYear()}-${pad(j.getMonth() + 1)}-${pad(j.getDate())}T${pad(j.getHours())}:${pad(j.getMinutes())}`;
}
function localDTInputToIsoJST(v) {
  if (!v || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v)) return null;
  return `${v}:00+09:00`;
}

/* ===== 期限（日付/時刻） ←→ ISO(JST) 変換 ===== */
function isoToYmdJST(iso) {
  if (!iso) return "";
  const parts = new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(iso));
  const y = parts.find((p) => p.type === "year")?.value || "";
  const m = parts.find((p) => p.type === "month")?.value || "";
  const d = parts.find((p) => p.type === "day")?.value || "";
  return `${y}-${m}-${d}`;
}
function isoToHmJST(iso) {
  if (!iso) return "";
  const parts = new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", hour12: false, hour: "2-digit", minute: "2-digit" }).formatToParts(new Date(iso));
  const hh = parts.find((p) => p.type === "hour")?.value || "00";
  const mm = parts.find((p) => p.type === "minute")?.value || "00";
  return `${hh}:${mm}`;
}
function ymdHmToIsoJST(ymd, hm) {
  if (!ymd) return null;
  const t = hm && /^\d{2}:\d{2}$/.test(hm) ? hm : "00:00";
  return `${ymd}T${t}:00+09:00`;
}
const numOrNull = (v) => (v === "" || v == null ? null : Number(v));

/* ====== 簡易トースト ====== */
function useToast() {
  const [toast, setToast] = useState(null); // {msg, id}
  const show = useCallback((msg) => {
    const id = Math.random().toString(36).slice(2);
    setToast({ msg, id });
    setTimeout(() => setToast((t) => (t && t.id === id ? null : t)), 1800);
  }, []);
  const node = toast ? (
    <div className="fixed z-[1000] left-1/2 -translate-x-1/2 bottom-6 px-3 py-2 rounded-lg shadow bg-black text-white text-sm">
      {toast.msg}
    </div>
  ) : null;
  return { show, node };
}

export default function TodayStart({ onEmptyInbox }) {
  const [loading, setLoading] = useState(true);
  const [dailyReportId, setDailyReportId] = useState(null);
  const [report, setReport] = useState(null);
  const [items, setItems] = useState([]);
  const [error, setError] = useState(null);

  // モード: normal / template / repeat
  const [kindTab, setKindTab] = useSessionState("todo:todayStart:kindTab", "normal");

  // 表示コントロール
  const [showChecked, setShowChecked] = useSessionState("todo:todayStart:showChecked", false);
  const [persistedTags, setPersistedTags] = useSessionState("todo:todayStart:selectedTags", []);
  const [categoryFilter, setCategoryFilter] = useSessionState("todo:todayStart:category", null);
  const tagFilter = useMemo(() => new Set(persistedTags), [persistedTags]);

  // 時刻入力
  const [timeInput, setTimeInput] = useState(""); // "HH:mm"
  const [saving, setSaving] = useState(false);

  // 編集モーダル
  const [editing, setEditing] = useState(null);
  const closeModal = () => setEditing(null);

  // クリック遅延（シングル vs ダブル）
  const [clickTimer, setClickTimer] = useState(null);
  const onRowClick = (it) => {
    if (clickTimer) { clearTimeout(clickTimer); setClickTimer(null); }
    const t = setTimeout(() => {
      if (kindTab === "normal") toggleCheck(it);
      setClickTimer(null);
    }, 200);
    setClickTimer(t);
  };

  // REPEAT: ルールの取り込み（編集前に差し込む）
  const ensureRepeatLoaded = useCallback(async (it) => {
    try {
      if (!it || !(it.repeat_rule_id > 0)) return it;
      if (it.repeat && it.repeat.type) return it; // 既に保持
      const rules = await fetchJson("/api/todo/repeat-rules"); // 一覧取得して該当を探す
      const ruleRow = Array.isArray(rules) ? rules.find(r => r.id === it.repeat_rule_id) : null;
      if (ruleRow?.rule) {
        return { ...it, repeat: ruleRow.rule };
      }
    } catch (e) {
      console.warn("repeat-rules load failed:", e);
    }
    return it;
  }, []);

  const onRowDoubleClick = async (e, it) => {
    e.preventDefault(); e.stopPropagation();
    if (clickTimer) { clearTimeout(clickTimer); setClickTimer(null); }
    // REPEAT は保存済みの rule を読み込んでからモーダルへ
    const withRule = (String(it.kind).toUpperCase().includes("REPEAT"))
      ? await ensureRepeatLoaded(it)
      : it;
    setEditing(withRule);
  };

  const { show: showToast, node: toastNode } = useToast();

  // 初期ロード & タブ切替時ロード
  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        if (kindTab === "template") {
          const rowsRaw = await listTemplates();
          if (!mounted) return;
          setItems(rowsRaw.map((it) => ({ ...it, tags: parseTagsCsv(it.tags_text) })));
          setReport(null); setDailyReportId(null); setTimeInput("");
        } else if (kindTab === "repeat") {
          const rowsRaw = await listItems({ item_type: "repeat_rule" });
          if (!mounted) return;
          setItems(rowsRaw.map((it) => ({ ...it, tags: parseTagsCsv(it.tags_text) })));
          setReport(null); setDailyReportId(null); setTimeInput("");
        } else {
          // normal
          const payload = await getDayStart();
          if (!mounted) return;
          const drId = payload?.daily_report_id ?? null;
          const rows = Array.isArray(payload?.items) ? payload.items : [];
          setDailyReportId(drId);
          setItems(rows.map((it) => ({
            ...it,
            due_date: it.due_at ? String(it.due_at).slice(0, 10) : it.due_date ?? null,
            tags: parseTagsCsv(it.tags_text),
            today_flag: it.daily_report_id === drId ? true : !!it.today_flag,
          })));
          if (drId) {
            try {
              const rep = await getReport(drId);
              if (mounted) {
                setReport(rep);
                setTimeInput(hhmmFromISOJST(rep?.period_start_at) || "");
              }
            } catch (e) { console.warn(e); }
          }
          if (rows.length === 0 && onEmptyInbox) onEmptyInbox();
        }

      } catch (e) {
        console.error(e);
        if (mounted) setError("読み込みに失敗しました。");
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [kindTab, onEmptyInbox]);

  // ===== 日付表示（JST） =====
  const jstDateStr = useMemo(() => {
    if (kindTab !== "normal") return "—";
    const byReportDate = ymdSlash(report?.report_date);
    if (byReportDate) return byReportDate;
    const byStartIso = isoToYmdSlashJST(report?.period_start_at);
    return byStartIso || "—";
  }, [kindTab, report?.report_date, report?.period_start_at]);

  // 入力との比較
  const dirty = useMemo(() => {
    if (kindTab !== "normal") return false;
    const base = report ? hhmmFromISOJST(report.period_start_at) : "";
    return timeInput !== base;
  }, [kindTab, timeInput, report]);

  // ===== 開始時刻保存 =====
  const saveStartTime = useCallback(async () => {
    if (kindTab !== "normal") return;
    if (!dailyReportId) return;
    if (!/^\d{2}:\d{2}$/.test(timeInput)) return;

    const ymd = report?.report_date;
    const datePart =
      ymd && /^\d{4}-\d{2}-\d{2}$/.test(ymd)
        ? ymd
        : (isoToYmdSlashJST(report?.period_start_at) || "").replaceAll("/", "-");
    if (!datePart) return;

    const iso = `${datePart}T${timeInput}:00+09:00`;

    setSaving(true);
    const prev = report;
    setReport((r) => (r ? { ...r, period_start_at: iso } : r));
    try { await patchReport(dailyReportId, { period_start_at: iso }); }
    catch (err) { console.error(err); setReport(prev); setError("開始時刻の更新に失敗しました。"); }
    finally { setSaving(false); }
  }, [kindTab, dailyReportId, timeInput, report]);

  const onKeyDownTime = useCallback((e) => {
    if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); saveStartTime(); }
  }, [saveStartTime]);

  // 新規テンプレ作成用ドラフト
  function onCreateTemplate() {
    const draft = {
      id: null, title: "新規テンプレート", priority: 3, todo_flag: false, item_type: "TEMPLATE", unit: "分",
      due_at: null, plan_start_at: null, plan_end_at: null, category: "", tags: [], description: "",
      target_amount: "", remaining_amount: "",
    };
    setEditing(draft);
  }
  // 新規 normal 作成用ドラフト
  function onCreateNormal() {
    const draft = {
      id: null, title: "新規アイテム", priority: 3, todo_flag: false, kind: "NORMAL", unit: "分",
      due_at: null, plan_start_at: null, plan_end_at: null, category: "", tags: [], description: "",
      target_amount: "", remaining_amount: "",
      today_flag: true,
    };
    setEditing(draft);
  }
  // 新規 repeat_rule 作成用ドラフト
  function onCreateRepeat() {
    const draft = {
      id: null, title: "新規・繰り返し項目", priority: 3, todo_flag: false, kind: "REPEAT", unit: "分",
      category: "", tags: [], description: "",
      // ルールは編集モーダル側で入力
    };
    setEditing(draft);
  }

  const handleCreateNew = useCallback(() => {
    if (kindTab === "template") onCreateTemplate();
    else if (kindTab === "repeat") onCreateRepeat();
    else onCreateNormal();
  }, [kindTab]);

  // ===== items の更新系 =====
  async function patchItemDailyReport(itemId, nextDrId) {
    const nextToday = !!nextDrId;
    const prev = items;
    const next = items.map((it) =>
      it.id === itemId ? { ...it, daily_report_id: nextDrId, today_flag: nextToday } : it
    );
    setItems(next);
    try { await patchItem(itemId, { daily_report_id: nextDrId, today_flag: nextToday }); }
    catch {
      setItems(prev);
      try {
        const payload = await getDayStart();
        const drId = payload?.daily_report_id ?? null;
        const rows = Array.isArray(payload?.items) ? payload.items : [];
        setDailyReportId(drId);
        setItems(rows.map((it) => ({
          ...it,
          due_date: it.due_at ? String(it.due_at).slice(0, 10) : it.due_date ?? null,
          tags: parseTagsCsv(it.tags_text),
          today_flag: it.daily_report_id === drId ? true : !!it.today_flag,
        })));
      } catch {}
      setError("一部の更新に失敗しました。もう一度お試しください。");
    }
  }
  async function toggleCheck(item) {
    if (kindTab !== "normal") return;
    if (dailyReportId == null) return;
    const checked = item.daily_report_id === dailyReportId;
    try { await patchItemDailyReport(item.id, checked ? null : dailyReportId); }
    catch { setError("更新に失敗しました。"); }
  }
  async function clearAll() {
    if (kindTab !== "normal") return;
    if (dailyReportId == null) return;
    const toDisable = items.filter((i) => i.daily_report_id === dailyReportId).map((i) => i.id);
    if (toDisable.length === 0) return;
    await Promise.all(toDisable.map((id) => patchItemDailyReport(id, null)));
  }
  async function removeItem(id) {
    if (!window.confirm("このアイテムを削除します。よろしいですか？")) return;
    try {
      await fetchJson(`/api/todo/items/${id}`, { method: "DELETE" });
      setItems((arr) => arr.filter((x) => x.id !== id));
    } catch (e) {
      console.error(e);
      setError("削除に失敗しました。");
    }
  }

  // ===== template 用操作 =====
  async function addFromTemplate(tplId) {
    try {
      await addTemplateToToday(tplId);
      showToast("今日に追加しました");
    } catch (e) {
      console.error(e);
      setError("テンプレートからの追加に失敗しました。");
    }
  }

  // ===== フィルタ・並び替え =====
  const visibleForFilter = useMemo(() => {
    if (kindTab === "template") return items;
    return items.filter((it) => showChecked || it.daily_report_id !== dailyReportId);
  }, [items, showChecked, dailyReportId, kindTab]);

  const tagCounts = useMemo(() => {
    const m = new Map();
    for (const it of visibleForFilter) for (const t of it.tags || []) m.set(t, (m.get(t) || 0) + 1);
    return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [visibleForFilter]);

  const categoryCounts = useMemo(() => {
    const m = new Map();
    for (const it of visibleForFilter) if (it.category) m.set(it.category, (m.get(it.category) || 0) + 1);
    return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [visibleForFilter]);

  const onToggleTag = (t) => {
    setPersistedTags((arr) => {
      const set = new Set(arr || []); set.has(t) ? set.delete(t) : set.add(t); return Array.from(set);
    });
  };
  const onSelectCategory = (cOrNull) => setCategoryFilter(cOrNull);
  const onClearFilters = () => { setPersistedTags([]); setCategoryFilter(null); };

  const filtered = useMemo(() => {
    return items.filter((it) => {
      if (kindTab === "normal") {
        if (!showChecked && it.daily_report_id === dailyReportId) return false;
      }
      if (categoryFilter && it.category !== categoryFilter) return false;
      if (tagFilter.size > 0) {
        const tags = new Set(it.tags || []);
        for (const t of tagFilter) if (!tags.has(t)) return false;
      }
      return true;
    });
  }, [items, kindTab, showChecked, dailyReportId, categoryFilter, tagFilter]);

  const sorted = useMemo(() => {
    return kindTab === "template"
      ? [...filtered].sort((a, b) => (a.title || "").localeCompare(b.title || ""))
      : sortByDueAndPriority(filtered);
  }, [filtered, kindTab]);

  const selectedCount = useMemo(
    () => (kindTab === "normal" ? items.filter((i) => i.daily_report_id === dailyReportId).length : 0),
    [items, dailyReportId, kindTab]
  );

  // ===== 編集保存 =====
  async function saveEdit(values) {
    const repeatSpec = buildRepeatFromValues(values); // あるなら付ける
    try {
      // 新規テンプレ
      if (values.id == null && (values.kind === "TEMPLATE" || kindTab === "template")) {
        const created = await createTemplate({
          title: values.title,
          description: values.description ?? null,
          priority: values.priority,
          due_at: values.no_due ? null : (values.due_at || null),
          plan_start_at: values.plan_start_at || null,
          plan_end_at: values.plan_end_at || null,
          category: values.category ?? null,
          unit: values.unit || "分",
          target_amount: numOrNull(values.target_amount),
          remaining_amount: numOrNull(values.remaining_amount),
          todo_flag: !!values.todo_flag,
          tags_text: (values.tags || []).join(","),
        });
        setItems((arr) => [created, ...arr]);
        closeModal();
        return;
      }

      // 新規 normal
      if (values.id == null && (values.kind === "NORMAL" || kindTab === "normal")) {
        const created = await createItem({
          title: values.title,
          description: values.description ?? null,
          priority: values.priority,
          due_at: values.no_due ? null : (values.due_at || null),
          plan_start_at: values.plan_start_at || null,
          plan_end_at: values.plan_end_at || null,
          category: values.category ?? null,
          unit: values.unit || null,
          target_amount: numOrNull(values.target_amount),
          remaining_amount: numOrNull(values.remaining_amount),
          tags_text: (values.tags || []).join(","),
          kind: "NORMAL",
          todo_flag: !!values.todo_flag,
          today_flag: values.today_flag === true ? true : false,
          daily_report_id: values.today_flag === true ? (dailyReportId ?? null) : null,
        });
        setItems((arr) => [{
          ...created,
          tags: parseTagsCsv(created.tags_text),
          today_flag: created.today_flag ?? (values.today_flag === true),
          daily_report_id: created.daily_report_id ?? (values.today_flag === true ? (dailyReportId ?? null) : null),
        }, ...arr]);
        closeModal();
        showToast("今日に追加しました");
        return;
      }

      // 新規 REPEAT
      if (values.id == null && kindTab === "repeat") {
        const payload = {
          title: values.title,
          description: values.description ?? null,
          priority: values.priority,
          category: values.category ?? null,
          unit: values.unit || null,
          target_amount: numOrNull(values.target_amount),
          remaining_amount: numOrNull(values.remaining_amount),
          tags_text: (values.tags || []).join(","),
          kind: "REPEAT",
          todo_flag: !!values.todo_flag,
          due_at: values.no_due ? null : (values.due_at || null),
          plan_start_at: values.plan_start_at || null,
          plan_end_at: values.plan_end_at || null,
        };
        if (repeatSpec && repeatSpec.type) payload.repeat = repeatSpec;
        const created = await createItem(payload);
        setItems((arr) => [{ ...created, tags: parseTagsCsv(created.tags_text) }, ...arr]);
        closeModal();
        return;
      }

      // 既存更新（NORMAL/TEMPLATE/REPEAT 共通）
      const patchPayload = {
        title: values.title,
        due_at: values.no_due ? null : values.due_at || null,
        priority: values.priority,
        category: values.category ?? null,
        tags_text: (values.tags || []).join(","),
        description: values.description ?? null,
        todo_flag: !!values.todo_flag,
        plan_start_at: values.plan_start_at || null,
        plan_end_at: values.plan_end_at || null,
        target_amount: numOrNull(values.target_amount),
        remaining_amount: numOrNull(values.remaining_amount),
        unit: (values.unit || "分"),
      };
      // REPEAT は kind/ repeat も送る（バックエンドの upsert が動作）
      const isRepeat = String(values.kind).toUpperCase() === "REPEAT";
      if (isRepeat) {
        patchPayload.kind = "REPEAT";
        if (repeatSpec && repeatSpec.type) patchPayload.repeat = repeatSpec;
      }

      await patchItem(values.id, patchPayload);
      setItems((arr) =>
        arr.map((x) =>
          x.id === values.id
            ? {
                ...x,
                title: values.title,
                due_at: values.no_due ? null : values.due_at || null,
                priority: values.priority,
                category: values.category ?? null,
                tags_text: (values.tags || []).join(","),
                tags: values.tags || [],
                description: values.description ?? null,
                todo_flag: !!values.todo_flag,
                plan_start_at: values.plan_start_at || null,
                plan_end_at: values.plan_end_at || null,
                target_amount: numOrNull(values.target_amount),
                remaining_amount: numOrNull(values.remaining_amount),
                unit: values.unit || "分",
                // 参照だけ差し替え（モーダル再オープン時の初期値用）
                ...(isRepeat && repeatSpec ? { repeat: repeatSpec } : {}),
              }
            : x
        )
      );
      closeModal();
    } catch (e) {
      console.error(e);
      setError("保存に失敗しました。");
    }
  }

  if (loading) return <div className="p-4">読み込み中…</div>;

  // ★★ ここで「0件なら早期 return」はしない（コントロールを常に表示するため） ★★

  const chipClass = (active) =>
    "px-2 py-1 rounded-full border text-sm shrink-0 transition-colors " +
    (active ? "bg-background" : "bg-muted text-muted-foreground");

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center">
        <h2 className="text-lg font-bold">今日の開始</h2>
        <span className="ml-auto text-[10px] text-gray-400">{BUILD_TAG}</span>
      </div>

      {error && <div className="bg-red-100 text-red-700 p-2 rounded">{error}</div>}

      {/* normal モードのヘッダ */}
      {kindTab === "normal" && (
        <div className="flex flex-wrap items-center gap-3 p-3 border rounded">
          <div className="text-sm text-gray-600">
            日付：<span className="font-medium">{jstDateStr}</span>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <span className="font-medium">開始時刻</span>
            <input
              type="time"
              value={timeInput}
              onChange={(e) => setTimeInput(e.target.value)}
              onKeyDown={onKeyDownTime}
              className="rounded border px-2 py-1"
            />
          </label>
          <button className="px-3 py-1 rounded border" disabled={!dirty || saving} onClick={saveStartTime}>
            {saving ? "保存中…" : "更新"}
          </button>

          <label className="ml-auto flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="checkbox"
              checked={!!showChecked}
              onChange={(e) => setShowChecked(e.target.checked)}
            />
            <span>チェック済みを表示</span>
          </label>
        </div>
      )}

      {/* タブ行 */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button className={`px-3 py-2 rounded-2xl ${kindTab==='normal' ? 'bg-black text-white' : 'bg-gray-100'}`} onClick={()=>setKindTab('normal')}>normal</button>
        <button className={`px-3 py-2 rounded-2xl ${kindTab==='template' ? 'bg-black text-white' : 'bg-gray-100'}`} onClick={()=>setKindTab('template')}>テンプレート</button>
        <button className={`px-3 py-2 rounded-2xl ${kindTab==='repeat' ? 'bg-black text-white' : 'bg-gray-100'}`} onClick={()=>setKindTab('repeat')}>繰り返し項目</button>
      </div>

      {/* 選択件数 + 新規ボタン */}
      <div className="mt-2 flex items-center justify-between">
        {kindTab === "normal" && selectedCount > 0 && <span className="text-sm text-gray-600">選択 {selectedCount}件</span>}
        <button className="px-4 py-2 rounded-lg bg-emerald-600 text-white" onClick={handleCreateNew}>新規</button>
      </div>

      {/* インライン・フィルタ */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        {(() => {
          const visibleForFilter = (kindTab === "template") ? items : items.filter((it) => showChecked || it.daily_report_id !== dailyReportId);
          const tagCounts = (() => {
            const m = new Map();
            for (const it of visibleForFilter) for (const t of it.tags || []) m.set(t, (m.get(t) || 0) + 1);
            return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0]));
          })();
          const categoryCounts = (() => {
            const m = new Map();
            for (const it of visibleForFilter) if (it.category) m.set(it.category, (m.get(it.category) || 0) + 1);
            return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0]));
          })();

          return (
            <>
              {tagCounts.length > 0 && (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm text-muted-foreground">タグ:</span>
                  {tagCounts.map(([t, cnt]) => (
                    <button key={t} type="button" onClick={() => {
                      setPersistedTags((arr) => {
                        const set = new Set(arr || []); set.has(t) ? set.delete(t) : set.add(t); return Array.from(set);
                      });
                    }} className={chipClass(new Set(persistedTags).has(t))}>
                      #{t} <span className="opacity-60">({cnt})</span>
                    </button>
                  ))}
                </div>
              )}
              {categoryCounts.length > 0 && (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm text-muted-foreground">カテゴリ:</span>
                  {categoryCounts.map(([c, cnt]) => (
                    <button key={c} type="button" onClick={() => setCategoryFilter(categoryFilter === c ? null : c)} className={chipClass(categoryFilter === c)}>
                      {c} <span className="opacity-60">({cnt})</span>
                    </button>
                  ))}
                </div>
              )}
              {(tagCounts.length > 0 || categoryCounts.length > 0) && (persistedTags.length > 0 || categoryFilter) && (
                <button className="ml-auto text-xs text-blue-600 underline hover:no-underline" onClick={() => { setPersistedTags([]); setCategoryFilter(null); }}>クリア</button>
              )}
            </>
          );
        })()}
      </div>

      {/* 操作バー（normalのみ） */}
      {kindTab === "normal" && (
        <div className="flex gap-2">
          <button className="px-3 py-1 rounded border" onClick={clearAll}>選択解除</button>
        </div>
      )}

      {/* ---- ここから本体表示 ---- */}
      {/* 0件時のメッセージ（コントロールは上に残る） */}
      {kindTab === "normal" && items.length === 0 && (
        <div className="text-sm text-gray-500 border rounded p-3">
          INBOX が空です。新しいタスクを「新規」から登録してください。
        </div>
      )}

      {/* 本体リスト */}
      {sorted.length > 0 && (
        <ul className="divide-y border rounded">
          {sorted.map((i) => {
            const checked  = kindTab === "normal" ? i.daily_report_id === dailyReportId : false;
            const overdue  = isOverdue(i);
            const isDone   = String(i.status || "").toUpperCase() === "DONE";
            const todoKind = isTodoKind(i);

            /* ===== テンプレート表示 ===== */
            if (kindTab === "template") {
              return (
                <li key={i.id} className="p-2 sm:p-2">
                  <div className="flex items-center gap-2 min-w-0">
                    {i.todo_flag && (
                      <span className="text-[10px] text-white bg-slate-500 rounded px-1 py-0.5 shrink-0">TODO</span>
                    )}
                    <div className="font-medium text-base leading-tight truncate flex-1">{i.title}</div>
                  </div>
                  <div className="mt-1 flex justify-end items-center gap-2">
                    <button
                      className="h-8 px-3 text-xs rounded border bg-emerald-600 text-white border-emerald-700 hover:bg-emerald-700"
                      onClick={(e) => { e.stopPropagation(); addFromTemplate(i.id); }}
                    >今日に追加</button>
                    <button
                      className="h-8 w-8 grid place-items-center rounded border hover:bg-gray-50"
                      onClick={(e) => { e.stopPropagation(); setEditing(i); }}
                      title="編集" aria-label="編集"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                        <path d="M13.586 3a2 2 0 0 1 2.828 2.828l-.793.793-2.828-2.828.793-.793zM12.379 5.207 3 14.586V18h3.414l9.379-9.379-3.414-3.414z"/>
                      </svg>
                    </button>
                    <button
                      className="h-8 px-3 text-xs rounded border text-red-600 border-red-600 hover:bg-red-50"
                      onClick={(e) => { e.stopPropagation(); removeItem(i.id); }}
                    >削除</button>
                  </div>
                </li>
              );
            }

            /* ===== normal / repeat 表示 ===== */
            return (
              <li
                key={i.id}
                className="p-3 hover:bg-muted/30 cursor-pointer"
                onClick={() => onRowClick(i)}
                onDoubleClick={(e) => onRowDoubleClick(e, i)}
              >
                <div className="grid grid-cols-[auto_1fr] sm:grid-cols-[auto_1fr_auto] gap-3 items-start">
                  {/* 左: チェック（normal のみ） */}
                  {kindTab === "normal" ? (
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleCheck(i)}
                      onClick={(e) => e.stopPropagation()}
                      aria-label="今日に入れる"
                      title="今日に入れる"
                      className="mt-1"
                    />
                  ) : (
                    <div className="mt-1 w-4 h-4" aria-hidden />
                  )}

                  {/* 中: タイトル＋メタ */}
                  <div className={`min-w-0 ${todoKind && isDone ? "opacity-60 line-through" : ""}`}>
                    <div className="font-medium text-base leading-snug break-words flex items-center gap-2 min-w-0">
                      {todoKind && (
                        <span className="text-[10px] text-white bg-slate-500 rounded px-1 py-0.5 shrink-0">TODO</span>
                      )}
                      <span className="truncate">{i.title}</span>
                    </div>
                    <div className="mt-1 text-xs text-gray-500 flex flex-wrap items-center gap-2">
                      {i.priority && <span className="hidden sm:inline text-yellow-500">{"★".repeat(i.priority)}</span>}
                      {overdue && <span className="px-1.5 py-0.5 rounded bg-red-600 text-white">期限超過</span>}
                      {(i.due_at || i.due_date) && (
                        <span className="text-muted-foreground">
                          {i.due_at ? `期限: ${fmtLocal(i.due_at)}` : `期限: ${i.due_date} 00:00`}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* 右: 操作 */}
                  <div className="col-span-2 sm:col-span-1 sm:justify-self-end mt-2 sm:mt-0 items-center gap-2 hidden sm:flex">
                    {kindTab === "normal" && isTodoKind(i) && (
                      <label className="inline-flex items-center gap-1 text-xs select-none" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isDone}
                          onChange={async (e) => {
                            try { await toggleDoneTodoKind(i, e.target.checked, setItems); }
                            catch { setError("完了状態の更新に失敗しました。"); }
                          }}
                        />
                        <span>完了</span>
                      </label>
                    )}
                    <button className="px-2 py-1 text-xs rounded border hover:bg-gray-50" onClick={async (e) => {
                      e.stopPropagation();
                      const withRule = (String(i.kind).toUpperCase().includes("REPEAT"))
                        ? await ensureRepeatLoaded(i)
                        : i;
                      setEditing(withRule);
                    }}>編集</button>
                    <button className="px-2 py-1 text-xs rounded border text-red-600 border-red-600 hover:bg-red-50" onClick={(e) => { e.stopPropagation(); removeItem(i.id); }}>削除</button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {editing && (
        <EditItemModal
          item={editing}
          onCancel={closeModal}
          onSave={saveEdit}
          onDelete={async (id) => { try { await removeItem(id); } finally { closeModal(); } }}
          defaultUnit="分"
        />
      )}

      {toastNode}
    </div>
  );
}

/* ---------- 小物 ---------- */
function fmtLocal(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
