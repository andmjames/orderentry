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
  const [order, setOrder] = useState(null);
  const [autoFile, setAutoFile] = useState(null);

  useEffect(() => {
    fetchAllCustomers()
      .then(d => setCustomers(Array.isArray(d) ? d : []))
      .catch(e => setCustError(e.message || 'Failed to load customers'))
      .finally(() => setCustLoading(false));
  }, []);

  // Once customers are loaded, check for ?po_file= and fetch the file
  useEffect(() => {
    if (custLoading) return;
    const params = new URLSearchParams(window.location.search);
    const poFileUrl = params.get('po_file');
    if (!poFileUrl) return;

    fetch(poFileUrl)
      .then(res => {
        if (!res.ok) throw new Error('Could not fetch PO file');
        return res.blob();
      })
      .then(blob => {
        const urlPath = new URL(poFileUrl).pathname;
        const fileName = decodeURIComponent(urlPath.split('/').pop() || 'purchase-order');
        const file = new File([blob], fileName, { type: blob.type || 'application/octet-stream' });
        setAutoFile(file);
      })
      .catch(err => console.error('Auto-load po_file failed:', err));
  }, [custLoading]);

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
                autoFile={autoFile}
              />
            ) : (
              <OrderReview
                analysis={order.analysis}
                fileName={order.fileName}
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
