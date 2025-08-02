// sensor-server/frontend/src/HydroSenseRoutes.jsx

import EcValidationForm from "./pages/EcValidationForm";
import LatestData from "./pages/LatestData";
import GraphDisplay from "./pages/GraphDisplay";
import EcCorrectionForm from "./components/EcCorrectionForm";

const hydroSenseRoutes = [
  { path: "ec-validation", element: <EcValidationForm /> },
  { path: "ec-correction", element: <EcCorrectionForm /> },
  { path: "latest", element: <LatestData /> },
  { path: "graph", element: <GraphDisplay /> },
  {
    path: "*",
    element: <p className="p-4 text-gray-900 dark:text-gray-100">ページが見つかりません</p>,
  },
];

export default hydroSenseRoutes;
