import React from 'react';
import { money } from '../lib/order';

function Metric({ label, value, sub }) {
  return (
    <div className="metric">
      <div className="metric-label">{label}</div>
      <div className="metric-value">
        {value}{sub && <small> {sub}</small>}
      </div>
    </div>
  );
}

export default function OrderSummary({ totals, shipping, currency, methodOverride, onMethodChange }) {
  return (
    <div className="section">
      <div className="section-header">
        <div className="section-title">
          <span className="section-title-dot" />
          Order Summary
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, color: 'var(--text3)' }}>Method</span>
          <select
            className="field-input"
            style={{ width: 'auto', padding: '5px 8px', fontSize: 12 }}
            value={methodOverride || 'auto'}
            onChange={e => onMethodChange(e.target.value === 'auto' ? null : e.target.value)}
          >
            <option value="auto">Auto (by weight)</option>
            <option value="freight">Force freight</option>
            <option value="parcel">Force parcel</option>
          </select>
        </div>
      </div>

      <div className="section-body">
        <div className="metric-grid">
          <Metric label="No. of Cases on Order" value={totals.cases} />
          <Metric label="No. of Pallets" value={shipping.pallets} />
          <Metric
            label="Freight Charge"
            value={money(shipping.freightCharge, currency)}
            sub={shipping.hasAccount ? '(acct on file)' : ''}
          />
          <Metric
            label="Shipping Method"
            value={shipping.shippingMethod}
            sub={`(${shipping.methodType})`}
          />
          <Metric
            label="Weight (lb)"
            value={shipping.weight.toLocaleString('en-US')}
            sub={shipping.palletWeight ? `(incl. ${shipping.palletWeight} lb pallets)` : ''}
          />
          <Metric
            label="Shipping Account"
            value={shipping.shippingAccount
              ? shipping.shippingAccount
              : <span style={{ color: 'var(--text3)', fontWeight: 500, fontSize: 13 }}>None on file</span>}
          />
        </div>

        <div style={{ marginTop: 10, fontSize: 11.5, color: 'var(--text3)', lineHeight: 1.6 }}>
          {shipping.chargeBasis}
          {shipping.methodType === 'freight' && shipping.palletWeight > 0 && (
            <> · {shipping.baseWeight} lb product + {shipping.palletWeight} lb pallets</>
          )}
        </div>
      </div>
    </div>
  );
}
