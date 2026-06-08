import React from 'react';

export default function PricingAppModal({ url, customerName, onClose }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal"
        style={{ maxWidth: '95vw', width: '95vw', height: '90vh', display: 'flex', flexDirection: 'column' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="modal-header">
          <div className="modal-title">
            Customer Pricing{customerName ? ` — ${customerName}` : ''}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <a href={url} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: 'var(--text2)', textDecoration: 'none' }}>
              Open in new tab ↗
            </a>
            <button className="modal-close" onClick={onClose} title="Close">✕</button>
          </div>
        </div>

        <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
          <iframe
            title="Customer Pricing App"
            src={url}
            style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
          />
        </div>

        <div style={{ padding: '8px 1.25rem', borderTop: '.5px solid var(--border)', fontSize: 11.5, color: 'var(--text3)', lineHeight: 1.5 }}>
          Changes you make here are saved straight to your pricing database. When you close this window, the items and prices below will refresh.
          If the panel is blank, use “Open in new tab.”
        </div>
      </div>
    </div>
  );
}
