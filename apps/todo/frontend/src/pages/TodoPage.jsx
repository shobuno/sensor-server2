// sensor-server/apps/todo/frontend/src/pages/TodoPage.jsx
import { useEffect, useState, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import TodayStartView from "@todo/pages/TodayStart.jsx";
import TodayRunView from "@todo/pages/TodayRunView.jsx";
import TodayCloseView from "@todo/pages/TodayCloseView.jsx";
import TodoAdd from "@todo/pages/TodoAdd.jsx";
import TodoDailyReport from "@todo/pages/TodoDailyReport.jsx";
// ★ 自動遷移を廃止するため listToday/getStartCandidates は使わない（必要なら残してもOK）
// import { listToday, getStartCandidates } from "@/api/todo";

const CANCEL_FLAG = "todo:add:cancelEdit";

/** URL ←→ state を同期。タブ変更時は edit クエリを必ず外す */
function useTabFromUrl(defaultTab) {
  const nav = useNavigate();
  const { search } = useLocation();
  const [tab, setTabState] = useState(() => new URLSearchParams(search).get("tab") || defaultTab);

  // URL変化で state を追従
  useEffect(() => {
    const t = new URLSearchParams(search).get("tab") || defaultTab;
    setTabState(t);
  }, [search, defaultTab]);

  // タブ変更時は edit を外して URL を更新
  const setTab = useCallback(
    (nextTab, extraParams = {}) => {
      const cur = new URLSearchParams(search);
      if (cur.get("edit")) {
        try { sessionStorage.setItem(CANCEL_FLAG, "1"); } catch {}
        cur.delete("edit");
      }
      if (cur.get("tab") !== nextTab) cur.set("tab", nextTab);
      // 追加のクエリ（例: { date: '2025-08-30' }）を反映
      Object.entries(extraParams).forEach(([k, v]) => {
        if (v === undefined || v === null || v === "") cur.delete(k);
        else cur.set(k, String(v));
      });
      nav(`/todo?${cur.toString()}`, { replace: true });
    },
    [nav, search]
  );

  return [tab, setTab];
}

export default function TodoPage() {
  const { search } = useLocation();
  const [ready, setReady] = useState(true); // ★ もう初期ロード判定は不要なので true で開始
  const [tab, setTab] = useTabFromUrl("today");

  // URL から editId を取得
  const sp = new URLSearchParams(search);
  const editId = sp.get("edit");

  // ★ 自動遷移ロジック（0件→add）を完全削除
  // useEffect(() => { ... setTab("add") ... }, []);

  if (!ready) return null;

  const TabBtn = ({ k, label }) => (
    <button
      className={`px-3 py-1 rounded-full border ${tab === k ? "bg-black text-white" : "bg-white"}`}
      onClick={() => setTab(k)}
    >
      {label}
    </button>
  );

  return (
    <div className="p-3 space-y-3">
      {/* タブヘッダ */}
      <div className="flex gap-2">
        <TabBtn k="start" label="今日の開始" />
        <TabBtn k="today" label="今日" />
        <TabBtn k="reports" label="履歴" />
        <TabBtn k="close" label="今日の終了" />
      </div>

      {/* タブ本体 */}
      <div className="mt-2">
        {tab === "start" && (
          <TodayStartView
            onCommitted={() => setTab("today")}
            // ★ 自動遷移廃止のため onEmptyInbox は渡さない
            // onEmptyInbox={() => setTab("add")}
          />
        )}

        {tab === "today" && (
          <TodayRunView
            onAllDone={() => setTab("close")}
            onNeedStart={() => setTab("start")}
          />
        )}

        {tab === "add" && (
          <TodoAdd
            key={editId || "new"}     // editId 変化時に再マウント
            editId={editId}
            onCreated={() => setTab("start")}
          />
        )}

        {tab === "reports" && <TodoDailyReport />}

        {tab === "close" && (
          <TodayCloseView
            onClosed={(reportDate) => {
              if (reportDate) setTab("reports", { date: reportDate });
              else setTab("start");
            }}
          />
        )}
      </div>
    </div>
  );
}
