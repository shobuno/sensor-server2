// sensor-server/apps/todo/frontend/src/components/widgets/Weather3Day.jsx
import { useEffect, useState } from "react";

/**
 * OpenWeather から 3日分の “日次ハイライト” を作るウィジェット。
 * 取得優先順:
 *  - (One Call 3.0 daily) lat/lon + apiKey があれば daily から3日分
 *  - cityId があれば /forecast(3h) から3日分を日毎に集計（最高/最低/代表アイコン）
 *
 * 端末ごとキャッシュ方針:
 *  - localStorage に { ts, rows, place, meta } を KEY= weather3day:<hash> で保存
 *  - TTL は 30分。TTL内はAPIコールしない（最大30分に1回）
 *  - 期限切れ後に取得失敗した場合は古いキャッシュをフォールバック表示
 *
 * props:
 *   className?: string
 */
export default function Weather3Day({ className = "" }) {
  const [rows, setRows] = useState([]); // [{date, max, min, icon, desc, pop}]
  const [place, setPlace] = useState("");

  useEffect(() => {
    let alive = true;

    const apiKey = import.meta.env.VITE_OPENWEATHER_API_KEY;
    const lat = (import.meta.env.VITE_WEATHER_LAT || "").trim();
    const lon = (import.meta.env.VITE_WEATHER_LON || "").trim();
    const cityId =
      (import.meta.env.VITE_WEATHER_CITY_ID ||
        import.meta.env.VITE_OPENWEATHER_CITY_ID ||
        ""
      ).trim();

    const units = "metric"; // 必要なら env で切替可
    const lang = "ja";
    const TTL_MS = 30 * 60 * 1000;

    const source = lat && lon ? "onecall" : cityId ? "forecast" : "none";
    const cacheKey = makeCacheKey({
      v: 1,
      source,
      lat,
      lon,
      cityId,
      units,
      lang,
    });

    // 1) キャッシュ確認
    const cached = readCache(cacheKey);
    const now = Date.now();

    // キャッシュが有効なら即時反映 & 取得をスキップ
    if (cached && now - cached.ts < TTL_MS) {
      setRows(cached.rows || []);
      setPlace(cached.place || "");
      return; // ここで終了 → APIコールなし（30分制限）
    }

    // 2) 期限切れ or 無い → 取得を試みる
    (async () => {
      try {
        if (!apiKey || source === "none") {
          // APIキー/座標/CityIDが未設定ならキャッシュフォールバックのみ
          if (cached) {
            setRows(cached.rows || []);
            setPlace(cached.place || "");
          } else {
            setRows([]);
          }
          return;
        }

        if (source === "onecall") {
          // One Call 3.0 → 失敗したら forecast に自動フォールバック
          try {
            const url = `https://api.openweathermap.org/data/3.0/onecall?lat=${encodeURIComponent(
              lat
            )}&lon=${encodeURIComponent(
              lon
            )}&exclude=minutely,hourly,alerts&units=${encodeURIComponent(
              units
            )}&lang=${encodeURIComponent(lang)}&appid=${encodeURIComponent(
              apiKey
            )}`;
            const r = await fetch(url);
            if (!r.ok) throw new Error(`onecall3.0 ${r.status}`);
            const j = await r.json();
            if (!alive) return;

            const daily = (j?.daily || []).slice(0, 3).map((d) => ({
              date: ymdFromUnix(d.dt),
              max: Math.round(d.temp?.max),
              min: Math.round(d.temp?.min),
              icon: d.weather?.[0]?.icon,
              desc: d.weather?.[0]?.description || "",
              pop: Math.round((d.pop || 0) * 100),
            }));

            setRows(daily);
            setPlace(j?.timezone || `${lat},${lon}`);
            writeCache(cacheKey, {
              ts: now,
              rows: daily,
              place: j?.timezone || `${lat},${lon}`,
              meta: { from: "onecall" },
            });
            return;
          } catch {
            // フォールバック → forecast
            const { rows: days, place: p } = await loadFromForecast({
              q: `lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(
                lon
              )}`,
              apiKey,
              units,
              lang,
              alive,
            });
            setRows(days);
            setPlace(p);
            writeCache(cacheKey, {
              ts: Date.now(),
              rows: days,
              place: p,
              meta: { from: "forecast-fallback" },
            });
            return;
          }
        }

        if (source === "forecast") {
          const { rows: days, place: p } = await loadFromForecast({
            q: `id=${encodeURIComponent(cityId)}`,
            apiKey,
            units,
            lang,
            alive,
          });
          setRows(days);
          setPlace(p);
          writeCache(cacheKey, {
            ts: Date.now(),
            rows: days,
            place: p,
            meta: { from: "forecast" },
          });
          return;
        }
      } catch (e) {
        console.warn("weather fetch failed", e);
        // 失敗時はキャッシュがあればフォールバック
        if (cached) {
          setRows(cached.rows || []);
          setPlace(cached.place || "");
        } else {
          setRows([]);
        }
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  if (!rows?.length) {
    return (
      <div className={`rounded-2xl p-3 bg-white border text-slate-700 ${className}`}>
        <div className="text-sm opacity-70">3日予報</div>
        <div className="text-xs mt-1 text-slate-500">
          APIキーまたは座標/CityIDが未設定です
        </div>
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
              ) : (
                <div className="w-9 h-9" />
              )}
              <div className="text-base font-semibold">
                {r.max}° / <span className="text-slate-500 font-normal">{r.min}°</span>
              </div>
            </div>
            <div className="text-[11px] text-slate-600 truncate">{r.desc}</div>
            <div className="text-[11px] text-slate-500 mt-0.5">降水確率 {r.pop}%</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ===== Helpers ===== */

function makeCacheKey({ v, source, lat, lon, cityId, units, lang }) {
  const keyObj =
    source === "onecall"
      ? { v, source, lat, lon, units, lang }
      : { v, source, cityId, units, lang };
  return `weather3day:${hash(JSON.stringify(keyObj))}`;
}

function readCache(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
function writeCache(key, obj) {
  try {
    localStorage.setItem(key, JSON.stringify(obj));
  } catch {
    // storage full などは無視
  }
}

// forecast(3h) を日毎に集計
async function loadFromForecast({ q, apiKey, units, lang, alive }) {
  const r = await fetch(
    `https://api.openweathermap.org/data/2.5/forecast?${q}&units=${encodeURIComponent(
      units
    )}&lang=${encodeURIComponent(lang)}&appid=${encodeURIComponent(apiKey)}`
  );
  if (!r.ok) throw new Error(`forecast ${r.status}`);
  const j = await r.json();
  if (!alive) return { rows: [], place: "" };

  const place = j?.city?.name || "";
  const grouped = groupByDateJst(j?.list || []);
  const days = Object.keys(grouped)
    .sort()
    .slice(0, 3)
    .map((date) => {
      const arr = grouped[date];
      const temps = arr.map((x) => x.main?.temp).filter(isFinite);
      const max = Math.round(Math.max(...temps));
      const min = Math.round(Math.min(...temps));
      const rep = arr.find((x) => x.dt_txt?.includes("12:00")) || arr[0];
      const icon = rep?.weather?.[0]?.icon;
      const desc = rep?.weather?.[0]?.description || "";
      const popAvg = Math.round(100 * average(arr.map((x) => x.pop ?? 0)));
      return { date, max, min, icon, desc, pop: popAvg };
    });

  return { rows: days, place };
}

function ymdFromUnix(u) {
  const d = new Date(u * 1000);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${da}`;
}
function labelJp(ymd) {
  const d = new Date(ymd + "T00:00:00+09:00");
  const w = "日月火水木金土"[d.getDay()];
  return `${ymd}（${w}）`;
}
function groupByDateJst(list) {
  const out = {};
  list.forEach((x) => {
    // dt_txt はUTC。JSTに+9hして日付を切る
    const t = new Date(x.dt_txt.replace(" ", "T") + "Z"); // UTCとして解釈
    const j = new Date(t.getTime() + 9 * 60 * 60000);
    const y = j.getFullYear();
    const m = String(j.getMonth() + 1).padStart(2, "0");
    const d = String(j.getDate()).padStart(2, "0");
    const key = `${y}-${m}-${d}`;
    (out[key] ||= []).push(x);
  });
  return out;
}
function average(arr) {
  if (!arr?.length) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

// 簡易ハッシュ（衝突低確率で十分）
function hash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return h.toString(36);
}
