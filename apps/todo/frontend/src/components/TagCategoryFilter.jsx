// sensor-server/apps/todo/frontend/src/components/TagCategoryFilter.jsx

import { useMemo } from "react";

/** "a, b" でも ["a","b"] でもOK に整形 */
function normalizeTags(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map((t) => String(t).trim()).filter(Boolean);
  return String(raw)
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

/**
 * TagCategoryFilter
 * - 現在の表示結果（showDone/カテゴリ/選択済みタグ）に基づいて、候補タグ/カテゴリを再計算
 * - クリックでタグのON/OFF（AND条件）
 * - クリアで全解除
 */
export default function TagCategoryFilter({
  /** 元の全アイテム（画面が保持するデータ） */
  items = [],
  /** 完了も表示するか */
  showDone = false,
  /** 現在選択中のタグ（配列） */
  selectedTags = [],
  /** 現在選択中のカテゴリ（null | string） */
  selectedCategory = null,
  /** イベント */
  onToggleTag,
  onSelectCategory,
  onClear,
  /** 見た目用: アクティブ/非アクティブのチップクラス */
  chipClass = (active) =>
    "px-2 py-1 rounded-full border text-sm shrink-0 transition-colors " +
    (active ? "bg-background" : "bg-muted text-muted-foreground"),
}) {
  /** 1) 現在の選択状態で「表示中」とみなすアイテムを作る */
  const filtered = useMemo(() => {
    const needTags = new Set(selectedTags || []);
    return (items || []).filter((it) => {
      if (!showDone && it.status === "DONE") return false;
      if (selectedCategory && it.category !== selectedCategory) return false;
      if (needTags.size > 0) {
        const t = new Set(normalizeTags(it.tags));
        for (const tag of needTags) if (!t.has(tag)) return false;
      }
      return true;
    });
  }, [items, showDone, selectedCategory, selectedTags]);

  /** 2) 現在の表示結果から候補タグ/カテゴリを抽出（重複排除・ソート） */
  const { visibleTags, tagCounts, visibleCategories, categoryCounts } = useMemo(() => {
    const tagMap = new Map();       // tag -> count
    const categoryMap = new Map();  // category -> count
    for (const it of filtered) {
      for (const t of normalizeTags(it.tags)) {
        tagMap.set(t, (tagMap.get(t) || 0) + 1);
      }
      if (it.category) {
        categoryMap.set(it.category, (categoryMap.get(it.category) || 0) + 1);
      }
    }
    const tags = Array.from(tagMap.keys()).sort((a, b) => a.localeCompare(b));
    const cats = Array.from(categoryMap.keys()).sort((a, b) => a.localeCompare(b));
    return {
      visibleTags: tags,
      tagCounts: Object.fromEntries(tagMap),
      visibleCategories: cats,
      categoryCounts: Object.fromEntries(categoryMap),
    };
  }, [filtered]);

  const hasFilters = (selectedTags?.length ?? 0) > 0 || !!selectedCategory;

  return (
    <div className="mb-3 space-y-2">
      {/* タグ列 */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        <span className="text-sm text-muted-foreground shrink-0">タグ:</span>
        {visibleTags.length === 0 ? (
          <span className="text-sm text-muted-foreground">なし</span>
        ) : (
          visibleTags.map((t) => {
            const active = selectedTags?.includes(t);
            return (
              <button
                key={t}
                onClick={() => onToggleTag(t)}
                className={chipClass(active)}
                title={active ? "選択中（クリックで解除）" : "クリックで絞り込み"}
              >
                #{t}
                <span className="ml-1 opacity-70">
                  ({tagCounts[t] ?? 0})
                </span>
              </button>
            );
          })
        )}
      </div>

      {/* カテゴリ列 */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        <span className="text-sm text-muted-foreground shrink-0">カテゴリ:</span>
        {visibleCategories.length === 0 ? (
          <span className="text-sm text-muted-foreground">なし</span>
        ) : (
          visibleCategories.map((c) => {
            const active = selectedCategory === c;
            return (
              <button
                key={c}
                onClick={() => onSelectCategory(active ? null : c)}
                className={chipClass(active)}
              >
                {c}
                <span className="ml-1 opacity-70">
                  ({categoryCounts[c] ?? 0})
                </span>
              </button>
            );
          })
        )}

        {hasFilters && (
          <button
            onClick={onClear}
            className="ml-1 px-2 py-1 text-sm border rounded-full shrink-0"
            title="タグ/カテゴリをすべて解除"
          >
            ✕ クリア
          </button>
        )}
      </div>
    </div>
  );
}
