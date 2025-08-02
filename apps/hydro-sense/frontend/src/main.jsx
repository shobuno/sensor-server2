// sensor-server/apps/hydro-sense/frontend/src/index.jsx

import React from "react";
import ReactDOM from "react-dom/client";
import App from "@/App.jsx";       // ✅ 共通Appを@経由で読み込み
import "@/index.css";             // ✅ 共通CSSも同様に

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
