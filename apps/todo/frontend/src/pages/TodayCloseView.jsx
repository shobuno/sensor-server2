// sensor-server/apps/todo/frontend/src/pages/TodayCloseView.jsx

import { useEffect, useMemo, useState } from "react";
import { getTodayItems, closeToday } from "@/api/todo";

function formatHMS(sec) {
  const s = Math.max(0, Math.floor(sec || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return [h, m, ss].map(v => String(v).padStart(2, "0")).join(":");
}

export default function TodayCloseView({ onClosed }) {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);
  const [saving, setSaving] = useState(false);

  // id -> remaining_amount（未完了のみ）
  const [remainMap, setRemainMap] = useState({});

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      try {
        const list = await getTodayItems(); // today=1 相当
        if (!mounted) return;

        setItems(list || []);
        // 未完了だけ初期値をセット
        const m = {};
        (list || [])
          .filter(i => i.status !== "DONE")
          .forEach(i => { m[i.id] = Number(i.remaining_amount ?? 0); });
        setRemainMap(m);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => (mounted = false);
  }, []);

  const notDone = useMemo(() => items.filter(i => i.status !== "DONE"), [items]);
  const done    = useMemo(() => items.filter(i => i.status === "DONE"), [items]);

  const totalSec = useMemo(
    () => (items || []).reduce((acc, it) => acc + Number(it.run_seconds || 0), 0),
    [items]
  );

  const setRemain = (id, v) =>
    setRemainMap(prev => ({ ...prev, [id]: Math.max(0, Number(v || 0)) }));

  const onSubmit = async () => {
    try {
      setSaving(true);
      // 未完了分の残りだけ送る
      const remaining = notDone.map(i => ({
        id: i.id,
        remaining_amount: Number(remainMap[i.id] ?? 0),
      }));
      await closeToday(remaining);

      // 正常終了 -> 呼び出し元に通知（「今日の開始」へ遷移させる）
      onClosed?.();
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="p-3 text-sm">読み込み中…</div>;

  return (
    <div className="p-3 space-y-4">
      <div className="text-sm text-gray-600">
        今日の作業時間合計: <span className="font-mono">{formatHMS(totalSec)}</span>
      </div>

      <h3 className="font-semibold">未完了のタスク</h3>
      {notDone.length === 0 ? (
        <div className="text-sm text-gray-500 border rounded p-3">
          未完了の TODAY はありません。
        </div>
      ) : (
        <ul className="divide-y border rounded">
          {notDone.map(i => (
            <li key={i.id} className="p-3">
              <div className="font-medium">{i.title}</div>
              <div className="mt-1 text-sm flex items-center gap-2">
                <span>残り（{i.unit || "件"}）:</span>
                <input
                  type="number"
                  className="w-24 px-2 py-1 border rounded"
                  value={remainMap[i.id] ?? 0}
                  onChange={e => setRemain(i.id, e.target.value)}
                  min={0}
                />
              </div>
            </li>
          ))}
        </ul>
      )}

      <h3 className="font-semibold">今日完了したタスク</h3>
      {done.length === 0 ? (
        <div className="text-sm text-gray-500 border rounded p-3">
          今日完了したタスクはありません。
        </div>
      ) : (
        <ul className="divide-y border rounded">
          {done.map(i => (
            <li key={i.id} className="p-3">{i.title}</li>
          ))}
        </ul>
      )}

      <button
        className="px-4 py-2 rounded bg-blue-600 text-white disabled:opacity-50"
        disabled={saving}
        onClick={onSubmit}
      >
        {saving ? "処理中…" : "今日を終了する"}
      </button>
    </div>
  );
}
