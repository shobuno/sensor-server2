// sensor-server/apps/todo/frontend/src/components/widgets/Weather3Day.jsx
import { useEffect, useMemo, useState } from "react";

/**
 * OpenWeather から 3日分の “日次ハイライト” を作るウィジェット。
 * 取得優先順:
 *  - (One Call 3.0 daily) lat/lon + apiKey があれば daily から3日分
 *  - cityId があれば /forecast(3h) から3日分を日毎に集計（最高/最低/代表アイコン）
 *
 * props:
 *   className?: string
 */
export default function Weather3Day({ className = "" }) {
  const [rows, setRows] = useState([]); // [{date, max, min, icon, desc, pop}]
  const [place, setPlace] = useState("");
  
  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const apiKey = import.meta.env.VITE_OPENWEATHER_API_KEY;
        const lat = import.meta.env.VITE_WEATHER_LAT;
        const lon = import.meta.env.VITE_WEATHER_LON;
        const cityId = import.meta.env.VITE_WEATHER_CITY_ID
                    || import.meta.env.VITE_OPENWEATHER_CITY_ID; // ← .env の実名に対応

        if (!apiKey) {
          setRows([]);
          return;
        }

        // ヘルパ：3h予報(2.5) を日単位に集計
        const loadFromForecast = async (qs) => {
          const r = await fetch(`https://api.openweathermap.org/data/2.5/forecast?${qs}&units=metric&lang=ja&appid=${apiKey}`);
          const j = await r.json();
          if (!alive) return;
          setPlace(j?.city?.name || "");
          const grouped = groupByDateJst(j?.list || []);
          const days = Object.keys(grouped).sort().slice(0, 3).map(date => {
            const arr = grouped[date];
            const temps = arr.map(x => x.main?.temp).filter(isFinite);
            const max = Math.round(Math.max(...temps));
            const min = Math.round(Math.min(...temps));
            const rep = arr.find(x => x.dt_txt?.includes("12:00")) || arr[0];
            const icon = rep?.weather?.[0]?.icon;
            const desc = rep?.weather?.[0]?.description || "";
            const popAvg = Math.round(100 * average(arr.map(x => x.pop ?? 0)));
            return { date, max, min, icon, desc, pop: popAvg };
          });
          setRows(days);
        };

        if (lat && lon && lat.trim() !== "" && lon.trim() !== "") {
          // まず One Call 3.0 を試す（失敗したら forecast に自動フォールバック）
          try {
            const url = `https://api.openweathermap.org/data/3.0/onecall?lat=${lat}&lon=${lon}&exclude=minutely,hourly,alerts&units=metric&lang=ja&appid=${apiKey}`;
            const r = await fetch(url);
            if (!r.ok) throw new Error(`onecall3.0 ${r.status}`);
            const j = await r.json();
            if (!alive) return;
            const daily = (j?.daily || []).slice(0, 3).map(d => ({
              date: ymdFromUnix(d.dt),
              max: Math.round(d.temp?.max),
              min: Math.round(d.temp?.min),
              icon: d.weather?.[0]?.icon,
              desc: d.weather?.[0]?.description || "",
              pop: Math.round(((d.pop || 0) * 100)),
            }));
            setRows(daily);
            setPlace(j?.timezone || `${lat},${lon}`);
            return;
          } catch (err) {
            // 権限不足/キー不正/無料プラン等 → forecast 2.5 に切替
            await loadFromForecast(`lat=${lat}&lon=${lon}`);
            return;
          }
        }

        if (cityId) {
          await loadFromForecast(`id=${cityId}`);
          return;
        }


        setRows([]);
      } catch (e) {
        console.warn('weather fetch failed', e);
        setRows([]);
      }
    }
    load();
    return () => { alive = false; };
  }, []);

  if (!rows?.length) {
    return (
      <div className={`rounded-2xl p-3 bg-white border text-slate-700 ${className}`}>
        <div className="text-sm opacity-70">3日予報</div>
        <div className="text-xs mt-1 text-slate-500">APIキーまたは座標/CityIDが未設定です</div>

      </div>
    );
  }

  return (
    <div className={`rounded-2xl p-3 bg-white border text-slate-800 ${className}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm text-slate-600">3日予報</div>
        <div className="text-xs text-slate-500">{place}</div>

      </div>
      <div className="grid grid-cols-3 gap-2">
        {rows.map((r) => (
          <div key={r.date} className="rounded-xl p-2 bg-white border border-slate-200">
            <div className="text-xs text-slate-500">{labelJp(r.date)}</div>
            <div className="flex items-center gap-2 mt-1">
              {r.icon ? (
                <img
                  alt={r.desc}
                  className="w-9 h-9"
                  src={`https://openweathermap.org/img/wn/${r.icon}@2x.png`}
                />
              ) : <div className="w-9 h-9" />}
              <div className="text-base font-semibold">{r.max}° / <span className="text-slate-500 font-normal">{r.min}°</span></div>

            </div>
            <div className="text-[11px] text-slate-600 truncate">{r.desc}</div>
            <div className="text-[11px] text-slate-500 mt-0.5">降水確率 {r.pop}%</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ymdFromUnix(u) {
  const d = new Date(u * 1000);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2,'0');
  const da = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${da}`;
}
function labelJp(ymd) {
  const d = new Date(ymd + 'T00:00:00+09:00');
  const w = "日月火水木金土"[d.getDay()];
  return `${ymd}（${w}）`;
}
function groupByDateJst(list) {
  const out = {};
  list.forEach(x => {
    // dt_txt はUTC。JSTに+9hして日付を切る
    const t = new Date(x.dt_txt.replace(' ', 'T') + 'Z'); // UTCとして解釈
    const j = new Date(t.getTime() + 9*60*60000);
    const y = j.getFullYear();
    const m = String(j.getMonth() + 1).padStart(2,'0');
    const d = String(j.getDate()).padStart(2,'0');
    const key = `${y}-${m}-${d}`;
    (out[key] ||= []).push(x);
  });
  return out;
}
function average(arr) {
  if (!arr?.length) return 0;
  return arr.reduce((a,b)=>a+b,0)/arr.length;
}
