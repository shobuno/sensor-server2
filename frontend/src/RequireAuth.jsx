// sensor-server/frontend/src/RequireAuth.jsx
import { Navigate, useLocation } from 'react-router-dom';
import { getToken, getRole } from './auth';

export default function RequireAuth({ children, role }) {
  const token = getToken();
  const userRole = getRole();
  const location = useLocation();

  // 未ログインなら即リダイレクト
  if (!token) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  // role指定があって一致しなければメニューへ
  if (role && userRole !== role) {
    return <Navigate to="/menu" replace />;
  }

  return children;
}
