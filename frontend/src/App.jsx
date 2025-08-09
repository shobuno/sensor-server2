// sensor-server/frontend/src/App.jsx
import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
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

export default function App() {
  return (
    <Routes>
      {/* 認証不要 */}
      <Route path="/login" element={<Login />} />
      <Route path="/verify-email" element={<VerifyEmail />} />

      {/* 認証必須 */}
      <Route path="/menu" element={<RequireAuth><Menu /></RequireAuth>} />
      <Route path="/admin" element={<RequireAuth role="admin"><AdminPage /></RequireAuth>} />

      {/* HydroSense（各ルートをRequireAuthで包む） */}
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

      {/* AutoMesh：親Layoutごと保護（配下は自動で保護される） */}
      <Route
        path="/auto-mesh"
        element={
          <RequireAuth>
            <AutoMeshLayout />
          </RequireAuth>
        }
      >
        <Route path="control"   element={<DeviceControl />} />
        <Route path="schedules" element={<ScheduleManager />} />
        <Route path="devices"   element={<DeviceManager />} />
        <Route path="*" element={<p className="p-4">ページが見つかりません</p>} />
      </Route>

      {/* fallback */}
      <Route path="*" element={<Navigate to="/menu" replace />} />
    </Routes>
  );
}
