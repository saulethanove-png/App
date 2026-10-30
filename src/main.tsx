import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { AppStoreProvider } from './store/AppStore';
import { ToastProvider } from './store/Toasts';
import { CloudProvider } from './store/Cloud';
import { Gate } from './Gate';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ToastProvider>
      <AppStoreProvider>
        <CloudProvider>
          <Gate>
            <App />
          </Gate>
        </CloudProvider>
      </AppStoreProvider>
    </ToastProvider>
  </React.StrictMode>,
);
