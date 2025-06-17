// apps/hydro-sense/frontend/src/main.jsx

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import './index.css';
import './tailwind-keep.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter basename="/hydro-sense">
      <App />
    </BrowserRouter>
  </StrictMode>,
);
