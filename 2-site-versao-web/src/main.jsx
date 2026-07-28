import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';

// Limpa automaticamente caches e service workers travados do PWA em ambiente de desenvolvimento (localhost)
if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      if (registrations.length > 0) {
        for (const registration of registrations) {
          registration.unregister();
        }
        if ('caches' in window) {
          caches.keys().then((keys) => {
            Promise.all(keys.map((key) => caches.delete(key))).then(() => {
              window.location.reload();
            });
          });
        } else {
          window.location.reload();
        }
      }
    });
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
