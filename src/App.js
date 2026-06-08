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
    const CACHE_KEY = 'pmi_customers_cache_v1';
    const TTL_MS = 15 * 60 * 1000; // reuse the customer list for 15 minutes

    const readCache = () => {
      try {
        const raw = localStorage.getItem(CACHE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed.data) || !parsed.data.length) return null;
        return parsed; // { ts, data }
      } catch { return null; }
    };
    const writeCache = (data) => {
      try { localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data })); } catch { /* storage disabled */ }
    };

    const cached = readCache();
    // Fresh cache → use it and skip the Zoho call entirely (no token request).
    if (cached && Date.now() - cached.ts < TTL_MS) {
      setCustomers(cached.data);
      setCustLoading(false);
      return;
    }
    // Stale cache → show it immediately, then refresh in the background.
    if (cached) { setCustomers(cached.data); setCustLoading(false); }

    fetchAllCustomers()
      .then(d => {
        const arr = Array.isArray(d) ? d : [];
        setCustomers(arr);
        if (arr.length) writeCache(arr);
      })
      .catch(e => {
        // If Zoho is busy/rate-limited but we have a cached list, keep using it.
        if (!cached) setCustError(e.message || 'Failed to load customers');
      })
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
