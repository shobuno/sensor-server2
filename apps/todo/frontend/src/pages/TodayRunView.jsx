// sensor-server/apps/todo/frontend/src/pages/TodayRunView.jsx

import { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { fetchJson } from "@/auth";
import TagCategoryFilter from "@todo/components/TagCategoryFilter.jsx";
import useSessionState from "@todo/hooks/useSessionState.js";

export default function TodayRunView() {
  const nav = useNavigate();

  // 「追加」タブを“編集モード”で開く
  const goEdit = useCallback((itemOrId) => {
    const id = typeof itemOrId === "object" ? itemOrId.id : itemOrId;
    nav(`/todo?tab=add&edit=${id}`);
  }, [nav]);

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  // ✅ 絞り込み保存/復元
  const [showDone, setShowDone] = useSessionState("todo:today:showDone", false);
  const [persistedTags, setPersistedTags] = useSessionState("todo:today:selectedTags", []);
  const [categoryFilter, setCategoryFilter] = useSessionState("todo:today:category", null);
  const tagFilter = useMemo(() => new Set(persistedTags), [persistedTags]);

  const [tick, setTick] = useState(0);
  const [scheduleTick, setScheduleTick] = useState(0);

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
      plan_start_at: r.plan_start_at ?? null,
      plan_end_at: r.plan_end_at ?? null,
    }));

  // DOING があれば1秒ごとに tick を増加（見た目だけ更新）
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

  // 表示用の時間フォーマット
  const fmtDur = (sec) => {
    sec = Math.max(0, Math.floor(sec || 0));
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    return h > 0
      ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
      : `${m}:${String(s).padStart(2, "0")}`;
  };
  const dispTotalSec = (it) => it.run_seconds + (it.status === "DOING" ? tick : 0);
  const dispTodaySec = (it) => it.today_run_seconds + (it.status === "DOING" ? tick : 0);

  // ✅ フィルタ
  const filtered = useMemo(() => {
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
  const onToggleShowDone = (checked) => setShowDone(checked);

  // dblclick はここで完結させる
  const onCardDblClick = (e, it) => {
    e.preventDefault();
    e.stopPropagation();
    goEdit(it);
  };

  // 見た目（チップ）共通関数
  const chipClass = (active) =>
    "px-2 py-1 rounded-full border text-sm shrink-0 transition-colors " +
    (active ? "bg-background" : "bg-muted text-muted-foreground");

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
            onChange={(e) => onToggleShowDone(e.target.checked)}
          />
          <span>完了も表示</span>
        </label>
      </div>

      {/* 共通フィルタ */}
      <TagCategoryFilter
        items={items}
        showDone={!!showDone}
        selectedTags={persistedTags}
        selectedCategory={categoryFilter}
        onToggleTag={onToggleTag}
        onSelectCategory={onSelectCategory}
        onClear={onClearFilters}
        chipClass={chipClass}
      />

      {/* 本体 */}
      {loading ? (
        <div className="text-sm text-muted-foreground">読み込み中…</div>
      ) : sorted.length === 0 ? (
        <div className="text-sm text-muted-foreground">表示するタスクがありません。</div>
      ) : (
        <div className="space-y-3">
          {sorted.map((it) => (
            <div
              key={it.id}
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
              onDoubleClick={(e) => onCardDblClick(e, it)}
              onKeyDown={(e) => { if (e.key === "Enter") goEdit(it); }}
              title="ダブルクリックで編集"
            >
              {/* ===== Grid レイアウト =====
                  col1: 本文（可変）
                  col2: ボタン（固定幅、下にくっつく）
                  row1: タイトル（col-span-2）
                  row2: 情報バッジ（左） + ボタン（右・self-end, row-span-2）
                  row3: 稼働時間（左）
               */}
              <div className="grid grid-cols-[1fr_auto] gap-x-3">
                {/* row1: タイトル = 全幅 */}
                <div className="col-span-2">
                  <div className="font-semibold text-base break-words flex items-center gap-2">
                    {(it.plan_start_at || it.plan_end_at) && (
                      <span className={scheduleColorClass(it)}>
                        {it.plan_start_at ? fmtTime(it.plan_start_at) : ""}
                        {it.plan_end_at ? `〜${fmtTime(it.plan_end_at)}` : ""}
                      </span>
                    )}
                    <span>{it.title}</span>
                    {it.priority && (
                      <span className="text-yellow-500">
                        {"★".repeat(it.priority)}
                      </span>
                    )}
                  </div>
                </div>

                {/* row2: 情報バッジ（左） */}
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

                {/* row2〜3 をまたぐ：右端・縦2段ボタン（下に吸着） */}
                <div className="ml-auto w-28 sm:w-32 shrink-0 flex flex-col gap-2 row-span-2 self-end">
                  {it.status === "DOING" ? (
                    <>
                      <button
                        className="w-full py-2.5 rounded-xl font-semibold border shadow-sm bg-white text-gray-900 border-gray-300 hover:bg-gray-50 active:scale-[0.99]"
                        onClick={(e) => { e.stopPropagation(); pause(it.id); }}
                        aria-label="一時停止"
                      >
                        一時停止
                      </button>
                      <button
                        className="w-full py-2.5 rounded-xl font-semibold border shadow-sm bg-red-600 text-white border-red-700 hover:bg-red-700 active:scale-[0.99]"
                        onClick={(e) => { e.stopPropagation(); finish(it.id); }}
                        aria-label="終了"
                      >
                        終了
                      </button>
                    </>
                  ) : it.status === "DONE" ? (
                    <>
                      <button
                        className="w-full py-2.5 rounded-xl border bg-muted/40 text-muted-foreground cursor-default"
                        disabled
                        aria-label="完了"
                      >
                        完了
                      </button>
                      <button
                        className="w-full py-2.5 rounded-xl font-semibold border shadow-sm bg-white text-gray-900 border-gray-300 hover:bg-gray-50 active:scale-[0.99]"
                        onClick={(e) => { e.stopPropagation(); undoFinish(it.id); }}
                        aria-label="終了取消"
                      >
                        取消
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        className="w-full py-2.5 rounded-xl font-semibold border shadow-sm bg-emerald-600 text-white border-emerald-700 hover:bg-emerald-700 active:scale-[0.99]"
                        onClick={(e) => { e.stopPropagation(); start(it.id); }}
                        aria-label="開始"
                      >
                        開始
                      </button>
                      <button
                        className="w-full py-2.5 rounded-xl font-semibold border shadow-sm bg-white text-gray-900 border-gray-300 hover:bg-gray-50 active:scale-[0.99]"
                        onClick={(e) => { e.stopPropagation(); finish(it.id); }}
                        aria-label="終了"
                      >
                        終了
                      </button>
                    </>
                  )}
                </div>

                {/* row3: 稼働時間（左） */}
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs self-start">
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full border bg-background">
                    累計: {fmtDur(dispTotalSec(it))}
                  </span>
                  <span className="px-2 py-0.5 rounded-full border bg-background">
                    本日: {fmtDur(dispTodaySec(it))}
                  </span>
                  {Number.isFinite(it.remaining_amount) && it.remaining_amount > 0 && (
                    <span className="text-muted-foreground">
                      / 残: {it.remaining_amount}{it.unit ? ` ${it.unit}` : ""}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
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

// ★ 追加: 予定の色判定と短い表示
function nowMs() { return Date.now(); }
function ts(iso) {
  const t = new Date(iso ?? "").getTime();
  return Number.isFinite(t) ? t : null;
}
/** 開始10分前〜直前: amber、開始〜終了: red、終了後/未設定: 通常 */
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
