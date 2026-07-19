import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Capacitor } from '@capacitor/core';

import './index.css';
import App from './App.jsx';
import { RUTA_INICIO } from './lib/identidad';

// La app nativa arranca directa en la pantalla de trabajo, sin landing.
if (Capacitor.isNativePlatform() && window.location.pathname === '/') {
  window.history.replaceState(null, '', RUTA_INICIO);
}

// Clase por plataforma, para ajustar por CSS el hueco de la barra de estado.
if (Capacitor.isNativePlatform()) {
  document.documentElement.classList.add('cap-' + Capacitor.getPlatform());
}

// Sin Supabase la app no arranca. Mejor un mensaje claro que una pantalla en
// blanco: este error solo lo ve quien compila mal, no un dueño de salón.
const faltan = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'].filter(
  (k) => !import.meta.env[k],
);
if (faltan.length) {
  const root = document.getElementById('root');
  const d = document.createElement('div');
  d.style.cssText =
    'display:flex;align-items:center;justify-content:center;height:100vh;' +
    'background:#211D17;color:#F2EDE4;font-family:sans-serif;padding:24px;text-align:center';
  d.textContent = 'Error de configuración: faltan ' + faltan.join(', ');
  root.appendChild(d);
  throw new Error('Variables de entorno faltantes: ' + faltan.join(', '));
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
