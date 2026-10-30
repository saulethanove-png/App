import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { AppStoreProvider } from './store/AppStore';
import { ToastProvider } from './store/Toasts';
import { CloudProvider } from './store/Cloud';
import { ContentProvider } from './store/Content';
import { Gate } from './Gate';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ToastProvider>
      <AppStoreProvider>
        <CloudProvider>
          <ContentProvider>
          <Gate>
            <App />
          </Gate>
          </ContentProvider>
        </CloudProvider>
      </AppStoreProvider>
    </ToastProvider>
  </React.StrictMode>,
);
