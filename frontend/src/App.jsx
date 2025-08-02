// sensor-server/frontend/src/App.jsx

// App.jsx

import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Menu from './pages/Menu';
import AdminPage from './pages/AdminPage';
import VerifyEmail from './pages/VerifyEmail';

import hydroSenseRoutes from '@hydro-sense/HydroSenseRoutes';
import AutoMeshLayout from '@auto-mesh/AutoMeshLayout';
import DeviceControl from '@auto-mesh/pages/DeviceControl';
import ScheduleManager from '@auto-mesh/pages/ScheduleManager';
import DeviceManager from '@auto-mesh/pages/DeviceManager';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/verify-email" element={<VerifyEmail />} />
      <Route path="/menu" element={<Menu />} />
      <Route path="/admin" element={<AdminPage />} />

      {/* HydroSense */}
      <Route path="/hydro-sense" element={<Navigate to="/hydro-sense/menu" replace />} />
      {hydroSenseRoutes.map((route, i) => (
        <Route
          key={`hydro-${i}`}
          path={`/hydro-sense/${route.path}`}
          element={route.element}
        />
      ))}

      {/* ✅ AutoMesh: Layout + nested routes */}
      <Route path="/auto-mesh" element={<AutoMeshLayout />}>
        <Route path="control" element={<DeviceControl />} />
        <Route path="schedules" element={<ScheduleManager />} />
        <Route path="devices" element={<DeviceManager />} />
        <Route path="*" element={<p className="p-4 text-gray-900 dark:text-gray-100">ページが見つかりません</p>} />
      </Route>

      {/* fallback */}
      <Route path="*" element={<Navigate to="/menu" />} />
    </Routes>
  );
}
