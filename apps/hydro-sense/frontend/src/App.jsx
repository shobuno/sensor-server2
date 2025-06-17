// App.jsx
import { Routes, Route, Navigate } from "react-router-dom";
import { useState } from "react";

import Login from "./pages/Login";
import Menu from "./pages/Menu";
import EcValidationForm from "./pages/EcValidationForm";
import LatestData from "./pages/LatestData";
import GraphDisplay from "./pages/GraphDisplay";
import EcCorrectionForm from "@/components/EcCorrectionForm";

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  return (
    <Routes>
      <Route path="/" element={<Login onLogin={() => setIsLoggedIn(true)} />} />
      <Route path="/menu" element={isLoggedIn ? <Menu /> : <Navigate to="/" />} />
      <Route path="/ec-validation" element={isLoggedIn ? <EcValidationForm /> : <Navigate to="/" />} />
      <Route path="/latest" element={<LatestData />} />
      <Route path="/graph" element={<GraphDisplay />} />
      <Route path="/ec-correction" element={isLoggedIn ? <EcCorrectionForm /> : <Navigate to="/" />} />
    </Routes>
  );
}

export default App;
