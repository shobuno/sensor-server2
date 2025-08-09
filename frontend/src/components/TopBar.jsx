// sensor-server/frontend/src/components/TopBar.jsx

import { useNavigate } from 'react-router-dom';

export default function TopBar({ title }) {
  const navigate = useNavigate();
  return (
    <div className="flex items-center justify-between px-4 py-2 bg-white dark:bg-gray-800 shadow">
      <button
        onClick={() => navigate('/menu')}
        className="px-3 py-1 rounded bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600"
      >
        ← メニュー
      </button>
      <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{title}</h1>
      {/* 右側の空白（レイアウトバランス用） */}
      <div className="w-20" />
    </div>
  );
}
