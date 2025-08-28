// sensor-server/apps/todo/frontend/src/main.jsx

import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
import "./index.css"; // Tailwind等を使うなら

// /todo 配下で配信するので basename="/todo" を付けておくとルーティングが安定
createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter basename="/todo">
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
