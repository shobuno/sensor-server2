// hydro-sense/frontend/src/pages/GraphDisplay.jsx

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, Legend,
  ResponsiveContainer, Area, AreaChart
} from 'recharts';
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import { getToken, logout } from '../../../../../frontend/src/auth';

import latestIcon from '@hydro-sense/assets/icons/latest.png';
import graphIcon from '@hydro-sense/assets/icons/graph.png';

dayjs.extend(utc);
dayjs.extend(timezone);

const apiBase = import.meta.env.VITE_API_BASE_URL;
const AVG_GRAPH_OPTIONS = [
  { key: 'air_avg', label: '気温' },
  { key: 'water_avg', label: '水温' },
  { key: 'ec_corrected', label: 'EC値' },
];

const ALL_GRAPH_OPTIONS = [
  { key: 'air_all', label: '気温' },
  { key: 'water_all', label: '水温' },
  { key: 'ec_all', label: 'EC値' },
];

const RANGE_OPTIONS = [
  { key: '1d', label: '1日' },
  { key: '1w', label: '1週間' },
  { key: '1m', label: '1ヶ月' },
  { key: '6m', label: '6ヶ月' },
  { key: '1y', label: '1年' },
  { key: '2y', label: '2年' },
];

const VIEW_OPTIONS = [
  { key: '10m', label: '10分' },
  { key: '1h', label: '1時間' },
  { key: 'daily', label: '日次' },
  { key: 'monthly', label: '月次' },
];

function useDarkMode() {
  const getIsDark = () =>
    document.documentElement.classList.contains('dark') ||
    window.matchMedia('(prefers-color-scheme: dark)').matches;

  const [isDark, setIsDark] = useState(getIsDark);

  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDark(getIsDark());
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const mediaListener = () => setIsDark(getIsDark());
    media.addEventListener('change', mediaListener);

    return () => {
      observer.disconnect();
      media.removeEventListener('change', mediaListener);
    };
  }, []);

  return isDark;
}

