// sensor-server/apps/todo/frontend/src/components/widgets/Weather3Day.jsx
import { useEffect, useMemo, useState } from "react";

/* ===== デバッグ表示（?debugWeather） ===== */
const DEBUG_WEATHER = typeof window !== "undefined"
  ? new URLSearchParams(window.location.search).has("debugWeather")
  : false;

/* ===== 設定 ===== */
const DEFAULT_PREF_CODE = import.meta.env.VITE_JMA_FORECAST_CODE || "130000"; // 東京都
const DEFAULT_CITY_CODE = import.meta.env.VITE_JMA_CITY_CODE || null;
const CACHE_MIN = Number(import.meta.env.VITE_WEATHER_CACHE_MINUTES || 60);
const DAYS_OPTIONS = [1, 3, 7];

/* ===== 都道府県名 → JMA PREF_CODE ===== */
const PREF_MAP = {
  "北海道":"016000","青森県":"020000","岩手県":"030000","宮城県":"040000","秋田県":"050000","山形県":"060000","福島県":"070000",
  "茨城県":"080000","栃木県":"090000","群馬県":"100000","埼玉県":"110000","千葉県":"120000","東京都":"130000","神奈川県":"140000",
  "新潟県":"150000","富山県":"160000","石川県":"170000","福井県":"180000","山梨県":"190000","長野県":"200000","岐阜県":"210000",
  "静岡県":"220000","愛知県":"230000","三重県":"240000","滋賀県":"250000","京都府":"260000","大阪府":"270000","兵庫県":"280000",
  "奈良県":"290000","和歌山県":"300000","鳥取県":"310000","島根県":"320000","岡山県":"330000","広島県":"340000","山口県":"350000",
  "徳島県":"360000","香川県":"370000","愛媛県":"380000","高知県":"390000","福岡県":"400000","佐賀県":"410000","長崎県":"420000",
  "熊本県":"430000","大分県":"440000","宮崎県":"450000","鹿児島県":"460100","沖縄県":"471000",
};

/* ===== JMA ===== */
const JMA_URL = (prefCode) =>
  `https://www.jma.go.jp/bosai/forecast/data/forecast/${prefCode}.json`;
const cacheKey = (pref, city) => `weather:jma:${pref}:${city || "first"}`;

/* ===== キャッシュ ===== */
function saveCache(key, data) {
  try { localStorage.setItem(key, JSON.stringify({ t: Date.now(), data })); } catch {}
}
function loadCache(key, ttlMinutes) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (!obj?.t || !obj?.data) return null;
    const ageMin = (Date.now() - obj.t) / 60000;
    if (ageMin > ttlMinutes) return null;
    return obj.data;
  } catch { return null; }
}

/* ===== Utils ===== */
const z2 = (n) => (n < 10 ? `0${n}` : String(n));
const fmtMd = (dateStr) => {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "";
  return `${z2(d.getMonth() + 1)}/${z2(d.getDate())}`;
};
function pickLongest(tsList, predHas) {
  const cands = (tsList || []).filter(predHas);
  return cands.sort((a,b) =>
    (b.timeDefines?.length || 0) - (a.timeDefines?.length || 0)
  )[0] || null;
}

/* ===== weatherCode → 絵文字・ラベル ===== */
const JMA_ICON = {"100":"☀️","101":"⛅","102":"🌤️","200":"☁️","201":"🌥️","202":"🌥️","300":"🌧️","301":"🌦️","302":"🌦️","303":"🌦️","304":"🌦️","400":"🌨️","401":"🌨️","402":"🌨️","403":"🌨️","404":"🌨️","500":"⛈️"};
const JMA_LABEL = {"100":"晴れ","101":"晴時々曇","102":"晴一時曇","200":"くもり","201":"くもり時々晴","202":"くもり一時晴","300":"雨","301":"雨時々晴","302":"雨一時晴","303":"雨時々くもり","304":"雨一時くもり","400":"雪","401":"雪時々晴","402":"雪一時晴","403":"雪時々くもり","404":"雪一時くもり","500":"雷雨"};
const iconOf = (code="") => JMA_ICON[code] || "🌤️";
const labelOf = (code="", fallbackText="") => JMA_LABEL[code] || fallbackText || "（未発表）";

