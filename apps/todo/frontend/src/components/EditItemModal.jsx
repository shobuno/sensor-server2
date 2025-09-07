// sensor-server/apps/todo/frontend/src/components/EditItemModal.jsx
import { useState } from "react";

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
const numOrNull = (v) => (v === "" || v == null ? null : Number(v));

/**
 * 共通編集モーダル（モバイル=全画面、PC=通常モーダル）
 * props:
 * - item: 既存 or 新規ドラフト { id|null, kind?, ... }
 * - onCancel(): void
 * - onSave(values): void
 * - onDelete?(id): void   ← 省略可。渡すとフッター左に「削除」ボタン表示
 * - defaultUnit: 新規時の単位初期値（例: "分"）
 */
export default function EditItemModal({ item, onCancel, onSave, onDelete, defaultUnit = "" }) {
  // 基本
  const [title, setTitle] = useState(item?.title || "");
  const [priority, setPriority] = useState(item?.priority ?? 3);
  const [category, setCategory] = useState(item?.category ?? "");
  const [tags, setTags] = useState(item?.tags || []);
  const [description, setDescription] = useState(item?.description ?? "");
  const [todoFlag, setTodoFlag] = useState(Boolean(item?.todo_flag));
  const kindStr = item?.kind ? String(item.kind).toUpperCase() : "";

  // 期限（開始/終了と同じ UI に統一）
  const [noDue, setNoDue] = useState(!item?.due_at);
  const [dueLocal, setDueLocal] = useState(isoToLocalDTInputJST(item?.due_at));

  // 予定開始/終了
  const [noStart, setNoStart] = useState(!item?.plan_start_at);
  const [noEnd, setNoEnd] = useState(!item?.plan_end_at);
  const [planStartLocal, setPlanStartLocal] = useState(isoToLocalDTInputJST(item?.plan_start_at));
  const [planEndLocal, setPlanEndLocal] = useState(isoToLocalDTInputJST(item?.plan_end_at));

  // 予定量/残量/単位（互換のため planned と target に同値を返す）
  const initPlanned = item?.planned_amount ?? item?.target_amount ?? "";
  const [plannedAmount, setPlannedAmount] = useState(initPlanned === null ? "" : initPlanned);
  const [remainingAmount, setRemainingAmount] = useState(
    item?.remaining_amount === null ? "" : (item?.remaining_amount ?? "")
  );
  const [unit, setUnit] = useState(item?.unit ?? defaultUnit);

  // タグ入力
  const [tagInput, setTagInput] = useState("");
  const addTag = () => {
    const t = tagInput.trim();
    if (!t) return;
    setTags((arr) => (arr.includes(t) ? arr : [...arr, t]));
    setTagInput("");
  };
  const removeTag = (t) => setTags((arr) => arr.filter((x) => x !== t));

  return (
    <div className="fixed inset-0 z-50 overflow-hidden" onClick={onCancel}>
      {/* 背景 */}
      <div className="absolute inset-0 bg-black/40" />

      {/* コンテナ：モバイル=全画面、PC=中央モーダル */}
      <div
        className="absolute inset-0 flex items-center justify-center p-0 sm:p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="
            bg-white shadow-xl flex flex-col overflow-hidden
            w-screen h-[100svh] rounded-none
            sm:w-[min(760px,96vw)] sm:h-auto sm:max-h-[min(88svh,720px)] sm:rounded-2xl
          "
        >
          {/* ヘッダー（固定） */}
          <div className="px-4 pt-4 pb-3 border-b bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/70">
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-semibold">アイテムを編集</h3>
              {kindStr && (
                <span className="ml-1 text-[11px] px-2 py-0.5 rounded-full border bg-muted text-muted-foreground">
                  kind: {kindStr}
                </span>
              )}
              {todoFlag && <span className="text-[10px] px-2 py-0.5 rounded bg-slate-600 text-white">TODO</span>}
              <button className="ml-auto text-sm text-gray-500" onClick={onCancel}>閉じる</button>
            </div>
          </div>

          {/* 本体（縦スクロールのみ） */}
          <div className="flex-1 overflow-y-auto overflow-x-hidden px-4 py-3 space-y-3">
            {/* TODO型トグル */}
            <label className="flex items-center gap-2 text-sm border rounded p-2">
              <input type="checkbox" checked={todoFlag} onChange={(e) => setTodoFlag(e.target.checked)} />
              <span>TODO型（開始ボタンなし・チェックで完了）</span>
            </label>

            {/* タイトル */}
            <label className="block text-sm">
              <span className="text-gray-600">タイトル</span>
              <input
                className="mt-1 w-full rounded border px-2 py-1"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </label>

            {/* 期限（開始/終了と同じ UI）＋優先度 */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="text-sm">
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={noDue} onChange={(e) => setNoDue(e.target.checked)} />
                  <span className="text-gray-600">期限なし</span>
                </label>
                <input
                  type="datetime-local"
                  disabled={noDue}
                  className="mt-1 w-full rounded border px-2 py-1"
                  value={noDue ? "" : dueLocal}
                  onChange={(e) => setDueLocal(e.target.value)}
                />
              </div>
              <label className="block text-sm">
                <span className="text-gray-600">優先度(1..5)</span>
                <input
                  type="number"
                  min={1}
                  max={5}
                  className="mt-1 w-full rounded border px-2 py-1"
                  value={priority}
                  onChange={(e) => setPriority(Math.min(5, Math.max(1, Number(e.target.value) || 3)))}
                />
              </label>
            </div>

            {/* 開始/終了 */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="text-sm">
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={noStart} onChange={(e) => setNoStart(e.target.checked)} />
                  <span className="text-gray-600">開始なし</span>
                </label>
                <input
                  type="datetime-local"
                  disabled={noStart}
                  className="mt-1 w-full rounded border px-2 py-1"
                  value={noStart ? "" : planStartLocal}
                  onChange={(e) => setPlanStartLocal(e.target.value)}
                />
              </div>
              <div className="text-sm">
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={noEnd} onChange={(e) => setNoEnd(e.target.checked)} />
                  <span className="text-gray-600">終了なし</span>
                </label>
                <input
                  type="datetime-local"
                  disabled={noEnd}
                  className="mt-1 w-full rounded border px-2 py-1"
                  value={noEnd ? "" : planEndLocal}
                  onChange={(e) => setPlanEndLocal(e.target.value)}
                />
              </div>
            </div>

            {/* カテゴリ / タグ（モバイル1カラム） */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="block text-sm">
                <span className="text-gray-600">カテゴリ</span>
                <input
                  className="mt-1 w-full rounded border px-2 py-1"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                />
              </label>

              <label className="block text-sm">
                <span className="text-gray-600">タグ</span>
                <div className="mt-1 flex gap-2 min-w-0">
                  <input
                    className="flex-1 min-w-0 rounded border px-2 py-1"
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }}
                    placeholder="タグを入力してEnter"
                  />
                  <button className="px-2 py-1 rounded border shrink-0" onClick={addTag}>追加</button>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {tags.map((t) => (
                    <span key={t} className="px-2 py-0.5 rounded-full border text-sm">
                      #{t}
                      <button className="ml-1 text-xs text-red-600" onClick={() => removeTag(t)}>×</button>
                    </span>
                  ))}
                </div>
              </label>
            </div>

            {/* メモ */}
            <label className="block text-sm">
              <span className="text-gray-600">メモ</span>
              <textarea
                className="mt-1 w-full rounded border px-2 py-1 min-h-[96px]"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </label>

            {/* 予定量/残量/単位（モバイル1・SM以上3カラム） */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
              <label className="block">
                <span className="text-gray-600">予定</span>
                <input
                  type="number"
                  className="mt-1 w-full rounded border px-2 py-1"
                  value={plannedAmount ?? ""}
                  onChange={(e) => setPlannedAmount(e.target.value === "" ? "" : Number(e.target.value))}
                  placeholder="例) 30"
                />
              </label>
              <label className="block">
                <span className="text-gray-600">残り</span>
                <input
                  type="number"
                  className="mt-1 w-full rounded border px-2 py-1"
                  value={remainingAmount ?? ""}
                  onChange={(e) => setRemainingAmount(e.target.value === "" ? "" : Number(e.target.value))}
                  placeholder="例) 10"
                />
              </label>
              <label className="block">
                <span className="text-gray-600">単位</span>
                <input
                  className="mt-1 w-full rounded border px-2 py-1"
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  placeholder="分 など"
                />
              </label>
            </div>

            <div className="h-2" />
          </div>

          {/* 固定フッター */}
          <div
            className="
              sticky bottom-0 inset-x-0
              px-4 py-3 border-t
              bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/70
              flex items-center justify-between gap-3
            "
            style={{ paddingBottom: "max(env(safe-area-inset-bottom), 12px)" }}
          >
            {/* 左：削除（既存アイテムのみ） */}
            <div>
              {item?.id != null && typeof onDelete === "function" && (
                <button
                  className="px-3 py-1.5 rounded border text-sm text-red-600 border-red-600 hover:bg-red-50"
                  onClick={() => onDelete(item.id)}
                >
                  削除
                </button>
              )}
            </div>

            {/* 右：キャンセル/保存 */}
            <div className="flex gap-2">
              <button className="px-3 py-1.5 rounded border text-sm" onClick={onCancel}>
                キャンセル
              </button>
              <button
                className="
                  px-3 py-1.5 rounded border
                  bg-emerald-600 text-white border-emerald-700 hover:bg-emerald-700
                  text-sm
                "
                onClick={() =>
                  onSave({
                    // ★ 重要：常に id / kind を渡す（新規は id=null）
                    id: item?.id ?? null,
                    kind: item?.kind ?? "NORMAL",

                    // 基本
                    title,
                    priority,
                    category: category || null,
                    tags,
                    description,
                    todo_flag: !!todoFlag,

                    // 期限（JST）
                    no_due: !!noDue,
                    due_at: noDue ? null : localDTInputToIsoJST(dueLocal),

                    // 予定（JST）
                    plan_start_at: noStart ? null : localDTInputToIsoJST(planStartLocal),
                    plan_end_at:   noEnd   ? null : localDTInputToIsoJST(planEndLocal),

                    // 数値系（双方の呼び出しに合わせる）
                    target_amount:   numOrNull(plannedAmount),
                    planned_amount:  numOrNull(plannedAmount),
                    remaining_amount:numOrNull(remainingAmount),
                    unit: unit || defaultUnit || null,
                  })
                }
              >
                保存
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
