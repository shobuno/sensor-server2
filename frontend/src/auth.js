// sensor-server/frontend/src/auth.js

// tokenの取得と検証
export function getToken() {
  const token = localStorage.getItem('token');
  console.log("🟢 getToken() =", token);
  return token;
}


export function isLoggedIn() {
  return !!getToken();
}

export function logout() {
  localStorage.removeItem('token');
}
