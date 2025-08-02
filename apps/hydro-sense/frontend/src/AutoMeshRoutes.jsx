// sensor-server/frontend/src/AutoMeshRoutes.jsx

import React from 'react';
import DeviceControl from './pages/DeviceControl';

const autoMeshRoutes = [
  {
    path: 'control',
    element: <DeviceControl />
  },
  // 必要であれば今後追加
];

export default autoMeshRoutes;
