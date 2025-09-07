// server2/apps/todo/frontend/src/pages/TemplatesList.jsx
import { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { fetchJson } from "@/auth";

function Badge({ children }) {
  return (
    <span className="inline-block text-xs px-2 py-0.5 rounded-full border bg-muted text-muted-foreground">
      {children}
    </span>
  );
}

export default function TemplatesList() {
  const nav = useNavigate();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [todoOnly, setTodoOnly] = useState(false);
  const [error, setError] = useState(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // ✅ /api を付ける
      const r = await fetchJson("/api/todo/templates");
      setRows(Array.isArray(r) ? r : []);
    } catch (e) {
      console.error(e);
      setError("テンプレートの読み込みに失敗しました。");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const list = useMemo(() => {
    const kw = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (todoOnly && !r.todo_flag) return false;
      if (!kw) return true;
      const t = [r.title ?? "", r.description ?? "", r.category ?? ""].join(" ").toLowerCase();
      return t.includes(kw);
    });
  }, [rows, q, todoOnly]);

  async function addToday(id) {
    try {
      // ✅ /api を付ける
      await fetchJson(`/api/todo/templates/${id}/add-today`, { method: "POST" });
      alert("今日に追加しました");
    } catch (e) {
      console.error(e);
      alert("追加に失敗しました");
    }
  }

  function editTemplate(id) {
    // 既存の編集画面を流用（kindを付けておくと分かりやすい）
    nav(`/todo/add?edit=${id}&kind=template`);
  }

  async function removeTemplate(id) {
    if (!window.confirm("このテンプレートを削除します。よろしいですか？")) return;
    try {
      await fetchJson(`/api/todo/items/${id}`, { method: "DELETE" });
      setRows((arr) => arr.filter((x) => x.id !== id));
    } catch (e) {
      console.error(e);
      alert("削除に失敗しました");
    }
  }

  return (
    <div className="px-2 py-3 sm:px-3 md:p-4 max-w-4xl mx-auto space-y-3">
      <div className="flex items-center gap-2">
        <h1 className="text-xl font-bold">テンプレート</h1>
        <div className="ml-auto flex gap-2">
          <button
            type="button"
            className="h-10 px-4 rounded-lg bg-blue-600 text-white hover:bg-blue-700"
            onClick={() => nav("/todo/add?kind=template")}
          >
            新規テンプレート
          </button>
          <button
            type="button"
            className="h-10 px-4 rounded-lg border"
            onClick={reload}
          >
            再読込
          </button>
        </div>
      </div>

      {error && <div className="p-2 rounded bg-red-100 text-red-700">{error}</div>}

      {/* 検索 & フィルタ */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          className="flex-1 rounded-lg border bg-[#121826] text-white/90 placeholder:text-white/40 px-3 py-2"
          placeholder="タイトル/説明/カテゴリを検索"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <label className="inline-flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="checkbox"
            checked={todoOnly}
            onChange={(e) => setTodoOnly(e.target.checked)}
          />
          <span>TODO（時間管理なし）だけ表示</span>
        </label>
      </div>

      {/* 一覧（スリム行） */}
      <div className="border rounded-xl divide-y">
        {/* ヘッダ（列をスリム化） */}
        <div className="hidden md:flex items-center px-3 py-2 text-sm text-muted-foreground">
          <div className="flex-1">タイトル / 種別</div>
          <div className="w-[260px] text-right pr-1">操作</div>
        </div>

        {/* 本体 */}
        {loading ? (
          <div className="px-3 py-6 text-sm text-muted-foreground">読み込み中…</div>
        ) : list.length === 0 ? (
          <div className="px-3 py-8 text-sm text-muted-foreground text-center">
            テンプレートがありません
          </div>
        ) : (
          list.map((r) => (
            <div
              key={r.id}
              className="px-3 py-2 md:py-2.5 flex items-center gap-3 hover:bg-muted/30"
            >
              {/* 左: タイトル & バッジ */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <div className="truncate font-medium">{r.title || "(無題)"}</div>
                  <Badge>テンプレート</Badge>
                  {r.category && <Badge>{r.category}</Badge>}
                  {r.todo_flag && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-600 text-white">
                      TODO
                    </span>
                  )}
                </div>
                {r.description && (
                  <div className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                    {r.description}
                  </div>
                )}
              </div>

              {/* 右: 操作（横並び・小さめ） */}
              <div className="shrink-0 flex items-center gap-1.5 md:gap-2 w-[260px] justify-end">
                <button
                  type="button"
                  className="px-2.5 py-1.5 md:px-3 md:py-1.5 rounded-md border bg-emerald-600 text-white hover:bg-emerald-700 text-xs md:text-sm"
                  title="今日のINBOXに複製して追加"
                  onClick={() => addToday(r.id)}
                >
                  今日に追加
                </button>
                <button
                  type="button"
                  className="px-2.5 py-1.5 md:px-3 md:py-1.5 rounded-md border text-xs md:text-sm"
                  onClick={() => editTemplate(r.id)}
                  title="テンプレートを編集"
                >
                  編集
                </button>
                <button
                  type="button"
                  className="px-2.5 py-1.5 md:px-3 md:py-1.5 rounded-md border text-red-600 border-red-600 hover:bg-red-50 text-xs md:text-sm"
                  onClick={() => removeTemplate(r.id)}
                  title="テンプレートを削除"
                >
                  削除
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* 注釈 */}
      <p className="text-xs text-muted-foreground mt-2">
        ※ 「今日に追加」はテンプレートを複製し、当日の日時（開始/終了）に補正した
        <span className="px-1 rounded bg-muted text-muted-foreground mx-1">normal</span>
        レコードを作成します。作成後は通常の「やること」として利用できます。
      </p>
    </div>
  );
}
