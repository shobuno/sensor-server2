// sensor-server/apps/todo/frontend/src/pages/TodayRunView.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { fetchJson } from "@/auth";
import useSessionState from "@todo/hooks/useSessionState.js";
import { patchItem } from "../lib/apiTodo";
import EditItemModal from "../components/EditItemModal";
import CalendarWithHolidays from "../components/CalendarWithHolidays.jsx";
import Weather3Day from "../components/widgets/Weather3Day.jsx";

/* ===== TODO-kind 判定 ===== */
const isTodoKind = (item) =>
  (item?.kind && String(item.kind).toUpperCase() === "TODO") || Boolean(item?.todo_flag);

/* ===== DONE/INBOX 切替（TODO型の完了トグル用） ===== */
async function toggleDoneTodoKind(item, checked, setItems) {
  const nextStatus = checked ? "DONE" : "INBOX";
  const payload = {
    status: nextStatus,
    completed_at: checked ? new Date().toISOString() : null,
  };
  setItems((arr) => arr.map((it) => (it.id === item.id ? { ...it, ...payload } : it)));
  try {
    await patchItem(item.id, payload);
  } catch (e) {
    console.error(e);
    setItems((arr) =>
      arr.map((it) =>
        it.id === item.id ? { ...it, status: item.status, completed_at: item.completed_at ?? null } : it
      )
    );
    throw e;
  }
}

