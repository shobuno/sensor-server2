// sensor-server/apps/todo/frontend/src/pages/TodayRunView.jsx

import { useEffect, useMemo, useState } from "react";
import { fetchJson } from "@/auth";
import useSessionState from "@todo/hooks/useSessionState.js";
import { patchItem } from "../lib/apiTodo";
import EditItemModal from "../components/EditItemModal";

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

/* ===== datetime-local 入出力（JST固定） ===== */
function isoToLocalDTInputJST(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, "0");
  const j = new Date(d.getTime() + (9 * 60 + d.getTimezoneOffset()) * 60000);
  return `${j.getFullYear()}-${pad(j.getMonth() + 1)}-${pad(j.getDate())}T${pad(j.getHours())}:${pad(
    j.getMinutes()
  )}`;
}
function localDTInputToIsoJST(v) {
  if (!v || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v)) return null;
  return `${v}:00+09:00`;
}

export default function TodayRunView() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  // ✅ 絞り込み保存/復元
  const [showDone, setShowDone] = useSessionState("todo:today:showDone", false);
  const [persistedTags, setPersistedTags] = useSessionState("todo:today:selectedTags", []);
  const [categoryFilter, setCategoryFilter] = useSessionState("todo:today:category", null);
  const tagFilter = useMemo(() => new Set(persistedTags), [persistedTags]);

  const [tick, setTick] = useState(0);
  const [scheduleTick, setScheduleTick] = useState(0);

  // 編集モーダル
  const [editing, setEditing] = useState(null); // item or null
  const closeModal = () => setEditing(null);

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

  // ====== 取得データの整形 ======
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

  // DOING があれば1秒ごとに tick を増加（見た目を更新）
  const hasDoing = useMemo(() => items.some((it) => it.status === "DOING"), [items]);
  useEffect(() => {
    if (!hasDoing) return;
    const h = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(h);
  }, [hasDoing]);

  // 予定色替え（30秒ごと）
  useEffect(() => {
    const h = setInterval(() => setScheduleTick((t) => t + 1), 30000);
    return () => clearInterval(h);
  }, []);

  // 表示用：DOING は tick を加算して表示
  const dispTotalSec = (it) => it.run_seconds + (it.status === "DOING" ? tick : 0);
  const dispTodaySec = (it) => it.today_run_seconds + (it.status === "DOING" ? tick : 0);

  // ✅ フィルタ
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

  // 並び順: DOING → 予定開始 → 期限 → 重要度 → id
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

  // ====== 操作 ======
  const start  = async (id) => { await fetchJson(`/api/todo/items/${id}/start`,  { method: "POST" }); load(); };
  const pause  = async (id) => { await fetchJson(`/api/todo/items/${id}/pause`,  { method: "POST" }); load(); };
  const finish = async (id) => { await fetchJson(`/api/todo/items/${id}/finish`, { method: "POST" }); load(); };
  const undoFinish = async (id) => { await fetchJson(`/api/todo/items/${id}/pause`, { method: "POST" }); load(); };

  // ==== インライン・フィルタ UI 用の集計 ====
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

  // ✅ フィルタの変更ハンドラ
  const onToggleTag = (t) => {
    setPersistedTags((arr) => {
      const set = new Set(arr || []);
      set.has(t) ? set.delete(t) : set.add(t);
      return Array.from(set);
    });
  };
  const onSelectCategory = (cOrNull) => setCategoryFilter(cOrNull);
  const onClearFilters = () => { setPersistedTags([]); setCategoryFilter(null); };

  // ダブルクリックでモーダル編集
  const onCardDblClick = (e, it) => {
    e.preventDefault();
    e.stopPropagation();
    setEditing(it);
  };

  // 見た目（チップ）共通関数
  const chipClass = (active) =>
    "px-2 py-1 rounded-full border text-sm shrink-0 transition-colors " +
    (active ? "bg-background" : "bg-muted text-muted-foreground");

  // ===== 振り分け（通常 vs TODO） =====
  const normalCards = sorted.filter((it) => !isTodoKind(it));
  const todoCards   = sorted.filter((it) =>  isTodoKind(it));

  // ====== モーダル保存 ======
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
        arr.map((x) =>
          x.id === values.id
            ? {
                ...x,
                title: values.title,
                due_at: values.due_at || null,
                priority: values.priority,
                category: values.category ?? null,
                tags_text: (values.tags || []).join(","),
                tags: values.tags || [],
                description: values.description ?? null,
                todo_flag: !!values.todo_flag,
                plan_start_at: values.plan_start_at || null,
                plan_end_at: values.plan_end_at || null,
                planned_amount: values.planned_amount ?? null,
                remaining_amount: values.remaining_amount ?? null,
                unit: values.unit ?? null,
              }
            : x
        )
      );
      closeModal();
    } catch (e) {
      console.error(e);
    }
  }

  return (
    <div className="px-2 py-3 sm:px-1 md:p-4 max-w-3xl mx-auto">
      {/* ヘッダ */}
      <div className="flex items-center justify-between mb-2 sm:mb-3">
        <h2 className="text-lg font-bold">今日のタスク</h2>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="checkbox"
            checked={!!showDone}
            onChange={(e) => setShowDone(e.target.checked)}
          />
          <span>完了も表示</span>
        </label>
      </div>

      {/* インライン・フィルタ（横並び・空なら非表示） */}
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

      {/* 本体 */}
      {loading ? (
        <div className="text-sm text-muted-foreground">読み込み中…</div>
      ) : normalCards.length === 0 && todoCards.length === 0 ? (
        <div className="text-sm text-muted-foreground">表示するタスクがありません。</div>
      ) : (
        <>
          {/* 通常カード */}
          {normalCards.length > 0 && (
            <div className="space-y-3">
              {normalCards.map((it) => (
                <TaskCard
                  key={it.id}
                  it={it}
                  totalSec={dispTotalSec(it)}
                  todaySec={dispTodaySec(it)}
                  onEdit={() => setEditing(it)}
                  start={start}
                  pause={pause}
                  finish={finish}
                  undoFinish={undoFinish}
                  onDbl={(e) => onCardDblClick(e, it)}
                  chipClass={chipClass}
                  onToggleTag={onToggleTag}
                  onSelectCategory={onSelectCategory}
                  categoryFilter={categoryFilter}
                  tagFilter={tagFilter}
                />
              ))}
            </div>
          )}

          {/* ===== TODO欄（下部にまとめて・シンプル表示） ===== */}
          {todoCards.length > 0 && (
            <div className="mt-6 border rounded-2xl p-2 sm:p-3">
              <div className="text-xs text-muted-foreground px-1 pb-1">TODO（チェックで完了）</div>
              <div className="space-y-2">
                {todoCards.map((it) => {
                  const isDone = String(it.status || "").toUpperCase() === "DONE";
                  return (
                    <div
                      key={it.id}
                      className={
                        "rounded-xl border p-2 sm:p-2.5 cursor-pointer bg-white " +
                        (isDone ? "opacity-70" : "")
                      }
                      onDoubleClick={(e) => onCardDblClick(e, it)}
                      title="ダブルクリックで編集"
                    >
                      <div className="flex items-center gap-2">
                        <div className="flex-1 min-w-0 flex items-center gap-2">
                          <span className={`truncate ${isDone ? "line-through" : ""}`}>{it.title}</span>
                          {it.priority && <span className="text-yellow-500 shrink-0">{"★".repeat(it.priority)}</span>}
                          <span className="text-[10px] text-white bg-slate-500 rounded px-1 py-0.5 shrink-0">TODO</span>
                        </div>

                        {/* 編集ボタン（小型） */}
                        <button
                          className="px-2 py-1.5 rounded-xl border hover:bg-gray-50 text-sm"
                          onClick={(e) => { e.stopPropagation(); setEditing(it); }}
                          title="編集"
                          aria-label="編集"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 inline-block align-[-2px]" viewBox="0 0 20 20" fill="currentColor">
                            <path d="M13.586 3a2 2 0 0 1 2.828 2.828l-.793.793-2.828-2.828.793-.793zM12.379 5.207 3 14.586V18h3.414l9.379-9.379-3.414-3.414z"/>
                          </svg>
                          <span className="ml-1 hidden sm:inline">編集</span>
                        </button>

                        {/* 完了チェック */}
                        <label
                          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border bg-background text-sm shrink-0"
                          onClick={(e) => e.stopPropagation()}
                          title="完了（TODO型）"
                        >
                          <input
                            type="checkbox"
                            checked={isDone}
                            onChange={async (e) => {
                              try {
                                await toggleDoneTodoKind(it, e.target.checked, setItems);
                              } catch {}
                            }}
                          />
                          <span className="select-none">完了</span>
                        </label>
                      </div>

                      {(it.due_at || it.due_date) && (
                        <div className="mt-1 text-xs text-muted-foreground">
                          {isOverdue(it) && (
                            <span className="mr-2 px-1.5 py-0.5 rounded bg-red-600 text-white">期限超過</span>
                          )}
                          {it.due_at
                            ? `期限: ${fmtLocal(it.due_at)}`
                            : `期限: ${fmtDate(it.due_date)} 00:00`}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      {/* ===== 編集モーダル ===== */}
      {editing && (
        <EditItemModal
          item={editing}
          onCancel={closeModal}
          onSave={saveEdit}
        />
      )}
    </div>
  );
}

/* --- 通常カード（分離） --- */
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
        {/* タイトル */}
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

        {/* 情報バッジ */}
        <div className="min-w-0 mt-1">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {(it.due_at || it.due_date) && (
              <>
                {isOverdue(it) && (
                  <span className="px-2 py-0.5 rounded-full bg-red-600 text-white">期限超過</span>
                )}
                <span className="text-muted-foreground">
                  {it.due_at
                    ? `期限: ${fmtLocal(it.due_at)}`
                    : `期限: ${fmtDate(it.due_date)} 00:00`}
                </span>
              </>
            )}
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

        {/* 右端ボタン（小型＋編集） */}
        <div className="ml-auto shrink-0 flex gap-2 row-span-2 self-end">
          <button
            className="px-2 py-1.5 rounded-xl border hover:bg-gray-50 text-sm"
            onClick={(e) => { e.stopPropagation(); onEdit(); }}
            title="編集"
            aria-label="編集"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 inline-block align-[-2px]" viewBox="0 0 20 20" fill="currentColor">
              <path d="M13.586 3a2 2 0 0 1 2.828 2.828l-.793.793-2.828-2.828.793-.793zM12.379 5.207 3 14.586V18h3.414l9.379-9.379-3.414-3.414z"/>
            </svg>
            <span className="ml-1 hidden sm:inline">編集</span>
          </button>

          {it.status === "DOING" ? (
            <>
              <button
                className="px-3 py-1.5 rounded-xl font-medium border shadow-sm bg-white text-gray-900 border-gray-300 hover:bg-gray-50 active:scale-[0.99] text-sm"
                onClick={(e) => { e.stopPropagation(); pause(it.id); }}
                aria-label="一時停止"
              >
                一時停止
              </button>
              <button
                className="px-3 py-1.5 rounded-xl font-medium border shadow-sm bg-red-600 text-white border-red-700 hover:bg-red-700 active:scale-[0.99] text-sm"
                onClick={(e) => { e.stopPropagation(); finish(it.id); }}
                aria-label="終了"
              >
                終了
              </button>
            </>
          ) : it.status === "DONE" ? (
            <>
              <button
                className="px-3 py-1.5 rounded-xl border bg-muted/40 text-muted-foreground cursor-default text-sm"
                disabled
                aria-label="完了"
              >
                完了
              </button>
              <button
                className="px-3 py-1.5 rounded-xl font-medium border shadow-sm bg-white text-gray-900 border-gray-300 hover:bg-gray-50 active:scale-[0.99] text-sm"
                onClick={(e) => { e.stopPropagation(); undoFinish(it.id); }}
                aria-label="終了取消"
              >
                取消
              </button>
            </>
          ) : (
            <>
              <button
                className="px-3 py-1.5 rounded-xl font-medium border shadow-sm bg-emerald-600 text-white border-emerald-700 hover:bg-emerald-700 active:scale-[0.99] text-sm"
                onClick={(e) => { e.stopPropagation(); start(it.id); }}
                aria-label="開始"
              >
                開始
              </button>
              <button
                className="px-3 py-1.5 rounded-xl font-medium border shadow-sm bg-white text-gray-900 border-gray-300 hover:bg-gray-50 active:scale-[0.99] text-sm"
                onClick={(e) => { e.stopPropagation(); finish(it.id); }}
                aria-label="終了"
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
            <span className="text-muted-foreground">
              / 残: {it.remaining_amount}{it.unit ? ` ${it.unit}` : ""}
            </span>
          )}
        </div>
      </div>
    </div>
  );
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

// 予定の色判定と短い表示（通常カードのみで使用）
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
