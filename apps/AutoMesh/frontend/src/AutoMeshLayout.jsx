// sensor-server/apps/AutoMesh/frontend/src/AutoMeshLayout.jsx
import { Outlet, NavLink, useNavigate } from 'react-router-dom';

export default function AutoMeshLayout() {
  const navigate = useNavigate();
  const baseClass = "text-sm sm:text-base font-medium transition px-1";
  const inactiveClass = "text-gray-500 hover:text-blue-600 dark:hover:text-blue-400";
  const activeClass = "text-blue-600 dark:text-blue-400 border-b-2 border-blue-500";

  return (
    <>
      {/* 上部固定ナビ */}
      <nav className="sticky top-0 z-40 bg-white/95 dark:bg-gray-900/95 backdrop-blur border-b dark:border-gray-700">
        <div className="mx-auto max-w-6xl px-4">
          {/* 1段目：メニュー戻る＋タイトル */}
          <div className="flex items-center gap-3 py-3">
            <button
              onClick={() => navigate('/menu')}
              className="px-3 py-1 rounded bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600"
            >
              ← メニュー
            </button>
            <div className="flex-1 text-center font-semibold text-gray-900 dark:text-gray-100">
              AutoMesh
            </div>
            <div className="w-24" />
          </div>

          {/* 2段目：タブ */}
          <div className="flex items-center gap-6 pb-2">
            <NavLink to="control"   className={({ isActive }) => `${baseClass} ${isActive ? activeClass : inactiveClass}`}>制御</NavLink>
            <NavLink to="schedules" className={({ isActive }) => `${baseClass} ${isActive ? activeClass : inactiveClass}`}>スケジュール</NavLink>
            <NavLink to="devices"   className={({ isActive }) => `${baseClass} ${isActive ? activeClass : inactiveClass}`}>デバイス登録</NavLink>
          </div>
        </div>
      </nav>

      {/* 本文 */}
      <div className="mx-auto max-w-6xl px-4">
        <Outlet />
      </div>
    </>
  );
}
