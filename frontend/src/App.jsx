// sensor-server/frontend/src/App.jsx

import React from 'react';
import { Routes, Route, Navigate, Outlet } from 'react-router-dom';

import Login from './pages/Login';
import Menu from './pages/Menu';
import AdminPage from './pages/AdminPage';
import VerifyEmail from './pages/VerifyEmail';
import RequireAuth from './RequireAuth';

import hydroSenseRoutes from '@hydro-sense/HydroSenseRoutes';
import AutoMeshLayout from '@auto-mesh/AutoMeshLayout';
import DeviceControl from '@auto-mesh/pages/DeviceControl';
import ScheduleManager from '@auto-mesh/pages/ScheduleManager';
import DeviceManager from '@auto-mesh/pages/DeviceManager';
import TopBar from './components/TopBar';
// import FeatureGate from './components/FeatureGate'; // 使っていなければ一旦コメントアウト

// ✅ Todo
import TodoPage from '@todo/pages/TodoPage.jsx';
import TodoDailyReport from '@todo/pages/TodoDailyReport.jsx';

function TodoLayout() {
  return (
    <>
      <TopBar title="Todo" />
      <Outlet />
    </>
  );
}

export default function App() {
  return (
    <Routes>
      {/* 認証不要 */}
      <Route path="/login" element={<Login />} />
      <Route path="/verify-email" element={<VerifyEmail />} />

      {/* メニュー/管理 */}
      <Route path="/menu" element={<RequireAuth><Menu /></RequireAuth>} />
      <Route path="/admin" element={<RequireAuth role="admin"><AdminPage /></RequireAuth>} />

      {/* HydroSense */}
      <Route path="/hydro-sense" element={<Navigate to="/hydro-sense/menu" replace />} />
      {hydroSenseRoutes.map((route, i) => (
        <Route
          key={`hydro-${i}`}
          path={`/hydro-sense/${route.path}`}
          element={
            <RequireAuth>
              <>
                <TopBar title="Hydro Sense" />
                {route.element}
              </>
            </RequireAuth>
          }
        />
      ))}

      {/* AutoMesh */}
      <Route
        path="/auto-mesh"
        element={
          <RequireAuth>
            <AutoMeshLayout />
          </RequireAuth>
        }
      >
        <Route index element={<Navigate to="control" replace />} />
        <Route path="control"   element={<DeviceControl />} />
        <Route path="schedules" element={<ScheduleManager />} />
        <Route path="devices"   element={<DeviceManager />} />
        <Route path="*" element={<p className="p-4">ページが見つかりません</p>} />
      </Route>

      {/* Todo */}
      <Route path="/todo/today/*" element={<Navigate to="/todo" replace />} />
      <Route
        path="/todo"
        element={
          <RequireAuth feature="todo">
            <TodoLayout />
          </RequireAuth>
        }
      >
        <Route index element={<TodoPage />} />
        <Route path="daily-report" element={<TodoDailyReport />} />
        {/* 必要になったらサブルートを追加:
        <Route path="close" element={<TodayCloseView />} />
        <Route path="add"   element={<TodoAdd />} />
        */}
      </Route>

      {/* フォールバック */}
      <Route path="*" element={<Navigate to="/menu" replace />} />
    </Routes>
  );
}
