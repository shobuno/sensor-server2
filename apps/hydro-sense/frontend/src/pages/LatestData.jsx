// apps/hydro-sense/frontend/src/pages/LatestData.jsx

import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import { useEffect, useState } from 'react';
import { Navigate, Link } from 'react-router-dom';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, Legend,
  ResponsiveContainer, Area, AreaChart
} from 'recharts';
import { getToken, logout } from '../../../../../frontend/src/auth';

import latestIcon from '@hydro-sense/assets/icons/latest.png';
import graphIcon from '@hydro-sense/assets/icons/graph.png';
import ecCorrectionIcon from '@hydro-sense/assets/icons/ecCorrection.png';


dayjs.extend(utc);
dayjs.extend(timezone);

export default function LatestData() {
  const token = getToken();

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [graphData, setGraphData] = useState([]);
  const [isDark, setIsDark] = useState(false);


  const fetchData = async () => {
    try {
      const res = await fetch(`/api/hydro/latest`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: 'include',
      });

      if (res.status === 401) {
        logout();
        window.location.href = '/login';
        return;
      }

      let json = {};
      if (res.ok) {
        try {
          json = await res.json();
        } catch {
          json = {};
        }
      } else {
        const text = await res.text();
        console.error("❌ /api/hydro/latest failed:", res.status, text);
      }

      // フィールド名ゆらぎに対応したフォールバック
      const ts =
        json.timestamp ??
        json.time ??
        json.measured_at ??
        null;

      const temp =
        json.temperature ??
        json.air_temperature ??
        json.air_avg ??
        null;

      const wtemp =
        json.water_temperature ??
        json.water_temp ??
        json.water_avg ??
        null;

      const ecRaw =
        json.ec ??
        json.ec_raw ??
        null;

      const ecCorr =
        json.ec25_corrected ??
        json.ec_corrected ??
        json.ec_adj ??
        null;

      const level =
        json.water_level ??
        json.level ??
        null;

      // 値が無くても data はセット（ローディングを抜ける）
      setData({
        timestamp: ts,
        temperature: temp,
        water_temperature: wtemp,
        ec: ecRaw,
        ec25_corrected: ecCorr,
        water_level: level,
      });
      setError(null);
    } catch (err) {
      console.error('🔥 fetch エラー:', err);
      // エラー時も空データで描画へ進む
      setData({
        timestamp: null, temperature: null, water_temperature: null,
        ec: null, ec25_corrected: null, water_level: null,
      });
      setError('データ取得に失敗しました');
    }
  };

  const fetchGraphData = async () => {
    try {
      const res = await fetch(`/api/hydro/ec-graph?range=1d&type=all`, {
        headers: { 'Authorization': `Bearer ${token}` },
        credentials: 'include'
      });

      if (res.status === 401) {
        logout();
        window.location.href = '/login';
        return;
      }

      if (!res.ok) throw new Error('グラフデータ取得失敗');

      const json = await res.json();
      const converted = json.map((item) => ({
        ...item,
        timestamp: new Date(item.timestamp).getTime(),
      }));

      setGraphData(converted);
    } catch (err) {
      console.error('🔥 グラフデータ取得エラー:', err);
    }
  };

  useEffect(() => {
    fetchData();
    fetchGraphData();
    const timer = setInterval(() => {
      fetchData();
      fetchGraphData();
    }, 10000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const checkDark = () => {
      setIsDark(document.documentElement.classList.contains('dark'));
    };
    checkDark();
    window.addEventListener('resize', checkDark);
    const observer = new MutationObserver(checkDark);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => {
      window.removeEventListener('resize', checkDark);
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    if (data && data.timestamp) {
      console.log("🕒 data.timestamp:", data.timestamp);
      console.log("🕒 as dayjs (default):", dayjs(data.timestamp).format());
      console.log("🕒 as JST:", dayjs(data.timestamp).tz('Asia/Tokyo').format());
    }
  }, [data]);

  const formatWaterLevel = (level) => {
    return { 3: "高", 2: "中", 1: "低", 0: "空" }[level] ?? "--";
  };

  const levelColor = (level) => {
    return {
      3: "bg-green-500",
      2: "bg-blue-500",
      1: "bg-yellow-400",
      0: "bg-red-500"
    }[level] ?? "bg-gray-500";
  };

  const levelTextColor = (level) => {
    return {
      3: "text-green-500",
      2: "text-blue-500",
      1: "text-yellow-400",
      0: "text-red-500"
    }[level] ?? "bg-gray-500";
  };
  

 // ---- 表示フォーマッタ ----
 const fmt = (v, digits) => {
   const n = Number(v);
   if (v === null || v === undefined || Number.isNaN(n)) return '--';
   const s = n.toFixed(digits);
   // -0.0 / -0.00 を 0.0 / 0.00 に
   return s.startsWith('-0.') ? s.slice(1) : s;
 };
 const fmt1 = (v) => fmt(v, 1); // 気温・水温: 1桁
 const fmt2 = (v) => fmt(v, 2); // EC: 2桁


  return (
    <div className="bg-white dark:bg-gray-900 w-full min-h-screen text-gray-900 dark:text-white px-2 sm:px-4 py-6 flex flex-col">
      {/* レスポンシブレイアウト */}
      <div className="flex flex-col gap-6 w-full md:flex-row">
        {/* サイドカード */}
        <div className="bg-white dark:bg-gray-800 p-4 md:p-6 rounded-xl shadow-xl w-full md:w-[320px] flex-shrink-0 flex flex-col items-center justify-start">
          <div className="flex flex-row items-center gap-3 mb-4">
            <img
              src={latestIcon}
              alt="最新情報2"
              className="w-14 h-14 md:w-20 md:h-20"
              style={{ minWidth: '3.5rem', minHeight: '3.5rem' }}
            />
            <Link to="/hydro-sense/graph" title="グラフ表示">
              <img
                src={graphIcon}
                alt="グラフ表示"
                className="w-14 h-14 md:w-20 md:h-20 hover:opacity-80 hover:scale-105 transition-all"
                style={{ minWidth: '3.5rem', minHeight: '3.5rem' }}
              />
            </Link>
            <Link to="/hydro-sense/ec-correction" title="EC補正">
              <img
                src={ecCorrectionIcon}
                alt="EC補正"
                className="w-14 h-14 md:w-20 md:h-20 hover:opacity-80 hover:scale-105 transition-all"
                style={{ minWidth: '3.5rem', minHeight: '3.5rem' }}
              />
            </Link>
          </div>

          {error && <p className="text-red-400">{error}</p>}
          {data ? (
            <>
              <div className="w-full mb-4">
                <div className="flex flex-row md:flex-col gap-0.5 w-full">
                  <div className="bg-gray-200 dark:bg-gray-700 px-0 py-2 rounded-xl text-center flex-1 md:mb-4">
                    <div className="text-xs md:text-base text-gray-600 dark:text-gray-300">気温</div>
                    <div className="text-4xl md:text-6xl font-bold text-green-600 dark:text-green-400">{fmt1(data.temperature) ?? '--'}</div>
                  </div>
                  <div className="bg-gray-200 dark:bg-gray-700 px-0 py-2 rounded-xl text-center flex-1 md:mb-4">
                    <div className="text-xs md:text-base text-gray-600 dark:text-gray-300">水温</div>
                    <div className="text-4xl md:text-6xl font-bold text-blue-600 dark:text-blue-400">{fmt1(data.water_temperature) ?? '--'}</div>
                  </div>
                  <div className="bg-gray-200 dark:bg-gray-700 px-0 py-2 rounded-xl text-center flex-1">
                    <div className="text-xs md:text-base text-gray-600 dark:text-gray-300">EC</div>
                    <div className="text-4xl md:text-6xl font-bold text-red-500 dark:text-red-400">{fmt2(data.ec25_corrected) ?? '--'}</div>
                  </div>
                </div>
                <p className="text-sm md:text-base text-right text-gray-400 mt-1">EC元値: {data.ec ?? '--'}</p>
              </div>

              <div className="mt-2">
                <p className="font-semibold">
                  水位: <span className={levelTextColor(data.water_level)}>{formatWaterLevel(data.water_level)}</span>
                </p>
                <div className="w-[150px] h-4 bg-gray-700 rounded mt-1">
                  <div className={`h-4 ${levelColor(data.water_level)} rounded transition-all`}
                    style={{ width: `${Math.max((data.water_level ?? 0) * 33, 8)}%` }} />
                </div>
              </div>

              {data.water_level === 0 && (
                <div className="mt-4 bg-red-600 text-white font-bold py-2 px-4 rounded-lg shadow-lg animate-pulse text-center">
                  ⚠️ 水が空です！早急に補給してください
                </div>
              )}

              <p className="text-sm text-right text-gray-400 mt-6">
                更新: {dayjs(data.timestamp).format("YYYY/MM/DD HH:mm:ss")}
              </p>
            </>
          ) : (
            <p className="text-gray-400">読み込み中...</p>
          )}
        </div>

        {/* グラフ表示 */}
        <div className="flex-1 flex flex-col gap-3 w-full">
          <div className="bg-white dark:bg-gray-800 p-2 rounded-xl shadow-xl flex-1 min-h-[120px] h-[180px] md:h-[calc(50vh-32px)]">
            <h2 className="text-base font-bold mb-1">気温・水温</h2>
            <ResponsiveContainer width="100%" height="88%">
              <AreaChart data={graphData} margin={{ top: 10, right: 10, left: 0, bottom: 10 }}>
                <XAxis dataKey="timestamp" tickFormatter={(time) => dayjs(time).format("HH:mm")}
                  tick={{ fill: isDark ? "#e5e7eb" : "#374151", fontSize: 12 }} />
                <YAxis
                  width={38}
                  tick={{ fill: isDark ? "#e5e7eb" : "#374151", fontSize: 12 }}
                  domain={['auto', 'auto']}
                />
                <Tooltip content={<CustomTooltip isDark={isDark} />} />
                <Legend verticalAlign="top" align="right" />
                <Area type="monotone" dataKey="air_avg" stroke="#82c91e" fill="#82c91e" fillOpacity={0.25} dot={false} name="気温" />
                <Area type="monotone" dataKey="water_avg" stroke="#00e0ff" fill="#00e0ff" fillOpacity={0.25} dot={false} name="水温" />
                <Line type="monotone" dataKey="air_avg" stroke="#82c91e" dot={false} />
                <Line type="monotone" dataKey="water_avg" stroke="#00e0ff" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-white dark:bg-gray-800 p-2 rounded-xl shadow-xl flex-1 min-h-[120px] h-[180px] md:h-[calc(50vh-32px)]">
            <h2 className="text-base font-bold mb-1">EC</h2>
            <ResponsiveContainer width="100%" height="88%">
              <AreaChart data={graphData} margin={{ top: 10, right: 10, left: 0, bottom: 10 }}>
                <XAxis dataKey="timestamp" tickFormatter={(time) => dayjs(time).format("HH:mm")}
                  tick={{ fill: isDark ? "#e5e7eb" : "#374151", fontSize: 12 }} />
                <YAxis
                  width={40}
                  tickFormatter={(v) => v?.toFixed(2)}
                  tick={{ fill: isDark ? "#e5e7eb" : "#374151", fontSize: 12 }}
                  domain={['auto', 'auto']}
                />
                <Tooltip labelFormatter={(value) => dayjs(value).format("YYYY/MM/DD HH:mm")}
                  contentStyle={{
                    backgroundColor: isDark ? '#222' : '#fff',
                    color: isDark ? '#fff' : '#222',
                    border: '1px solid #444'
                  }}
                  labelStyle={{ color: isDark ? '#fff' : '#222' }}
                />
                <Legend verticalAlign="top" align="right" />
                <Area type="monotone" dataKey="ec_corrected" stroke="#f28b82" fill="#f28b82" fillOpacity={0.25} dot={false} />
                <Line type="monotone" dataKey="ec_corrected" name="補正EC" stroke="#f28b82" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}

const CustomTooltip = ({ active, payload, label, isDark }) => {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div style={{
      backgroundColor: isDark ? '#222' : '#fff',
      color: isDark ? '#fff' : '#222',
      border: '1px solid #444',
      padding: 8,
      borderRadius: 8,
      fontSize: 14,
    }}>
      <div style={{ color: isDark ? '#fff' : '#222', marginBottom: 4 }}>
        {dayjs(label).tz("Asia/Tokyo").format("YYYY/MM/DD HH:mm")}
      </div>
      {payload.map((entry, i) => (
        <div key={i} style={{ color: entry.color }}>
          {entry.name}: {entry.value}
        </div>
      ))}
    </div>
  );
};
