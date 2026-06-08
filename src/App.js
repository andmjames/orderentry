import React, { useState, useEffect, useRef } from 'react';
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

  // Ref to PoUpload's handleFile — populated via the onReady prop
  const handleFileRef = useRef(null);
  // Track whether we've already auto-triggered the po_file param
  const autoTriggered = useRef(false);

  useEffect(() => {
    fetchAllCustomers()
      .then(d => setCustomers(Array.isArray(d) ? d : []))
      .catch(e => setCustError(e.message || 'Failed to load customers'))
      .finally(() => setCustLoading(false));
  }, []);

  // Once customers are loaded AND PoUpload is ready AND we haven't triggered yet,
  // check for ?po_file= in the URL and auto-process it
  useEffect(() => {
    if (custLoading) return;               // wait for customers first
    if (autoTriggered.current) return;     // only run once
    if (!handleFileRef.current) return;   // wait for PoUpload to mount

    const params = new URLSearchParams(window.location.search);
    const poFileUrl = params.get('po_file');
    if (!poFileUrl) return;

    autoTriggered.current = true;

    // Fetch the file from Supabase Storage and hand it to PoUpload
    (async () => {
      try {
        const response = await fetch(poFileUrl);
        if (!response.ok) throw new Error(`Could not fetch PO file (${response.status})`);

        const blob = await response.blob();

        // Derive a filename from the URL
        const urlPath = new URL(poFileUrl).pathname;
        const rawName = urlPath.split('/').pop() || 'purchase-order';
        // URL-decode it (timestamps + underscores are fine; %20 etc. get cleaned up)
        const fileName = decodeURIComponent(rawName);

        const file = new File([blob], fileName, { type: blob.type || 'application/octet-stream' });
        handleFileRef.current(file);
      } catch (err) {
        console.error('Auto-load po_file failed:', err);
        // Non-fatal — the upload UI is still visible so the user can upload manually
      }
    })();
  }, [custLoading, custError]); // re-evaluate when customer load state changes

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
                onReady={fn => { handleFileRef.current = fn; }}
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
