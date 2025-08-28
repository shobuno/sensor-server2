
// apps/hydro-sense/frontend/src/pages/LatestData.jsx
import { useNavigate, useLocation } from 'react-router-dom';
import { useEffect } from 'react';

export default function LatestData() {
  const navigate = useNavigate();
  const location = useLocation();
  // console.log("✅ LatestData コンポーネント内: useNavigate呼び出し OK");

  useEffect(() => {
    //console.log("✅ location.pathname =", location.pathname);
  }, [location]);

  return <div>LatestData 表示中</div>;
}
