// AutoMesh/frontend/src/App.jsx

import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom';
import ScheduleManager from './pages/ScheduleManager';
import DeviceControl from './pages/DeviceControl';
import DeviceManager from "./pages/DeviceManager";

export default function App() {
  const baseClass = "text-sm sm:text-base font-medium transition px-1";
  const inactiveClass = "text-gray-500 hover:text-blue-600";
  const activeClass = "text-blue-600 border-b-2 border-blue-500";

  return (
    <BrowserRouter basename="/auto-mesh">
      <nav className="p-4 bg-white dark:bg-gray-900 shadow mb-4 space-x-6 border-b dark:border-gray-700">
        <NavLink
          to="/control"
          className={({ isActive }) =>
            `${baseClass} ${isActive ? "text-blue-600 border-b-2 border-blue-500 dark:text-blue-400 dark:border-blue-400" : "text-gray-500 hover:text-blue-600 dark:text-gray-300 dark:hover:text-blue-400"}`
          }
        >
          制御
        </NavLink>
        <NavLink
          to="/schedules"
          className={({ isActive }) =>
            `${baseClass} ${isActive ? "text-blue-600 border-b-2 border-blue-500 dark:text-blue-400 dark:border-blue-400" : "text-gray-500 hover:text-blue-600 dark:text-gray-300 dark:hover:text-blue-400"}`
          }
        >
          スケジュール
        </NavLink>
        <NavLink
          to="/devices"
          className={({ isActive }) =>
            `${baseClass} ${isActive ? "text-blue-600 border-b-2 border-blue-500 dark:text-blue-400 dark:border-blue-400" : "text-gray-500 hover:text-blue-600 dark:text-gray-300 dark:hover:text-blue-400"}`
          }
        >
          デバイス登録
        </NavLink>
      </nav>

      <Routes>
        <Route path="/control" element={<DeviceControl />} />
        <Route path="/schedules" element={<ScheduleManager />} />
        <Route path="/devices" element={<DeviceManager />} />
        <Route path="*" element={<p className="p-4 text-gray-900 dark:text-gray-100">ページが見つかりません</p>} />
      </Routes>
    </BrowserRouter>
  );
}
