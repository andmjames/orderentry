import React, { useState, useEffect } from 'react';
import PoUpload from './components/PoUpload';
import OrderReview from './components/OrderReview';
import SetupBanner from './components/SetupBanner';
import ErrorBoundary from './components/ErrorBoundary';
import { ToastProvider } from './components/Toast';
import { fetchAllCustomers } from './lib/zoho';
import { LOGO_SRC } from './logo';
import './App.css';

export default function App() {
  const [customers, setCustomers] = useState([]);
  const [custLoading, setCustLoading] = useState(true);
  const [custError, setCustError] = useState(null);
  const [order, setOrder] = useState(null); // { analysis, fileName }

  useEffect(() => {
    fetchAllCustomers()
      .then(d => setCustomers(Array.isArray(d) ? d : []))
      .catch(e => setCustError(e.message || 'Failed to load customers'))
      .finally(() => setCustLoading(false));
  }, []);

  return (
    <ErrorBoundary>
      <ToastProvider>
        <div className="app">
          <header className="app-header">
            <div className="header-inner">
              <img src={LOGO_SRC} alt="PMI Tape" className="header-logo" />
              <span className="header-divider" />
              <span className="header-page-title">Order Entry</span>
            </div>
          </header>

          <SetupBanner />

          <main className="app-main">
            {!order ? (
              <PoUpload
                customers={customers}
                customersLoading={custLoading}
                customersError={custError}
                onAnalyzed={setOrder}
              />
            ) : (
              <OrderReview
                analysis={order.analysis}
                fileName={order.fileName}
                poFile={{ base64: order.fileBase64, mediaType: order.mediaType, fileName: order.fileName }}
                customers={customers}
                onBack={() => setOrder(null)}
              />
            )}
          </main>
        </div>
      </ToastProvider>
    </ErrorBoundary>
  );
}
