// sensor-server/apps/todo/frontend/src/components/RequireAuth.jsx

import { Navigate, useLocation } from "react-router-dom";

function parseJwt(t) {
  try { return JSON.parse(atob(t.split(".")[1])); } catch { return null; }
}
function isExpired(token) {
  const p = parseJwt(token);
  if (!p?.exp) return true;
  const now = Math.floor(Date.now() / 1000);
  const skew = 30; // 30秒の時計ズレ許容
  return now >= (p.exp - skew);
}

export default function RequireAuth({ children, loginPath = "/login" }) {
  const token = localStorage.getItem("token");
  const loc = useLocation();

  if (!token || isExpired(token)) {
    return (
      <Navigate
        to={loginPath}
        replace
        state={{ from: loc.pathname + loc.search }}
      />
    );
  }
  return children;
}