export default function GraphDisplay() {
  const navigate = useNavigate();
  useEffect(() => {
    const token = getToken();
    if (!token) {
      navigate('/login', { replace: true });
      return;
    }

    fetch('/api/auth/me', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      }
    })
      .then((res) => {
        if (!res.ok) throw new Error('unauthorized');
        return res.json();
      })
      .catch(() => {
        logout();
        window.location.href = '/login';
      });
  }, [navigate]);

  const [graphTypeAvg, setGraphTypeAvg] = useState(() => localStorage.getItem('graphTypeAvg') || 'air_avg');
  const [graphTypeAll, setGraphTypeAll] = useState(() => localStorage.getItem('graphTypeAll') || 'air_all');
  const [rangeAvg, setRangeAvg] = useState(() => localStorage.getItem('graphRangeAvg') || '1d');
  const [rangeAll, setRangeAll] = useState(() => localStorage.getItem('graphRangeAll') || '1d');
  const [viewAll, setViewAll] = useState(() => localStorage.getItem('graphViewAll') || '10m');
  const [dataAvg, setDataAvg] = useState([]);
  const [dataAll, setDataAll] = useState([]);
  const isDark = useDarkMode();

  useEffect(() => {
    localStorage.setItem('graphTypeAvg', graphTypeAvg);
    localStorage.setItem('graphTypeAll', graphTypeAll);
    localStorage.setItem('graphRangeAvg', rangeAvg);
    localStorage.setItem('graphRangeAll', rangeAll);
    localStorage.setItem('graphViewAll', viewAll);
  }, [graphTypeAvg, graphTypeAll, rangeAvg, rangeAll, viewAll]);

  const fetchData = async (type, range, setter, view = null) => {
    try {
      const token = getToken();
      const viewParam = view ? `&view=${view}` : '';
      const res = await fetch(`/api/hydro/ec-graph?type=${type}&range=${range}${viewParam}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!res.ok) throw new Error(`失敗: ${res.status}`);
      const json = await res.json();
      const formatted = json.map((d) => ({
        ...d,
        timestamp: dayjs(d.timestamp).toDate(),
      }));
      setter(formatted);
    } catch (err) {
      console.error(`🔥 ${type} 取得エラー:`, err);
      setter([]);
    }
  };

  useEffect(() => {
    fetchData(graphTypeAvg, rangeAvg, setDataAvg);
  }, [graphTypeAvg, rangeAvg]);

  useEffect(() => {
    fetchData(graphTypeAll, rangeAll, setDataAll, viewAll);
  }, [graphTypeAll, rangeAll, viewAll]);

  const renderAreaLine = (key, label, color) => [
    <Area key={`${key}_area`} type="monotone" dataKey={key} stroke={color} fill={color} fillOpacity={0.25} dot={false} name={label} />,
    <Line key={key} type="monotone" dataKey={key} stroke={color} dot={false} name={label} />
  ];

  const renderAll = (avgKey, maxKey, minKey, label, color) => [
    <Area key={`${avgKey}_area`} type="monotone" dataKey={avgKey} stroke={color} fill={color} fillOpacity={0.25} dot={false} name={`${label}avg`} />,
    <Line key={avgKey} type="monotone" dataKey={avgKey} stroke={color} dot={false} name={`平均値`} />,
    <Line key={maxKey} type="monotone" dataKey={maxKey} stroke="#ff0000" dot={false} name={`最大値`} />,
    <Line key={minKey} type="monotone" dataKey={minKey} stroke="#0000ff" dot={false} name={`最小値`} />,
  ];

  const renderLines = (graphType) => {
    switch (graphType) {
      case 'air_avg':
        return renderAreaLine('air_avg', '気温avg', '#82c91e');
      case 'water_avg':
        return renderAreaLine('water_avg', '水温avg', '#00e0ff');
      case 'ec_corrected':
        return renderAreaLine('ec_corrected', 'EC値', '#f28b82');
      case 'air_all':
        return renderAll('air_avg', 'air_max', 'air_min', '気温', '#ffd700');
      case 'water_all':
        return renderAll('water_avg', 'water_max', 'water_min', '水温', '#ffd700');
      case 'ec_all':
        return renderAll('ec_corrected', 'ec_corrected_max', 'ec_corrected_min', 'EC', '#ffd700');
      default:
        return null;
    }
  };

  // ✅ X軸範囲を上段グラフの時間で統一
  const getTimeDomain = (data) => {
    if (!data || data.length === 0) return ['auto', 'auto'];
    const timestamps = data.map(d => d.timestamp.getTime());
    return [Math.min(...timestamps), Math.max(...timestamps)];
  };

  const timeDomain = getTimeDomain(dataAvg);

  return (
    <div className="bg-white dark:bg-gray-900 w-full min-h-screen h-screen text-gray-900 dark:text-white px-4 py-6 overflow-hidden">

      <div className="flex-1 flex justify-center items-center min-w-0">
        <button
          onClick={() => navigate('/hydro-sense/latest')}
          className="focus:outline-none active:scale-95 transition-transform"
          title="latest"
          style={{ background: 'none', border: 'none', padding: 0 }}
        >
          <img
            src={latestIcon}
            alt="グラフ表示"
            className="w-20 h-20 hover:opacity-80 hover:scale-105 transition-all"
          />
        </button>
        <img
          src={graphIcon}
          alt="グラフ"
          className="w-30 h-30 max-w-[80px] max-h-[80px] object-contain"
          style={{ minWidth: 80, minHeight: 80 }}
        />
      </div>

      {/* 上段グラフ選択 */}
      <div className="flex items-end gap-2 mb-2 px-0">
        <select
          value={graphTypeAvg}
          onChange={(e) => setGraphTypeAvg(e.target.value)}
          className="p-2 rounded bg-gray-800 text-white"
        >
          {AVG_GRAPH_OPTIONS.map(opt => (
            <option key={opt.key} value={opt.key}>{opt.label}</option>
          ))}
        </select>
        <select
          value={rangeAvg}
          onChange={(e) => setRangeAvg(e.target.value)}
          className="p-2 rounded bg-gray-800 text-white"
        >
          {RANGE_OPTIONS.map(opt => (
            <option key={opt.key} value={opt.key}>{opt.label}</option>
          ))}
        </select>
      </div>

      <div className="flex flex-col h-[calc(100vh-140px)] gap-4">
        {/* 上段グラフ */}
        <div className="bg-white dark:bg-gray-800 pt-0 pr-4 pb-4 pl-4 rounded-xl shadow-xl flex-1 min-h-0">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={dataAvg} margin={{ top: 0, right: 10, left: 0, bottom: 10 }}>
              <XAxis
                dataKey="timestamp"
                type="number"
                domain={timeDomain}
                scale="time"
                tickFormatter={(time) =>
                  dayjs(time).format("MM/DD HH:mm")
                }
                tick={{ fill: isDark ? "#e5e7eb" : "#374151", fontSize: 12 }}
              />
              <YAxis domain={['auto', 'auto']} width={50} />
              <Tooltip
                labelFormatter={(value) => dayjs(value).format("YYYY/MM/DD HH:mm")}
                contentStyle={{
                  backgroundColor: isDark ? '#222' : '#fff',
                  color: isDark ? '#fff' : '#222',
                  border: '1px solid #444'
                }}
                labelStyle={{
                  color: isDark ? '#fff' : '#222'
                }}
              />
              <Legend verticalAlign="top" align="right" />
              {renderLines(graphTypeAvg)}
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* 下段グラフ選択 */}
        <div className="flex items-end gap-2 mb-2 px-0">
          <select
            value={graphTypeAll}
            onChange={(e) => setGraphTypeAll(e.target.value)}
            className="p-2 rounded bg-gray-800 text-white"
          >
            {ALL_GRAPH_OPTIONS.map(opt => (
              <option key={opt.key} value={opt.key}>{opt.label}</option>
            ))}
          </select>
          <select
            value={viewAll}
            onChange={(e) => setViewAll(e.target.value)}
            className="p-2 rounded bg-gray-800 text-white"
          >
            {['10m', '1h', 'daily', 'monthly'].map(view => (
              <option key={view} value={view}>
                {view === '10m' ? '10分' :
                 view === '1h' ? '1時間' :
                 view === 'daily' ? '日次' : '月次'}
              </option>
            ))}
          </select>
        </div>

        {/* 下段グラフ */}
        <div className="bg-white dark:bg-gray-800 pt-0 pr-4 pb-4 pl-4 rounded-xl shadow-xl flex-1 min-h-0">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={dataAll} margin={{ top: 0, right: 10, left: 0, bottom: 10 }}>
              <XAxis
                dataKey="timestamp"
                type="number"
                domain={timeDomain}
                scale="time"
                tickFormatter={(time) =>
                  dayjs(time).format("MM/DD HH:mm")
                }
                tick={{ fill: isDark ? "#e5e7eb" : "#374151", fontSize: 12 }}
              />
              <YAxis domain={['auto', 'auto']} width={50} />
              <Tooltip
                labelFormatter={(value) => dayjs(value).format("YYYY/MM/DD HH:mm")}
                contentStyle={{
                  backgroundColor: isDark ? '#222' : '#fff',
                  color: isDark ? '#fff' : '#222',
                  border: '1px solid #444'
                }}
                labelStyle={{
                  color: isDark ? '#fff' : '#222'
                }}
              />
              <Legend verticalAlign="top" align="right" />
              {renderLines(graphTypeAll)}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
