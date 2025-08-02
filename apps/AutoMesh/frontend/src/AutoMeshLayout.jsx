// sensor-server/apps/AutoMesh/frontend/src/AutoMeshLayout.jsx

import { Outlet, NavLink } from 'react-router-dom';

export default function AutoMeshLayout() {
  const baseClass = "text-sm sm:text-base font-medium transition px-1";
  const inactiveClass = "text-gray-500 hover:text-blue-600";
  const activeClass = "text-blue-600 border-b-2 border-blue-500";

  return (
    <>
      <nav className="p-4 bg-white dark:bg-gray-900 shadow mb-4 space-x-6 border-b dark:border-gray-700">
        <NavLink to="control" className={({ isActive }) => `${baseClass} ${isActive ? activeClass : inactiveClass}`}>制御</NavLink>
        <NavLink to="schedules" className={({ isActive }) => `${baseClass} ${isActive ? activeClass : inactiveClass}`}>スケジュール</NavLink>
        <NavLink to="devices" className={({ isActive }) => `${baseClass} ${isActive ? activeClass : inactiveClass}`}>デバイス登録</NavLink>
      </nav>
      <Outlet />
    </>
  );
}
