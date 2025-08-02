// sensor-server/apps/AutoMesh/frontend/src/AutoMeshRoutes.jsx

import React from 'react';
import DeviceControl from './pages/DeviceControl';
import ScheduleManager from './pages/ScheduleManager';
import DeviceManager from './pages/DeviceManager';

export default [
  {
    path: 'control',
    element: <DeviceControl />
  },
  {
    path: 'schedules',
    element: <ScheduleManager />
  },
  {
    path: 'devices',
    element: <DeviceManager />
  },
  {
    path: '*',
    element: (
      <p className="p-4 text-gray-900 dark:text-gray-100">
        ページが見つかりません
      </p>
    )
  }
];