/* ===== JMA JSON パース ===== */
function parseJma(json, cityCode) {
  const blocks = Array.isArray(json) ? json : [];
  if (!blocks.length) return { rows: [], meta: {} };

  const allTs = [];
  for (const b of blocks) for (const ts of (b.timeSeries || [])) allTs.push(ts);

  const hasW = ts => ts?.areas?.[0]?.weatherCodes?.length || ts?.areas?.[0]?.weathers?.length;
  const hasT = ts => ts?.areas?.[0]?.tempsMax?.length || ts?.areas?.[0]?.tempsMin?.length || ts?.areas?.[0]?.temps?.length;
  const hasP = ts => ts?.areas?.[0]?.pops?.length;

  const tsWeather = pickLongest(allTs, hasW);
  const tsTemps   = pickLongest(allTs, hasT);
  const tsPops    = pickLongest(allTs, hasP);
  if (!tsWeather) return { rows: [], meta: {} };

  const pickArea = (ts) => {
    const areas = ts?.areas || [];
    if (!areas.length) return null;
    if (!cityCode) return areas[0];
    return areas.find((a) => a?.area?.code === cityCode || a?.areaCode === cityCode) || areas[0];
  };

  const areaW = pickArea(tsWeather);
  const areaT = tsTemps ? pickArea(tsTemps) : null;
  const areaP = tsPops ? pickArea(tsPops) : null;
  const areaName = areaW?.area?.name || areaW?.areaName || ""; // 例：東京地方、埼玉県北部

  const popByDate = {};
  if (areaP && tsPops.timeDefines?.length) {
    (areaP.pops || []).forEach((p, idx) => {
      if (p === "" || p == null) return;
      const t = tsPops.timeDefines[idx];
      const key = new Date(t).toDateString();
      const v = Number(p);
      popByDate[key] = Math.max(popByDate[key] ?? 0, v);
    });
  }

  const rows = [];
  const count = tsWeather.timeDefines.length;
  for (let i = 0; i < count; i++) {
    const date = tsWeather.timeDefines[i];
    const code = areaW?.weatherCodes?.[i] || "";
    const text = areaW?.weathers?.[i] || "";

    let tMax = null, tMin = null;
    if (areaT) {
      if (Array.isArray(areaT.tempsMax)) tMax = areaT.tempsMax[i] ?? null;
      if (Array.isArray(areaT.tempsMin)) tMin = areaT.tempsMin[i] ?? null;
      if ((tMax == null || tMin == null) && Array.isArray(areaT.temps)) {
        const v = areaT.temps[i];
        if (tMax == null) tMax = v ?? null;
        if (tMin == null) tMin = v ?? null;
      }
    }

    const pop = popByDate[new Date(date).toDateString()];
    rows.push({
      date,
      label: fmtMd(date),
      icon: iconOf(code),
      text: labelOf(code, text),
      tMax: tMax != null && tMax !== "" ? Number(tMax) : null,
      tMin: tMin != null && tMin !== "" ? Number(tMin) : null,
      pop: (pop != null ? Number(pop) : null),
    });
  }
  return { rows, meta: { areaName } };
}

async function fetchJma(prefCode, cityCode) {
  const res = await fetch(JMA_URL(prefCode), { cache: "no-cache" });
  if (!res.ok) throw new Error(`JMA fetch failed: ${res.status}`);
  const json = await res.json();
  return parseJma(json, cityCode);
}

