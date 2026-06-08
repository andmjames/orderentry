import React, { useState, useRef, useEffect } from 'react';
import { analyzePo } from '../lib/zoho';

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = () => reject(new Error('Could not read file'));
    reader.readAsDataURL(file);
  });
}

const ACCEPT = '.pdf,image/png,image/jpeg,image/webp,image/gif,application/pdf';

export default function PoUpload({ customers, customersLoading, customersError, onAnalyzed, onReady }) {
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState('');
  const [error, setError] = useState(null);
  const [fileName, setFileName] = useState('');
  const inputRef = useRef(null);

  async function handleFile(file) {
    if (!file) return;
    setError(null);
    setFileName(file.name);

    const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
    const isImg = /^image\//.test(file.type) || /\.(png|jpe?g|webp|gif)$/i.test(file.name);

    // .txt files (email body captures) are also valid — treat as plain text PO
    const isTxt = file.type === 'text/plain' || /\.txt$/i.test(file.name);

    if (!isPdf && !isImg && !isTxt) {
      setError('Please upload a PDF, image (PNG, JPG, WEBP), or text file.');
      return;
    }

    setBusy(true);
    setStage('Reading file…');
    try {
      const fileBase64 = await fileToBase64(file);
      const mediaType = isPdf
        ? 'application/pdf'
        : isTxt
          ? 'text/plain'
          : (file.type || 'image/png');
      setStage('Analyzing purchase order with Claude…');
      const analysis = await analyzePo({ fileBase64, mediaType, customers });
      onAnalyzed({ analysis, fileName: file.name });
    } catch (e) {
      setError(e.message || 'Analysis failed');
    } finally {
      setBusy(false);
      setStage('');
    }
  }

  // Expose handleFile to parent (App.js) so it can trigger auto-load from ?po_file=
  useEffect(() => {
    if (onReady) onReady(handleFile);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customers]); // re-expose when customers list updates so analyzePo gets fresh data

  function onDrop(e) {
    e.preventDefault();
    setDrag(false);
    if (busy) return;
    handleFile(e.dataTransfer.files?.[0]);
  }

  return (
    <div style={{ maxWidth: 640, margin: '2rem auto 0' }}>
      <div className="section">
        <div className="section-header">
          <div className="section-title">
            <span className="section-title-dot" />
            Upload Purchase Order
          </div>
          {!customersLoading && !customersError && (
            <span style={{ fontSize: 11, color: 'var(--text3)' }}>{customers.length} customers loaded</span>
          )}
        </div>

        <div className="section-body">
          {customersError ? (
            <div style={{ background: 'var(--red-bg)', border: '.5px solid rgba(163,45,45,.2)', borderRadius: 'var(--radius)', padding: '10px 14px', color: 'var(--danger)', fontSize: 13, lineHeight: 1.5 }}>
              <strong>Could not load customers from Zoho:</strong> {customersError}
            </div>
          ) : busy ? (
            <div className="loading-state" style={{ padding: '3rem 1rem', flexDirection: 'column' }}>
              <div className="spinner" style={{ width: 22, height: 22, borderWidth: 2.5 }} />
              <div style={{ marginTop: 12, fontSize: 13, color: 'var(--text)' }}>{stage}</div>
              {fileName && <div style={{ marginTop: 4, fontSize: 12, color: 'var(--text3)' }}>{fileName}</div>}
            </div>
          ) : (
            <>
              <div
                className={`dropzone ${drag ? 'drag' : ''}`}
                onClick={() => inputRef.current?.click()}
                onDragOver={e => { e.preventDefault(); setDrag(true); }}
                onDragLeave={() => setDrag(false)}
                onDrop={onDrop}
              >
                <svg className="dropzone-icon" viewBox="0 0 24 24" fill="none">
                  <path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M4 16v2.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V16" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
                <div className="dropzone-title">Drop a customer PO here</div>
                <div className="dropzone-sub">or click to browse — PDF or image</div>
              </div>
              <input
                ref={inputRef}
                type="file"
                accept={ACCEPT}
                style={{ display: 'none' }}
                onChange={e => handleFile(e.target.files?.[0])}
              />
              {customersLoading && (
                <div style={{ marginTop: 12, fontSize: 12, color: 'var(--text3)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div className="spinner" style={{ width: 12, height: 12 }} /> Loading customer list from Zoho…
                </div>
              )}
            </>
          )}

          {error && (
            <div style={{ marginTop: 14, background: 'var(--red-bg)', border: '.5px solid rgba(163,45,45,.2)', borderRadius: 'var(--radius)', padding: '10px 14px', color: 'var(--danger)', fontSize: 13, lineHeight: 1.5 }}>
              {error}
            </div>
          )}
        </div>
      </div>

      <p style={{ marginTop: 14, fontSize: 12, color: 'var(--text3)', textAlign: 'center', lineHeight: 1.6 }}>
        Claude reads the PO, identifies the customer, and matches items to that
        customer's price list. Pricing on the PO is ignored — your contract pricing is applied.
      </p>
    </div>
  );
}
