// sensor-server/frontend/src/components/TopBar.jsx

import { useNavigate } from 'react-router-dom';
import { logout } from '@/auth';

export default function TopBar({ title }) {
  const navigate = useNavigate();
  return (
    <div className="sticky top-0 z-40 flex items-center justify-between px-4 py-2 bg-white/95 dark:bg-gray-800/95 backdrop-blur shadow">
      <button
        onClick={() => navigate('/menu')}
        className="px-3 py-1 rounded bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600"
      >
        ← メニュー
      </button>
      <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{title}</h1>
      {/* 右側の空白（レイアウトバランス用） */}
      
        <button
        onClick={() => { logout(); }}
        className="px-3 py-1 rounded bg-red-500 text-white hover:opacity-90"
        >
        ログアウト
        </button>

    </div>
  );
}