/* ---------- helpers ---------- */
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
function isDueSoonWithin24h(it) {
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  if (isOverdue(it)) return false;
  if (it?.due_at) {
    const t = new Date(it.due_at).getTime();
    return Number.isFinite(t) && t - now <= dayMs && t - now >= 0;
  }
  if (it?.due_date) {
    const t = new Date(it.due_date + "T00:00:00").getTime();
    return Number.isFinite(t) && t - now <= dayMs && t - now >= 0;
  }
  return false;
}
function fmtDate(yyyy_mm_dd) { return yyyy_mm_dd; }
function fmtLocal(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fmtDur(sec) {
  sec = Math.max(0, Math.floor(sec || 0));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
}
function nowMs() { return Date.now(); }
function ts(iso) {
  const t = new Date(iso ?? "").getTime();
  return Number.isFinite(t) ? t : null;
}
function scheduleColorClass(it) {
  const start = ts(it.plan_start_at);
  const end   = ts(it.plan_end_at);
  if (!start && !end) return "";
  const n = nowMs();
  if (start && n >= start - 10 * 60 * 1000 && n < start) return "text-amber-600";
  if (start && n >= start && (!end || n < end)) return "text-red-600 font-semibold";
  return "";
}
function fmtTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function TodayRunView() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  // 祝日クリックの詳細表示（PC/モバイル共通）
  const [holidayInfo, setHolidayInfo] = useState(null); // {date: 'YYYY-MM-DD'}

  // === 祝日カレンダー/3日予報用の状態 ===
  const today = useMemo(() => new Date(), []);
  const [viewDate, setViewDate] = useState(today);
  const viewYear  = viewDate.getFullYear();
  const viewMonth = viewDate.getMonth() + 1;
  const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  const [selectedYmd, setSelectedYmd] = useState(ymd(today));


  const [showDone, setShowDone] = useSessionState("todo:today:showDone", false);
  const [persistedTags, setPersistedTags] = useSessionState("todo:today:selectedTags", []);
  const [categoryFilter, setCategoryFilter] = useSessionState("todo:today:category", null);
  const tagFilter = useMemo(() => new Set(persistedTags), [persistedTags]);

  const [tick, setTick] = useState(0);
  const [scheduleTick, setScheduleTick] = useState(0);

  const [editing, setEditing] = useState(null);
  const closeModal = () => setEditing(null);

  const todoRef = useRef(null);

  useEffect(() => { load(); }, []);
  const load = async () => {
    setLoading(true);
    try {
      const data = await fetchJson("/api/todo/items?today=1");
      setItems(mapItems(data));
    } finally {
      setLoading(false);
    }
  };

  const toNumberOrNull = (v) => {
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const mapItems = (rows) =>
    (rows || []).map((r) => ({
      ...r,
      due_at: r.due_at ?? null,
      due_date: r.due_at ? String(r.due_at).slice(0, 10) : r.due_date ?? null,
      tags: parseTagsCsv(r.tags_text),
      run_seconds: Number(r.run_seconds || 0),
      today_run_seconds: Number(r.today_run_seconds || 0),
      remaining_amount: toNumberOrNull(r.remaining_amount),
      planned_amount: toNumberOrNull(r.planned_amount),
      plan_start_at: r.plan_start_at ?? null,
      plan_end_at: r.plan_end_at ?? null,
    }));

  const hasDoing = useMemo(() => items.some((it) => it.status === "DOING"), [items]);
  useEffect(() => {
    if (!hasDoing) return;
    const h = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(h);
  }, [hasDoing]);

  useEffect(() => {
    const h = setInterval(() => setScheduleTick((t) => t + 1), 30000);
    return () => clearInterval(h);
  }, []);

  const dispTotalSec = (it) => it.run_seconds + (it.status === "DOING" ? tick : 0);
  const dispTodaySec = (it) => it.today_run_seconds + (it.status === "DOING" ? tick : 0);

  const filtered = useMemo(() => {
    return items.filter((it) => {
      if (!showDone && it.status === "DONE") return false;
      if (categoryFilter && it.category !== categoryFilter) return false;
      if (tagFilter.size > 0) {
        const tags = new Set(it.tags || []);
        for (const t of tagFilter) if (!tags.has(t)) return false;
      }
      return true;
    });
  }, [items, showDone, tagFilter, categoryFilter, scheduleTick]);

  const sorted = useMemo(() => {
    const statusRank = (it) => (it.status === "DOING" ? 0 : 1);
    const tsOr = (iso, fallback) => {
      const t = iso ? new Date(iso).getTime() : NaN;
      return Number.isFinite(t) ? t : fallback;
    };
    const dueTs = (it) => {
      if (it.due_at) return tsOr(it.due_at, Infinity);
      if (it.due_date) return tsOr(it.due_date + "T00:00:00", Infinity);
      return Infinity;
    };
    const planStartTs = (it) => tsOr(it.plan_start_at, Infinity);

    return [...filtered].sort((a, b) => {
      const sa = statusRank(a);
      const sb = statusRank(b);
      if (sa !== sb) return sa - sb;
      const ap = planStartTs(a);
      const bp = planStartTs(b);
      if (ap !== bp) return ap - bp;
      const ad = dueTs(a);
      const bd = dueTs(b);
      if (ad !== bd) return ad - bd;
      const apv = a.priority ?? 0;
      const bpv = b.priority ?? 0;
      if (apv !== bpv) return bpv - apv;
      return a.id - b.id;
    });
  }, [filtered]);

  const start  = async (id) => { await fetchJson(`/api/todo/items/${id}/start`,  { method: "POST" }); load(); };
  const pause  = async (id) => { await fetchJson(`/api/todo/items/${id}/pause`,  { method: "POST" }); load(); };
  const finish = async (id) => { await fetchJson(`/api/todo/items/${id}/finish`, { method: "POST" }); load(); };
  const undoFinish = async (id) => { await fetchJson(`/api/todo/items/${id}/pause`, { method: "POST" }); load(); };

  const visibleForFilter = useMemo(
    () => items.filter((it) => showDone || it.status !== "DONE"),
    [items, showDone]
  );

  const tagCounts = useMemo(() => {
    const m = new Map();
    for (const it of visibleForFilter) for (const t of it.tags || []) {
      m.set(t, (m.get(t) || 0) + 1);
    }
    return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [visibleForFilter]);

  const categoryCounts = useMemo(() => {
    const m = new Map();
    for (const it of visibleForFilter) {
      if (it.category) m.set(it.category, (m.get(it.category) || 0) + 1);
    }
    return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [visibleForFilter]);

  const onToggleTag = (t) => {
    setPersistedTags((arr) => {
      const set = new Set(arr || []);
      set.has(t) ? set.delete(t) : set.add(t);
      return Array.from(set);
    });
  };
  const onSelectCategory = (cOrNull) => setCategoryFilter(cOrNull);
  const onClearFilters = () => { setPersistedTags([]); setCategoryFilter(null); };

  const onCardDblClick = (e, it) => {
    e.preventDefault();
    e.stopPropagation();
    setEditing(it);
  };

  const chipClass = (active) =>
    "px-2 py-1 rounded-full border text-sm shrink-0 transition-colors " +
    (active ? "bg-background" : "bg-muted text-muted-foreground");

  const normalCards = sorted.filter((it) => !isTodoKind(it));
  const todoCards   = sorted.filter((it) =>  isTodoKind(it));

  const todoHasAny   = todoCards.length > 0;
  const todoOverdue  = todoCards.filter(isOverdue);
  const todoDueSoon  = todoCards.filter(isDueSoonWithin24h);

  async function saveEdit(values) {
    try {
      await patchItem(values.id, {
        title: values.title,
        due_at: values.due_at || null,
        priority: values.priority,
        category: values.category ?? null,
        tags_text: (values.tags || []).join(","),
        description: values.description ?? null,
        todo_flag: !!values.todo_flag,
        plan_start_at: values.plan_start_at || null,
        plan_end_at: values.plan_end_at || null,
        planned_amount: values.planned_amount ?? null,
        remaining_amount: values.remaining_amount ?? null,
        unit: values.unit ?? null,
      });
      setItems((arr) =>
        arr.map((x) => (x.id === values.id ? { ...x, ...values } : x))
      );
      closeModal();
    } catch (e) {
      console.error(e);
    }
  }

  const scrollToTop = () => {
    try { window.scrollTo({ top: 0, behavior: "smooth" }); }
    catch { window.scrollTo(0, 0); }
  };
  const scrollToTodo = () => {
    const el = document.getElementById("todo-panel") || todoRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const y = rect.top + window.pageYOffset - 8;
    try { window.scrollTo({ top: y, behavior: "smooth" }); }
    catch { window.scrollTo(0, y); }
  };

  const { topMsg, topMsgClass } = useMemo(() => {
    let msg = null;
    let cls = "";
    if (todoOverdue.length > 0) {
      msg = "期限切れのTODOがあります";
      cls = "text-red-600";
    } else if (todoDueSoon.length > 0) {
      msg = "期限が近いTODOがあります";
      cls = "text-amber-600";
    } else if (todoHasAny) {
      msg = "TODOがあります";
      cls = "text-blue-600";
    }
    return { topMsg: msg, topMsgClass: cls };
  }, [todoOverdue.length, todoDueSoon.length, todoHasAny]);

  return (
    <div className="px-2 py-3 sm:px-1 md:p-4 max-w-6xl mx-auto">
      {/* ヘッダ */}
      <div className="flex items-start justify-between mb-2 sm:mb-3">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-bold">今日のタスク</h2>
          {topMsg && (
            <div className="text-sm text-muted-foreground">
              <span className="hidden sm:inline">・{topMsg}</span>
              <span className="sm:hidden">
                <button className={`underline underline-offset-2 ${topMsgClass}`} onClick={scrollToTodo}>
                  {topMsg}
                </button>
              </span>
            </div>
          )}
        </div>
        <label className="flex items-center gap-2 text-sm select-none">
          <input type="checkbox" className="checkbox" checked={!!showDone} onChange={(e) => setShowDone(e.target.checked)} />
          <span>完了も表示</span>
        </label>
      </div>

      {/* インライン・フィルタ（タグ・カテゴリ） */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 mb-3">
        {tagCounts.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm text-muted-foreground">タグ:</span>
            {tagCounts.map(([t, cnt]) => (
              <button
                key={t}
                type="button"
                onClick={() => onToggleTag(t)}
                className={chipClass(tagFilter.has(t))}
              >
                #{t} <span className="opacity-60">({cnt})</span>
              </button>
            ))}
          </div>
        )}

        {categoryCounts.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm text-muted-foreground">カテゴリ:</span>
            {categoryCounts.map(([c, cnt]) => (
              <button
                key={c}
                type="button"
                onClick={() => onSelectCategory(categoryFilter === c ? null : c)}
                className={chipClass(categoryFilter === c)}
              >
                {c} <span className="opacity-60">({cnt})</span>
              </button>
            ))}
          </div>
        )}

        {(tagCounts.length > 0 || categoryCounts.length > 0) &&
          (persistedTags.length > 0 || categoryFilter) && (
            <button
              className="ml-auto text-xs text-blue-600 underline hover:no-underline"
              onClick={onClearFilters}
            >
              クリア
            </button>
          )}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-4">
        {/* 左：通常カード */}
        <div>
          {normalCards.map((it) => (
            <TaskCard key={it.id} it={it} totalSec={dispTotalSec(it)} todaySec={dispTodaySec(it)}
              onEdit={() => setEditing(it)} start={start} pause={pause} finish={finish} undoFinish={undoFinish}
              onDbl={(e) => onCardDblClick(e, it)} chipClass={chipClass} onToggleTag={onToggleTag}
              onSelectCategory={onSelectCategory} categoryFilter={categoryFilter} tagFilter={tagFilter} />
          ))}

          {/* モバイル：TODO＋ウィジェット */}
          <div id="todo-panel" ref={todoRef} className="lg:hidden mt-6 rounded-2xl p-2 sm:p-3 border border-sky-200 bg-sky-50">
            <div className="px-1 pb-1 font-bold text-sm md:text-base flex items-center justify-between">
              <span>TODO（チェックで完了）</span>
              <button className="text-xs underline text-blue-700" onClick={scrollToTop}>上へ戻る</button>
            </div>
            <div className="space-y-2">
              {todoCards.length === 0 ? (
                <div className="text-xs text-muted-foreground border rounded-md p-2 bg-white">TODOはありません</div>
              ) : (
                todoCards.map((it) => {
                  const isDone = String(it.status || "").toUpperCase() === "DONE";
                  return (
                    <div
                      key={it.id}
                      className={"rounded-xl border p-2 sm:p-2.5 cursor-pointer bg-white " + (isDone ? "opacity-70" : "")}
                      onDoubleClick={(e) => { e.preventDefault(); e.stopPropagation(); setEditing(it); }}
                      title="ダブルクリックで編集"
                    >
                      <div className="flex items-center gap-2">
                        <div className="flex-1 min-w-0 truncate">
                          <span className={isDone ? "line-through" : ""}>{it.title}</span>
                          {it.priority && <span className="ml-1 text-yellow-500">{"★".repeat(it.priority)}</span>}
                        </div>

                        <button
                          className="px-2 py-1 rounded-lg border hover:bg-gray-50 text-xs sm:text-sm"
                          onClick={(e) => { e.stopPropagation(); setEditing(it); }}
                          title="編集"
                          aria-label="編集"
                        >
                          編集
                        </button>

                        <label
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border bg-background text-xs sm:text-sm"
                          onClick={(e) => e.stopPropagation()}
                          title="完了（TODO型）"
                        >
                          <input
                            type="checkbox"
                            checked={isDone}
                            onChange={async (e) => {
                              try { await toggleDoneTodoKind(it, e.target.checked, setItems); } catch {}
                            }}
                          />
                          <span className="select-none">完了</span>
                        </label>
                      </div>

                      {(it.due_at || it.due_date) && (
                        <div className="mt-1 text-xs text-muted-foreground">
                          {isOverdue(it) && <span className="mr-2 px-1.5 py-0.5 rounded bg-red-600 text-white">期限超過</span>}
                          {it.due_at ? `期限: ${fmtLocal(it.due_at)}` : `期限: ${fmtDate(it.due_date)} 00:00`}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* 祝日つきミニカレンダー（モバイル側） */}
            <CalendarWithHolidays
              onSelect={(d, meta)=>{
                setSelectedYmd?.(d);
                setHolidayInfo({ date: d, ...meta });
              }}
              className="mt-3"
            />
            {holidayInfo && (
              <div className="mt-2 rounded-xl border bg-white p-2 text-sm">
                <div className="font-semibold">{holidayInfo.date}</div>
                {holidayInfo.isHoliday && (
                  <div className="mt-0.5 text-rose-700">祝日: {holidayInfo.name}</div>
                )}
              </div>
            )}
            {/* 3日予報 */}
            <Weather3Day className="mt-3" />
          </div>
        </div>

        {/* PC：TODO＋ウィジェット */}
          <aside
            id="todo-panel"
            ref={todoRef}
            className="hidden lg:block sticky top-20 self-start rounded-2xl p-3 border border-slate-200 bg-white"
          >
          <div className="pb-2 font-bold">TODO（チェックで完了）</div>
          <div className="space-y-2">
            {todoCards.length === 0 ? (
              <div className="text-xs text-muted-foreground border rounded-md p-2 bg-white">TODOはありません</div>
            ) : (
              todoCards.map((it) => {
                const isDone = String(it.status || "").toUpperCase() === "DONE";
                return (
                  <div
                    key={it.id}
                    className={"rounded-xl border p-2 bg-white " + (isDone ? "opacity-70" : "")}
                    onDoubleClick={(e) => { e.preventDefault(); e.stopPropagation(); setEditing(it); }}
                    title="ダブルクリックで編集"
                  >
                    <div className="flex items-center gap-2">
                      <div className="flex-1 min-w-0 truncate">
                        <span className={isDone ? "line-through" : ""}>{it.title}</span>
                        {it.priority && <span className="ml-1 text-yellow-500">{"★".repeat(it.priority)}</span>}
                      </div>

                      <button
                        className="px-2 py-1 rounded-lg border hover:bg-gray-50 text-xs"
                        onClick={(e) => { e.stopPropagation(); setEditing(it); }}
                        title="編集"
                      >
                        編集
                      </button>

                      <label
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border bg-background text-xs"
                        onClick={(e) => e.stopPropagation()}
                        title="完了（TODO型）"
                      >
                        <input
                          type="checkbox"
                          checked={isDone}
                          onChange={async (e) => {
                            try { await toggleDoneTodoKind(it, e.target.checked, setItems); } catch {}
                          }}
                        />
                        <span className="select-none">完了</span>
                      </label>
                    </div>

                    {(it.due_at || it.due_date) && (
                      <div className="mt-1 text-[11px] text-muted-foreground">
                        {isOverdue(it) && <span className="mr-2 px-1.5 py-0.5 rounded bg-red-600 text-white">期限超過</span>}
                        {it.due_at ? `期限: ${fmtLocal(it.due_at)}` : `期限: ${fmtDate(it.due_date)} 00:00`}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* 祝日つきミニカレンダー */}
          <CalendarWithHolidays
            year={viewYear}
            month={viewMonth}
            onSelect={(d, meta) => {
              setSelectedYmd(d);
              setHolidayInfo({ date: d, ...meta }); // 祝日情報も保持
            }}
            selectedYmd={selectedYmd}
            className="mt-3"
          />
          {holidayInfo && (
            <div className="mt-2 rounded-xl border bg-white p-2 text-sm">
              <div className="font-semibold">{holidayInfo.date}</div>
              {holidayInfo.isHoliday && (
                <div className="mt-0.5 text-rose-700">祝日: {holidayInfo.name}</div>
              )}
            </div>
          )}
          {/* 3日予報 */}
          <Weather3Day className="mt-3" />
        </aside>
      </div>

      {editing && <EditItemModal item={editing} onCancel={closeModal} onSave={saveEdit} />}
    </div>
  );

}

/* --- 通常カード --- */
function TaskCard({
  it, totalSec, todaySec, onEdit, start, pause, finish, undoFinish, onDbl,
  chipClass, onToggleTag, onSelectCategory, categoryFilter, tagFilter
}) {
  return (
    <div
      className={
        "rounded-xl border p-2 sm:p-3 cursor-pointer " +
        (it.status === "DOING"
          ? "bg-yellow-50 border-yellow-200"
          : it.status === "DONE"
          ? "bg-gray-100 text-gray-700"
          : "")
      }
      role="button"
      tabIndex={0}
      onDoubleClick={onDbl}
      onKeyDown={(e) => { if (e.key === "Enter") onEdit(); }}
      title="ダブルクリックで編集"
    >
      <div className="grid grid-cols-[1fr_auto] gap-x-3">
        {/* タイトル＋予定時間 */}
        <div className="col-span-2">
          <div className="font-semibold text-base break-words flex items-center gap-2">
            {(it.plan_start_at || it.plan_end_at) && (
              <span className={scheduleColorClass(it)}>
                {it.plan_start_at ? fmtTime(it.plan_start_at) : ""}
                {it.plan_end_at ? `〜${fmtTime(it.plan_end_at)}` : ""}
              </span>
            )}
            <span>{it.title}</span>
            {it.priority && <span className="text-yellow-500">{"★".repeat(it.priority)}</span>}
          </div>
        </div>

        {/* 情報バッジ／タグ・カテゴリ */}
        <div className="min-w-0 mt-1">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {(it.due_at || it.due_date) && (
              <>
                {isOverdue(it) && (
                  <span className="px-2 py-0.5 rounded-full bg-red-600 text-white">期限超過</span>
                )}
                <span className="text-muted-foreground">
                  {it.due_at ? `期限: ${fmtLocal(it.due_at)}` : `期限: ${fmtDate(it.due_date)} 00:00`}
                </span>
              </>
            )}

            <div className="hidden sm:flex items-center gap-2 flex-wrap">
              {it.category && (
                <button
                  type="button"
                  onClick={() => onSelectCategory(categoryFilter === it.category ? null : it.category)}
                  className={chipClass(categoryFilter === it.category)}
                >
                  {it.category}
                </button>
              )}
              {(it.tags || []).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => onToggleTag(t)}
                  className={chipClass(tagFilter.has(t))}
                >
                  #{t}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* 右端の操作ボタン群 */}
        <div className="ml-auto shrink-0 flex gap-2 row-span-2 self-end">
          <button
            className="px-2 py-1.5 rounded-xl border hover:bg-gray-50 text-sm"
            onClick={(e) => { e.stopPropagation(); onEdit(); }}
            title="編集"
            aria-label="編集"
          >
            ✎<span className="ml-1 hidden sm:inline">編集</span>
          </button>

          {it.status === "DOING" ? (
            <>
              <button
                className="px-3 py-1.5 rounded-xl font-medium border shadow-sm bg-white text-gray-900 border-gray-300 hover:bg-gray-50 active:scale-[0.99] text-sm"
                onClick={(e) => { e.stopPropagation(); pause(it.id); }}
              >
                一時停止
              </button>
              <button
                className="px-3 py-1.5 rounded-xl font-medium border shadow-sm bg-red-600 text-white border-red-700 hover:bg-red-700 active:scale-[0.99] text-sm"
                onClick={(e) => { e.stopPropagation(); finish(it.id); }}
              >
                終了
              </button>
            </>
          ) : it.status === "DONE" ? (
            <>
              <button className="px-3 py-1.5 rounded-xl border bg-muted/40 text-muted-foreground cursor-default text-sm" disabled>
                完了
              </button>
              <button
                className="px-3 py-1.5 rounded-xl font-medium border shadow-sm bg-white text-gray-900 border-gray-300 hover:bg-gray-50 active:scale-[0.99] text-sm"
                onClick={(e) => { e.stopPropagation(); undoFinish(it.id); }}
              >
                取消
              </button>
            </>
          ) : (
            <>
              <button
                className="px-3 py-1.5 rounded-xl font-medium border shadow-sm bg-emerald-600 text-white border-emerald-700 hover:bg-emerald-700 active:scale-[0.99] text-sm"
                onClick={(e) => { e.stopPropagation(); start(it.id); }}
              >
                開始
              </button>
              <button
                className="px-3 py-1.5 rounded-xl font-medium border shadow-sm bg-white text-gray-900 border-gray-300 hover:bg-gray-50 active:scale-[0.99] text-sm"
                onClick={(e) => { e.stopPropagation(); finish(it.id); }}
              >
                終了
              </button>
            </>
          )}
        </div>

        {/* 稼働時間 */}
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs self-start">
          <span className="inline-flex items-center px-2 py-0.5 rounded-full border bg-background">
            累計: {fmtDur(totalSec)}
          </span>
          <span className="px-2 py-0.5 rounded-full border bg-background">
            本日: {fmtDur(todaySec)}
          </span>
          {Number.isFinite(it.remaining_amount) && it.remaining_amount > 0 && (
            <span className="text-muted-foreground hidden sm:inline">
              / 残: {it.remaining_amount}{it.unit ? ` ${it.unit}` : ""}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}