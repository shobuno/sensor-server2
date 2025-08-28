// sensor-server/apps/todo/frontend/src/pages/TodoDailyReport.jsx

import { useEffect, useState } from "react";

function toISODateInput(d) {
  const y = d.getFullYear(), m = String(d.getMonth()+1).padStart(2,"0"), day = String(d.getDate()).padStart(2,"0");
  return `${y}-${m}-${day}`;
}

export default function TodoDailyReport() {
  const today = new Date();
  const lastWeek = new Date(Date.now() - 6*24*3600*1000);

  const [from, setFrom] = useState(toISODateInput(lastWeek));
  const [to, setTo] = useState(toISODateInput(today));
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchReport = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/todo/reports/daily?from=${from}&to=${to}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token') || ''}` }
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setRows(Array.isArray(data) ? data : []);
    } catch (e) {
      alert(`レポート取得失敗: ${e.message}`);
    } finally { setLoading(false); }
  };

  useEffect(()=>{ fetchReport(); /* eslint-disable-next-line */ }, []);

  return (
    <div className="p-4 space-y-3">
      <h1 className="text-xl font-semibold">日報</h1>
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col">
          <label className="text-xs text-gray-500">From</label>
          <input type="date" className="border rounded px-2 py-1" value={from} onChange={e=>setFrom(e.target.value)} />
        </div>
        <div className="flex flex-col">
          <label className="text-xs text-gray-500">To</label>
          <input type="date" className="border rounded px-2 py-1" value={to} onChange={e=>setTo(e.target.value)} />
        </div>
        <button onClick={fetchReport} className="px-3 py-1 rounded bg-black text-white">更新</button>
      </div>

      {loading ? (
        <div className="text-sm text-gray-500">読み込み中...</div>
      ) : (
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b">
              <th className="text-left py-1">日付（JST）</th>
              <th className="text-right py-1">合計時間 (h)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const d = new Date(r.jst_date);
              const ds = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
              return (
                <tr key={i} className="border-b">
                  <td className="py-1">{ds}</td>
                  <td className="py-1 text-right">{r.hours}</td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr><td colSpan={2} className="py-2 text-gray-500">データなし</td></tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
