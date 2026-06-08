import React from 'react';
import { money, currencySymbol } from '../lib/order';

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

export default function OrderSummary({
  totals, shipping, currency, methodOverride, onMethodChange,
  freightValue, freightCalculated, freightOverridden, onFreightChange, onFreightReset,
  methodValue, methodOverridden, onMethodNameChange, onMethodNameReset,
  accountValue, accountOverridden, onAccountChange, onAccountReset,
}) {
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
          <div className="metric">
            <div className="metric-label">No. of Cases on Order</div>
            <div className="metric-value">{totals.cases}</div>
            <div className="metric-label" style={{ marginTop: 12 }}>No. of Cases for Free Freight</div>
            <div className="metric-value">
              {shipping.freeFreightThreshold > 0
                ? shipping.freeFreightThreshold
                : <span style={{ color: 'var(--text3)', fontWeight: 500, fontSize: 13 }}>—</span>}
            </div>
          </div>
          <Metric label="No. of Pallets" value={shipping.pallets} />

          {/* Editable Freight Charge — defaults to the calculated value */}
          <div className="metric">
            <div className="metric-label">Freight Charge</div>
            <div className="metric-value" style={{ display: 'flex', alignItems: 'baseline', gap: 2 }}>
              <span>{currencySymbol(currency)}</span>
              <input
                className="ot-edit"
                type="number" min="0" step="0.01"
                style={{ width: 90, textAlign: 'left', fontSize: 18, fontWeight: 600, padding: '2px 4px' }}
                value={freightValue}
                onChange={e => onFreightChange(e.target.value === '' ? 0 : parseFloat(e.target.value))}
              />
            </div>
            <div style={{ fontSize: 10.5, color: 'var(--text3)', marginTop: 3 }}>
              {freightOverridden ? (
                <>manual · calc {money(freightCalculated, currency)} ·{' '}
                  <span onClick={onFreightReset} style={{ color: 'var(--text2)', textDecoration: 'underline', cursor: 'pointer' }}>reset</span>
                </>
              ) : (
                shipping.hasAccount ? 'auto · acct on file' : 'auto'
              )}
            </div>
          </div>

          <div className="metric">
            <div className="metric-label">Shipping Method</div>
            <div className="metric-value">
              <input
                className="ot-edit"
                type="text"
                style={{ width: '100%', textAlign: 'left', fontSize: 15, fontWeight: 600, padding: '3px 6px' }}
                value={methodValue}
                onChange={e => onMethodNameChange(e.target.value)}
              />
            </div>
            <div style={{ fontSize: 10.5, color: 'var(--text3)', marginTop: 3 }}>
              ({shipping.methodType})
              {methodOverridden && <> · manual ·{' '}
                <span onClick={onMethodNameReset} style={{ color: 'var(--text2)', textDecoration: 'underline', cursor: 'pointer' }}>reset</span>
              </>}
            </div>
          </div>
          <Metric
            label="Weight (lb)"
            value={shipping.weight.toLocaleString('en-US')}
            sub={shipping.palletWeight ? `(incl. ${shipping.palletWeight} lb pallets)` : ''}
          />
          <div className="metric">
            <div className="metric-label">Shipping Account</div>
            <div className="metric-value">
              <input
                className="ot-edit"
                type="text"
                style={{ width: '100%', textAlign: 'left', fontSize: 15, fontWeight: 600, padding: '3px 6px' }}
                value={accountValue}
                placeholder={shipping.freeFreight ? 'Not used (free freight)' : (shipping.shippingAccount ? '' : 'None on file')}
                onChange={e => onAccountChange(e.target.value)}
              />
            </div>
            <div style={{ fontSize: 10.5, color: 'var(--text3)', marginTop: 3 }}>
              {accountOverridden
                ? <>manual · <span onClick={onAccountReset} style={{ color: 'var(--text2)', textDecoration: 'underline', cursor: 'pointer' }}>reset</span></>
                : (shipping.freeFreight ? 'auto · free freight'
                  : (shipping.accountFromPo ? 'auto · from PO'
                    : (shipping.shippingAccount ? 'auto · on file' : 'auto')))}
            </div>
          </div>
        </div>

        <div style={{ marginTop: 10, fontSize: 11.5, color: 'var(--text3)', lineHeight: 1.6 }}>
          {shipping.chargeBasis}
          {shipping.methodType === 'freight' && shipping.palletWeight > 0 && (
            <> · {shipping.baseWeight} lb product + {shipping.palletWeight} lb pallets</>
          )}
          {shipping.accountFromPo && <> · shipping account taken from PO</>}
        </div>
      </div>
    </div>
  );
}