/* ===== 位置情報 → PREF_CODE 判定（住所表示は都道府県+市区町村） ===== */
async function detectPrefCityCode() {
  try {
    const pos = await new Promise((resolve, reject) =>
      navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 8000, enableHighAccuracy: true })
    );
    const lat = pos.coords.latitude;
    const lon = pos.coords.longitude;

    let prefName = "";
    let address = "";

    // 1) GSI（失敗しても次へ）
    try {
      const r = await fetch(`https://mreversegeocode.gsi.go.jp/reverse-geocoder/LonLatToAddress?lat=${lat}&lon=${lon}`);
      const j = await r.json();
      prefName = j?.results?.lv1 || "";
      // GSIのaddressは番地まで長いことがあるが、都道府県+市区町村の構成に揃えるためNominatimに任せる
      address  = ""; 
    } catch (e) {
      console.warn("[WeatherDebug] GSI reverse failed", e);
    }

    // 2) Nominatim（住所の確定とpref補完）
    try {
      const r2 = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&accept-language=ja`);
      const j2 = await r2.json();
      const p2 = j2?.address?.state || j2?.address?.province || "";
      const c2 = j2?.address?.city || j2?.address?.town || j2?.address?.village || "";
      if (p2) prefName = p2;
      address = [prefName, c2].filter(Boolean).join(" "); // 「埼玉県 草加市」など
    } catch (e2) {
      console.warn("[WeatherDebug] Nominatim reverse failed", e2);
      if (!address && prefName) address = prefName; // 最低限
    }

    // 3) PREF_MAP のキーに補正（前方一致）
    if (!PREF_MAP[prefName]) {
      for (const key of Object.keys(PREF_MAP)) {
        if (prefName && prefName.startsWith(key)) { prefName = key; break; }
      }
    }

    const prefCode = PREF_MAP[prefName] || DEFAULT_PREF_CODE;

    return {
      prefCode,
      cityCode: null,
      displayPref: address || prefName || "不明",  // ← 見出しに出す文字：埼玉県 草加市
      displayAddress: address || "",
      _debug: { lat, lon, prefFromGsi: prefName, addressFromGsi: address, mappedPrefCode: prefCode }
    };
  } catch (e) {
    console.warn("位置情報取得失敗", e);
    return {
      prefCode: DEFAULT_PREF_CODE, cityCode: DEFAULT_CITY_CODE,
      displayPref: "デフォルト", displayAddress: "未取得",
      _debug: { reason: String(e) }
    };
  }
}

/* ===== 本体 ===== */
export default function Weather3Day() {
  const [prefCity, setPrefCity] = useState({
    prefCode: DEFAULT_PREF_CODE, cityCode: DEFAULT_CITY_CODE,
    displayPref: "デフォルト", displayAddress: ""
  });
  const [rowsAll, setRowsAll] = useState(null);
  const [areaName, setAreaName] = useState("");
  const [err, setErr] = useState(null);
  const [days, setDays] = useState(DAYS_OPTIONS[0]);
  const [debug, setDebug] = useState({});

  const k = useMemo(() => cacheKey(prefCity.prefCode, prefCity.cityCode), [prefCity.prefCode, prefCity.cityCode]);

  // 初回：現在地で上書き
  useEffect(() => {
    detectPrefCityCode().then((res) => {
      if (res?._debug) setDebug(res._debug);
      setPrefCity(res);
    });
  }, []);

  // 取得 & キャッシュ
  useEffect(() => {
    let alive = true;
    const cached = loadCache(k, CACHE_MIN);
    if (cached) {
      if (Array.isArray(cached)) {
        setRowsAll(cached);
      } else if (cached?.rows) {
        setRowsAll(cached.rows);
        setAreaName(cached.meta?.areaName || "");
      }
    }

    (async () => {
      try {
        const { rows, meta } = await fetchJma(prefCity.prefCode, prefCity.cityCode);
        if (!alive) return;
        setRowsAll(rows);
        setAreaName(meta?.areaName || "");
        saveCache(k, { rows, meta });
      } catch (e) {
        if (!alive) return;
        if (!cached) setErr(String(e?.message || e));
      }
    })();

    return () => { alive = false; };
  }, [k]);

  if (err) return <div className="rounded-xl border p-3 text-sm text-red-600">天気の取得に失敗しました：{err}</div>;
  if (!rowsAll) return <div className="rounded-xl border p-3 text-sm opacity-70">天気を読み込み中…</div>;

  const rows = Array.isArray(rowsAll) ? rowsAll : (rowsAll.rows || []);
  const viewDays = Math.min(days, rows.length);

  return (
    <div className="rounded-2xl border p-3">
      {/* 見出し：JMAを削除し、住所チップだけ表示 */}
      <div className="mb-2 flex items-center justify-between">
        <div className="font-bold flex items-center gap-2">
          天気
          <span
            className="text-xs rounded-md border px-2 py-0.5 bg-white max-w-[180px] sm:max-w-none truncate"
            title={prefCity.displayPref}
          >
            {prefCity.displayPref}
          </span>
        </div>

        {/* 日数ボタン：横4つ固定 */}
        <div className="grid grid-cols-4 gap-1 w-[180px] sm:w-auto">
          {DAYS_OPTIONS.map((d) => (
            <button
              type="button"
              key={d}
              onClick={() => setDays(d)}
              className={`px-2 py-1 rounded-md text-xs border ${d===days ? 'bg-gray-900 text-white' : 'bg-white hover:bg-gray-50'}`}
            >
              {d}日
            </button>
          ))}
        </div>
      </div>

      {/* 予報カード：スマホ最大3列想定だがここでは1/2/3レスポンシブ */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 text-sm">
        {rows.slice(0, viewDays).map((d, i) => (
          <div key={i} className="rounded-xl p-2 border">
            <div className="text-xs opacity-70">{d.label}</div>
            <div className="text-2xl leading-none">{d.icon}</div>
            <div className="truncate">{d.text}</div>
            <div className="mt-1 text-xs opacity-70">
              最高: {d.tMax != null ? `${d.tMax}℃` : "未発表"} / 最低: {d.tMin != null ? `${d.tMin}℃` : "未発表"}
            </div>
            <div className="text-xs opacity-70">
              降水確率: {d.pop != null ? `${d.pop}%` : "未発表"}
            </div>
          </div>
        ))}
      </div>

      {DEBUG_WEATHER && (
        <pre className="mt-2 text-[11px] whitespace-pre-wrap bg-gray-50 border rounded p-2 overflow-auto">
          <b>WeatherDebug</b>
          {"\n"}lat/lon: {debug.lat ?? "-"}, {debug.lon ?? "-"}
          {"\n"}pref(from): {debug.prefFromGsi ?? "-"}
          {"\n"}addr: {debug.addressFromGsi ?? "-"}
          {"\n"}mapped PREF_CODE: {debug.mappedPrefCode ?? "-"}
          {"\n"}used PREF_CODE: {prefCity.prefCode} / CITY_CODE: {prefCity.cityCode ?? "-"}
          {"\n"}JMA areaName: {areaName || "-"}
          {debug.reason ? `\nreason: ${debug.reason}` : ""}
        </pre>
      )}

      {/* 出典をシンプルに */}
      <div className="mt-2 text-[11px] opacity-60">
        出典: 気象庁 防災気象情報（JMA JSON）
      </div>
    </div>
  );
}
